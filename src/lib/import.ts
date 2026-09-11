import { extractWithGroq } from '@core/groq.ts'
import { normalizeRecipeUrl } from '@core/recipe-core.ts'
import { addRecipe } from './db'
import { functionsUrl, supabase } from './supabase'
import { syncNow } from './sync'

/**
 * Der Groq-Schlüssel für den lokalen Text-Import.
 *
 * Nur in der Entwicklung: `import.meta.env.DEV` ist im Produktions-Build die
 * Konstante `false`, der Zweig fällt beim Bündeln weg und der Schlüssel landet
 * nicht im ausgelieferten JavaScript. Auf einem echten Deploy läuft der Import
 * über die Edge Function, die ihren eigenen Schlüssel als Secret hat.
 * (Nachgeprüft mit `npm run build` und `grep -r gsk_ dist/`.)
 */
const groqKey = (): string => (import.meta.env.DEV ? import.meta.env.VITE_GROQ_API_KEY || '' : '')

/**
 * Kann eingefügter Text ohne Server verarbeitet werden? Nur ohne Supabase —
 * hängt ein echtes Konto dran, gehört der Import dorthin, damit das Rezept
 * auch auf dem Handy ankommt.
 */
export function canImportTextLocally(): boolean {
  return !supabase && groqKey() !== ''
}

/**
 * Text direkt im Browser zu einem Rezept machen und lokal ablegen.
 *
 * Nur für den Text-Weg: Links scheitern im Browser an CORS (TikTok und
 * Instagram erlauben keine fremden Seiten), und Screenshots kann gpt-oss
 * nicht lesen. Beides bleibt Sache der Edge Function.
 *
 * Gibt die Rezept-ID zurück, oder null, wenn im Text kein Rezept stand.
 */
export async function importTextLocally(text: string): Promise<string | null> {
  const extracted = await extractWithGroq({ apiKey: groqKey(), text })
  if (!extracted) return null
  return addRecipe({
    title: extracted.title ?? text.split('\n')[0].slice(0, 70),
    source_type: 'text',
    lang: extracted.lang,
    servings: extracted.servings,
    total_minutes: extracted.totalMinutes,
    // Der Beleg für alles Extrahierte — ohne den ist nicht nachprüfbar,
    // ob etwas dazuerfunden wurde.
    raw_text: text,
    ingredients: extracted.ingredients,
    steps: extracted.steps,
    tags: extracted.tags,
  })
}

export interface ImportRequest {
  url?: string
  text?: string
  image?: { data: string; mediaType: string }
  /** Gesetzt, wenn eine bestehende „Rezept fehlt“-Karte ergänzt wird. */
  recipeId?: string
}

export class ImportUnavailableError extends Error {}

/**
 * Schickt einen Import-Auftrag an die Edge Function. Die antwortet sofort und
 * arbeitet im Hintergrund weiter — das Ergebnis kommt über den Sync herein.
 */
export async function requestImport(input: ImportRequest): Promise<string> {
  if (!supabase || !functionsUrl) {
    throw new ImportUnavailableError(
      'Der Import läuft über den Server — dafür braucht cookMark die Supabase-Zugangsdaten.',
    )
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ImportUnavailableError('Nicht angemeldet.')

  const res = await fetch(`${functionsUrl}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      url: input.url,
      text: input.text,
      image: input.image?.data,
      media_type: input.image?.mediaType,
      recipe_id: input.recipeId,
    }),
  })

  const body = (await res.json().catch(() => ({}))) as { import_id?: string; error?: string }
  if (!res.ok) throw new Error(body.error ?? `Der Server hat mit ${res.status} geantwortet.`)
  return body.import_id ?? ''
}

/**
 * Holt nach einem Import ein paar Mal nach — erst schnell, dann seltener.
 * Ein Reel mit Bild braucht typischerweise 5–15 Sekunden.
 */
export function pollForResult(onDone?: () => void): () => void {
  const delays = [1500, 2500, 4000, 6000, 8000, 12000, 20000]
  let index = 0
  let timer: number | undefined

  const tick = async (): Promise<void> => {
    await syncNow()
    onDone?.()
    if (index < delays.length) timer = window.setTimeout(() => void tick(), delays[index++])
  }
  timer = window.setTimeout(() => void tick(), delays[index++])

  return () => {
    if (timer) window.clearTimeout(timer)
    index = delays.length
  }
}

/** Erkennt, ob in der Zwischenablage etwas steht, das nach einem Rezept-Link aussieht. */
export function looksLikeRecipeUrl(value: string): boolean {
  return normalizeRecipeUrl(value) !== null
}

export { normalizeRecipeUrl }

/**
 * Bild aus dem Dateidialog in base64 — und dabei auf eine vernünftige Größe
 * bringen. Ein 12-Megapixel-Foto kostet ein Vielfaches an Bild-Tokens, ohne
 * dass die Schrift darauf besser lesbar würde; Screenshots bleiben unangetastet.
 */
export async function fileToImageInput(
  file: File,
  maxEdge = 2000,
): Promise<{ data: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file)
  const longEdge = Math.max(bitmap.width, bitmap.height)

  if (longEdge <= maxEdge) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
      reader.readAsDataURL(file)
    })
    bitmap.close()
    return { data, mediaType: file.type || 'image/jpeg' }
  }

  const scale = maxEdge / longEdge
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Bild konnte nicht verkleinert werden.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  return { data: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg' }
}
