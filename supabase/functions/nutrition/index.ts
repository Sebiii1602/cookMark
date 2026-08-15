/**
 * cookMark — Nährwert-Schätzung.
 *
 * Bewusst eine eigene Funktion und ein eigener Knopf in der App: Nährwerte
 * sind der einzige Wert in cookMark, der nicht abgeschrieben, sondern geschätzt
 * ist. Das soll man bewusst auslösen und in der Anzeige sehen.
 *
 * Body: { "recipe_id": "…" }
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { activeVersion, formatAmount, type Recipe } from '../_shared/recipe-core.ts'

const MODEL = 'claude-opus-5'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const env = (key: string): string => Deno.env.get(key) ?? ''

const NUTRITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
  properties: {
    kcal: { type: 'number', description: 'Kilokalorien pro Portion' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
  },
}

const RULES = `Du schätzt Nährwerte aus einer Zutatenliste.

Rechne die Zutaten in übliche Nährwerte um und teile durch die Portionszahl. Gib Kilokalorien und Makronährstoffe pro Portion an, gerundet auf ganze Zahlen.

Zutaten ohne Mengenangabe ("Salz nach Geschmack", "Öl zum Braten") gehen mit einer üblichen Küchenmenge ein — bei Fett und Öl ist das relevant, bei Gewürzen zu vernachlässigen.

Ist keine Portionszahl angegeben, schätze sie aus der Gesamtmenge und rechne darauf.

Das hier ist ausdrücklich eine Schätzung und wird dem Nutzer auch so angezeigt. Liefere trotzdem die bestmögliche, keine absichtlich runde Zahl. Antworte ausschließlich im vorgegebenen JSON-Format.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405)

  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = env('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server nicht konfiguriert.' }, 500)
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt.' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) return json({ error: 'Nicht angemeldet.' }, 401)
  const { data: userData } = await admin.auth.getUser(bearer)
  const userId = userData.user?.id
  if (!userId) return json({ error: 'Nicht angemeldet.' }, 401)

  const { recipe_id: recipeId } = (await req.json().catch(() => ({}))) as { recipe_id?: string }
  if (!recipeId) return json({ error: 'recipe_id fehlt.' }, 400)

  const { data: row, error: loadError } = await admin
    .from('recipes')
    .select('*')
    .eq('id', recipeId)
    .eq('user_id', userId)
    .single()
  if (loadError || !row) return json({ error: 'Rezept nicht gefunden.' }, 404)

  const recipe = row as Recipe
  const version = activeVersion(recipe)
  if (version.ingredients.length === 0) {
    return json({ error: 'Ohne Zutaten lässt sich nichts schätzen.' }, 400)
  }

  const list = version.ingredients
    .map((i) => `- ${formatAmount(i.qty, i.unit)} ${i.name_display}`.replace(/\s+/g, ' '))
    .join('\n')
  const portions = version.servings !== null ? `${version.servings} Portionen` : 'Portionszahl unbekannt'

  const client = new Anthropic({ apiKey })
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: RULES,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: NUTRITION_SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      { role: 'user', content: `${recipe.title}\n${portions}\n\nZutaten:\n${list}` },
    ],
  })

  if (response.stop_reason === 'refusal') {
    return json({ error: 'Die Anfrage wurde abgelehnt.' }, 502)
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') return json({ error: 'Keine Antwort erhalten.' }, 502)

  const parsed = JSON.parse(block.text) as {
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }

  const nutrition = {
    ...parsed,
    per: 'portion' as const,
    estimated: true as const,
    model: MODEL,
    generated_at: new Date().toISOString(),
  }

  const { error: saveError } = await admin
    .from('recipes')
    .update({ nutrition, updated_at: new Date().toISOString() })
    .eq('id', recipeId)
  if (saveError) return json({ error: saveError.message }, 500)

  return json({ ok: true, nutrition })
})
