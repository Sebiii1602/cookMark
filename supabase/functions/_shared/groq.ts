/**
 * Extraktion über Groq — der kostenlose Weg.
 *
 * Bewusst mit blankem `fetch` statt einem SDK: dieselbe Datei läuft damit im
 * Browser (lokaler Modus, Text einfügen) und in der Edge Function.
 *
 * Modell ist `openai/gpt-oss-120b`, weil Groq dort **strict** JSON-Schema per
 * constrained decoding anbietet: das Modell kann strukturell nichts anderes
 * ausgeben als unser Schema. Für einen Abschreibe-Job ist das genau richtig —
 * die Regeln im Prompt verhindern erfundene Inhalte, das Schema verhindert
 * kaputte Form.
 *
 * Kein Bild-Pfad: gpt-oss ist textonly. Screenshots laufen weiter über Claude.
 */

import {
  buildPrompt,
  EXTRACTION_RULES,
  fromRawExtraction,
  RECIPE_SCHEMA,
  RefusalError,
  type ExtractedRecipe,
  type RawExtraction,
} from './extraction.ts'

export const GROQ_MODEL = 'openai/gpt-oss-120b'

/** Kontingent erschöpft — kein Fehler im Rezept, nur eine Frage der Geduld. */
export class RateLimitError extends Error {
  retryAfterSeconds: number | null

  constructor(message: string, retryAfterSeconds: number | null) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

interface GroqResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[]
  error?: { message?: string }
}

/**
 * Ruft Groq auf und gibt das strukturierte Rezept zurück.
 * `null` heißt: kein Rezept in der Vorlage.
 */
export async function extractWithGroq(input: {
  apiKey: string
  text: string
  /** Kontext wie „Instagram-Reel von @weelicious“ — hilft beim Titel, sonst nichts. */
  context?: string
  signal?: AbortSignal
}): Promise<ExtractedRecipe | null> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: input.signal,
    body: JSON.stringify({
      model: GROQ_MODEL,
      // Abschreiben ist keine Kreativaufgabe.
      temperature: 0,
      // Nicht großzügig setzen: Groqs kostenloses Kontingent rechnet 8000
      // Tokens pro Minute, und `max_completion_tokens` zählt voll mit —
      // reserviert man 16000, wird die Anfrage abgelehnt, bevor das Modell
      // ein Wort gelesen hat. Ein ausextrahiertes Rezept liegt bei ~2000.
      max_completion_tokens: 4000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'rezept', strict: true, schema: RECIPE_SCHEMA },
      },
      messages: [
        { role: 'system', content: EXTRACTION_RULES },
        { role: 'user', content: buildPrompt(input.text, input.context) },
      ],
    }),
  })

  const body = (await response.json()) as GroqResponse
  if (!response.ok) {
    // Das kostenlose Kontingent liegt bei 8000 Tokens pro Minute — beim
    // Nacheinander-Importieren mehrerer Rezepte läuft man da zuverlässig rein.
    // Groq schickt die Wartezeit im Header mit, also gib sie auch weiter.
    if (response.status === 429 || response.status === 413) {
      const retry = response.headers.get('retry-after')
      const wait = retry ? ` Warte ${Math.ceil(Number(retry))} Sekunden.` : ''
      throw new RateLimitError(
        `Groqs kostenloses Kontingent ist gerade ausgeschöpft.${wait} Das Rezept ist nicht verloren — einfach nochmal holen.`,
        retry ? Number(retry) : null,
      )
    }
    throw new Error(`Groq antwortet ${response.status}: ${body.error?.message ?? 'unbekannter Fehler'}`)
  }

  const message = body.choices?.[0]?.message
  if (message?.refusal) throw new RefusalError(message.refusal)
  if (!message?.content) return null

  return fromRawExtraction(JSON.parse(message.content) as RawExtraction)
}
