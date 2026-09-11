/**
 * cookMark — Import-Endpunkt.
 *
 * Ein Eingang für alles: den iOS-Kurzbefehl (Teilen → „Rezept speichern“),
 * das Einfügen-Sheet in der App und später den Stapel-Import.
 *
 * Der Aufruf antwortet sofort; die eigentliche Arbeit läuft im Hintergrund
 * weiter, damit der Kurzbefehl auf dem iPhone nicht wartet.
 *
 * Body (JSON), genau eins davon:
 *   { "url":  "https://www.instagram.com/reel/…" }
 *   { "text": "200 g Mehl\n…" }
 *   { "image": "<base64>", "media_type": "image/jpeg" }
 * Optional bei allen: { "recipe_id": "…" } — dann wird eine bestehende Karte
 * ergänzt, statt eine neue anzulegen (Screenshot nachreichen).
 *
 * Auth: entweder `Authorization: Bearer <Supabase-JWT>` (aus der App)
 * oder `x-import-token: <IMPORT_TOKEN>` (aus dem Kurzbefehl).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchSource, type SourceResult } from '../_shared/sources.ts'
import { extractRecipe, MODEL, RefusalError, type ImageInput } from './extract.ts'
import { extractWithGroq } from '../_shared/groq.ts'
import type { Ingredient, Recipe, SourceType, Step } from '../_shared/recipe-core.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-import-token, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const env = (key: string): string => Deno.env.get(key) ?? ''

interface Payload {
  url?: string
  text?: string
  image?: string
  media_type?: string
  recipe_id?: string
}

/**
 * Wann ist ein Text zu dünn, um ein Rezept zu sein? Lieber einmal zu oft
 * nachfragen als eine KI-Anfrage auf drei Hashtags zu verschwenden.
 */
function looksTooThin(text: string): boolean {
  const withoutTags = text.replace(/#[\p{L}\d_]+/gu, '').trim()
  return withoutTags.length < 40
}

/** Lädt das Vorschaubild und legt es im Storage ab — CDN-Links laufen ab. */
async function copyImage(
  admin: SupabaseClient,
  userId: string,
  recipeId: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const path = `${userId}/${recipeId}.${ext}`
    const { error } = await admin.storage
      .from('recipe-images')
      .upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type, upsert: true })
    return error ? null : path
  } catch {
    return null
  }
}

function buildRecipeRow(input: {
  id: string
  userId: string
  title: string
  sourceType: SourceType
  sourceUrl: string | null
  author: string | null
  servings: number | null
  totalMinutes: number | null
  lang: string | null
  rawText: string | null
  ingredients: Ingredient[]
  steps: Step[]
  tags: Recipe['tags']
  status: Recipe['status']
}): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    id: input.id,
    user_id: input.userId,
    title: input.title,
    source_type: input.sourceType,
    source_url: input.sourceUrl,
    source_author: input.author,
    image_path: null,
    servings: input.servings,
    total_minutes: input.totalMinutes,
    status: input.status,
    lang: input.lang,
    raw_text: input.rawText,
    ingredients: input.ingredients,
    steps: input.steps,
    tags: input.tags,
    nutrition: null,
    // Die eigene Fassung entsteht erst beim Bearbeiten in der App
    variant: null,
    created_at: now,
    updated_at: now,
  }
}

/** Titel für eine Karte, in der (noch) kein Rezept steckt. */
function fallbackTitle(source: SourceResult, url: string): string {
  const firstLine = source.text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 3 && !l.startsWith('#'))
  if (source.title) return source.title
  if (firstLine) return firstLine.length > 70 ? `${firstLine.slice(0, 67)}…` : firstLine
  if (source.author) return `Post von ${source.author}`
  return url
}

