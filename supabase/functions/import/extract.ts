/**
 * Die Claude-Seite des Imports.
 *
 * Regeln, Schema und Nachbearbeitung stehen in `_shared/extraction.ts` und
 * sind mit dem Groq-Weg identisch — hier steht nur, wie der Aufruf aussieht.
 * Claude bleibt der Weg für **Screenshots**: gpt-oss ist textonly.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  buildPrompt,
  EXTRACTION_RULES,
  fromRawExtraction,
  RECIPE_SCHEMA,
  RefusalError,
  type ExtractedRecipe,
  type ImageInput,
  type RawExtraction,
} from '../_shared/extraction.ts'

export const MODEL = 'claude-opus-5'

export { RefusalError }
export type { ExtractedRecipe, ImageInput }

/**
 * Ruft Claude auf und gibt das strukturierte Rezept zurück.
 * `null` heißt: kein Rezept in der Vorlage (die Karte wird `needs_recipe`).
 */
export async function extractRecipe(input: {
  apiKey: string
  text: string
  images?: ImageInput[]
  /** Kontext wie „Instagram-Reel von @weelicious“ — hilft beim Titel, sonst nichts. */
  context?: string
}): Promise<ExtractedRecipe | null> {
  const client = new Anthropic({ apiKey: input.apiKey })

  const content: Anthropic.ContentBlockParam[] = []
  for (const image of input.images ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType as 'image/jpeg', data: image.data },
    })
  }
  content.push({ type: 'text', text: buildPrompt(input.text, input.context) })

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: EXTRACTION_RULES,
    // Wenig Aufwand reicht: Abschreiben ist keine Denkaufgabe, und der Import
    // soll schnell und billig sein.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new RefusalError('Die Anfrage wurde von den Sicherheitsfiltern abgelehnt.')
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return null

  return fromRawExtraction(JSON.parse(textBlock.text) as RawExtraction)
}