async function process(
  admin: SupabaseClient,
  userId: string,
  importId: string,
  payload: Payload,
): Promise<void> {
  const touch = (patch: Record<string, unknown>) =>
    admin
      .from('imports')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', importId)

  try {
    await touch({ status: 'running' })

    const url = payload.url?.trim() ?? null
    let source: SourceResult = {
      sourceType: payload.image ? 'image' : 'text',
      text: payload.text ?? '',
      author: null,
      title: null,
      imageUrl: null,
      structured: null,
    }
    if (url) source = await fetchSource(url)

    const images: ImageInput[] = payload.image
      ? [{ mediaType: payload.media_type ?? 'image/jpeg', data: payload.image }]
      : []

    const recipeId = payload.recipe_id ?? crypto.randomUUID()

    // 1. schema.org: exakt vom Blog, ohne KI, ohne Kosten
    if (source.structured) {
      const s = source.structured
      const row = buildRecipeRow({
        id: recipeId,
        userId,
        title: s.title,
        sourceType: 'web',
        sourceUrl: url,
        author: s.author ?? source.author,
        servings: s.servings,
        totalMinutes: s.totalMinutes,
        lang: null,
        rawText: null,
        ingredients: s.ingredients,
        steps: s.steps,
        tags: [],
        status: 'complete',
      })
      const { error } = await admin.from('recipes').upsert(row, { onConflict: 'id' })
      if (error) throw error
      if (s.imageUrl) {
        const path = await copyImage(admin, userId, recipeId, s.imageUrl)
        if (path) await admin.from('recipes').update({ image_path: path, updated_at: new Date().toISOString() }).eq('id', recipeId)
      }
      await touch({ status: 'done', recipe_id: recipeId })
      return
    }

    // 2. Kein verwertbarer Text und kein Bild → Karte anlegen, aber nichts erfinden
    if (images.length === 0 && looksTooThin(source.text)) {
      const row = buildRecipeRow({
        id: recipeId,
        userId,
        title: fallbackTitle(source, url ?? 'Ohne Titel'),
        sourceType: source.sourceType,
        sourceUrl: url,
        author: source.author,
        servings: null,
        totalMinutes: null,
        lang: null,
        rawText: source.text || null,
        ingredients: [],
        steps: [],
        tags: [],
        status: 'needs_recipe',
      })
      const { error } = await admin.from('recipes').upsert(row, { onConflict: 'id' })
      if (error) throw error
      if (source.imageUrl) {
        const path = await copyImage(admin, userId, recipeId, source.imageUrl)
        if (path) await admin.from('recipes').update({ image_path: path, updated_at: new Date().toISOString() }).eq('id', recipeId)
      }
      await touch({ status: 'needs_input', recipe_id: recipeId })
      return
    }

    // 3. KI: aus Caption, Screenshot oder eingefügtem Text ein Rezept machen.
    //
    // Groq zuerst, weil kostenlos — aber `openai/gpt-oss-120b` liest keine
    // Bilder. Sobald ein Screenshot dabei ist, führt kein Weg an Claude vorbei.
    // Beide Wege benutzen dieselben Regeln und dieselbe Nachbearbeitung aus
    // `_shared/extraction.ts`, damit derselbe Post nicht je nach Anbieter etwas
    // anderes ergibt.
    const groqKey = env('GROQ_API_KEY')
    const anthropicKey = env('ANTHROPIC_API_KEY')
    const needsVision = images.length > 0

    if (needsVision && !anthropicKey) {
      throw new Error('Für Screenshots braucht es ANTHROPIC_API_KEY — Groq liest keine Bilder.')
    }
    if (!needsVision && !groqKey && !anthropicKey) {
      throw new Error('Weder GROQ_API_KEY noch ANTHROPIC_API_KEY ist gesetzt.')
    }

    const context = [
      source.sourceType !== 'text' ? source.sourceType : null,
      source.author ? `von ${source.author}` : null,
    ]
      .filter(Boolean)
      .join(' ')

    const useGroq = !needsVision && groqKey !== ''
    const extracted = useGroq
      ? await extractWithGroq({
          apiKey: groqKey,
          text: source.text,
          context: context || undefined,
        })
      : await extractRecipe({
          apiKey: anthropicKey,
          text: source.text,
          images,
          context: context || undefined,
        })

    const hasRecipe = extracted !== null
    const row = buildRecipeRow({
      id: recipeId,
      userId,
      title: extracted?.title ?? fallbackTitle(source, url ?? 'Ohne Titel'),
      sourceType: source.sourceType,
      sourceUrl: url,
      author: source.author,
      servings: extracted?.servings ?? null,
      totalMinutes: extracted?.totalMinutes ?? null,
      lang: extracted?.lang ?? null,
      rawText: source.text || null,
      ingredients: extracted?.ingredients ?? [],
      steps: extracted?.steps ?? [],
      tags: extracted?.tags ?? [],
      status: hasRecipe ? 'complete' : 'needs_recipe',
    })

    const { error } = await admin.from('recipes').upsert(row, { onConflict: 'id' })
    if (error) throw error

    if (source.imageUrl) {
      const path = await copyImage(admin, userId, recipeId, source.imageUrl)
      if (path) await admin.from('recipes').update({ image_path: path, updated_at: new Date().toISOString() }).eq('id', recipeId)
    }

    await touch({ status: hasRecipe ? 'done' : 'needs_input', recipe_id: recipeId })
  } catch (err) {
    const message =
      err instanceof RefusalError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    console.error('[import]', message)
    await touch({ status: 'failed', error: message })
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405)

  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server nicht konfiguriert.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Wer darf hier importieren? Entweder ein angemeldeter App-Nutzer …
  let userId: string | null = null
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (bearer) {
    const { data } = await admin.auth.getUser(bearer)
    userId = data.user?.id ?? null
  }
  // … oder der Kurzbefehl mit seinem persönlichen Token.
  const token = req.headers.get('x-import-token')
  if (!userId && token && env('IMPORT_TOKEN') && token === env('IMPORT_TOKEN')) {
    userId = env('IMPORT_USER_ID') || null
  }
  if (!userId) return json({ error: 'Nicht angemeldet.' }, 401)

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return json({ error: 'Body ist kein JSON.' }, 400)
  }
  if (!payload.url && !payload.text && !payload.image) {
    return json({ error: 'Es braucht url, text oder image.' }, 400)
  }

  const importId = crypto.randomUUID()
  const kind = payload.url ? 'url' : payload.image ? 'image' : 'text'
  const { error } = await admin.from('imports').insert({
    id: importId,
    user_id: userId,
    kind,
    payload: (payload.url ?? payload.text ?? 'Bild').slice(0, 300),
    status: 'queued',
  })
  if (error) return json({ error: error.message }, 500)

  // Sofort antworten, im Hintergrund weiterarbeiten — der Kurzbefehl auf dem
  // iPhone soll nicht auf Claude warten.
  const work = process(admin, userId, importId, payload)
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work

  return json({ ok: true, import_id: importId, model: MODEL }, 202)
})
