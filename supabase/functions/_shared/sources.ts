/**
 * Quellen-Adapter: aus einem Link das holen, was öffentlich dransteht —
 * Caption, Creator, Vorschaubild. Kein Login, keine Keys, kein Scraping von
 * Dingen, die hinter einer Anmeldung liegen.
 *
 * Bewusst ohne HTML-Parser-Abhängigkeit: wir lesen genau zwei bekannte
 * Seitenformen (TikTok-oEmbed, Instagram-Embed) plus schema.org-JSON-LD.
 */

import type { SourceType } from './recipe-core.ts'
import { parseIngredientLine, toStep } from './recipe-core.ts'
import type { Ingredient, Step } from './recipe-core.ts'

export interface SourceResult {
  sourceType: SourceType
  /** Der Text, aus dem ein Rezept werden kann — Caption oder Seitentext. */
  text: string
  author: string | null
  title: string | null
  imageUrl: string | null
  /**
   * Nur bei schema.org: ein bereits strukturiertes Rezept. Das ist die
   * verlässlichste Quelle überhaupt — exakt so, wie der Blog es meint,
   * ohne dass eine KI daran muss.
   */
  structured: StructuredRecipe | null
}

export interface StructuredRecipe {
  title: string
  servings: number | null
  totalMinutes: number | null
  ingredients: Ingredient[]
  steps: Step[]
  imageUrl: string | null
  author: string | null
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

export function detectSource(url: string): SourceType {
  const host = safeHost(url)
  if (host.endsWith('tiktok.com')) return 'tiktok'
  if (host.endsWith('instagram.com')) return 'instagram'
  return 'web'
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ------------------------------------------------------------------- HTML

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+|#\d+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/** Tags raus, Zeilenumbrüche rein — aus Embed-HTML wird wieder Fließtext. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8' },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// ----------------------------------------------------------------- TikTok

/**
 * TikToks oEmbed-Endpunkt ist öffentlich und liefert die vollständige Caption
 * im Feld `title` — bei Rezept-Accounts steht dort meistens alles drin.
 */
export async function fetchTikTok(url: string): Promise<SourceResult> {
  const raw = await getText(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
  const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  const caption = typeof data?.title === 'string' ? data.title : ''
  return {
    sourceType: 'tiktok',
    text: caption,
    author: typeof data?.author_name === 'string' ? data.author_name : null,
    title: null,
    imageUrl: typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null,
    structured: null,
  }
}

// -------------------------------------------------------------- Instagram

/** `instagram.com/p/CODE/` oder `/reel/CODE/` → CODE */
export function instagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

/**
 * Die Embed-Seite (`/embed/captioned/`) rendert die Caption serverseitig ins
 * HTML — ohne Login und ohne Token. Meta hat den Token-Zwang für die
 * oEmbed-API im Juni 2026 zurückgenommen, aber die liefert die Caption nicht,
 * deshalb ist sie hier nur der Rückfall für Autor und Bild.
 */
export async function fetchInstagram(url: string): Promise<SourceResult> {
  const code = instagramShortcode(url)
  const result: SourceResult = {
    sourceType: 'instagram',
    text: '',
    author: null,
    title: null,
    imageUrl: null,
    structured: null,
  }
  if (!code) return result

  const html = await getText(`https://www.instagram.com/p/${code}/embed/captioned/`)
  if (html) {
    // Inhalt des Caption-Blocks bis zum Kommentarbereich — ohne das öffnende
    // Tag selbst, sonst steht `class="Caption">` mit im Rezepttext.
    const block = html.match(/class="Caption"[^>]*>([\s\S]*?)(?=<div class="CaptionComments)/)
    if (block) {
      const user = block[1].match(/class="CaptionUsername"[^>]*>([^<]+)</)
      if (user) result.author = decodeEntities(user[1]).trim()
      // Den Usernamen-Link selbst nicht in den Text übernehmen
      result.text = htmlToText(block[1].replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, ''))
    }
    const img = html.match(/class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/)
    if (img) result.imageUrl = decodeEntities(img[1])
  }

  // Rückfall für Autor/Bild, wenn die Embed-Seite dichtmacht
  if (!result.imageUrl || !result.author) {
    const raw = await getText(
      `https://graph.facebook.com/v23.0/instagram_oembed?url=${encodeURIComponent(url)}&omitscript=true`,
    )
    try {
      const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
      if (data && !('error' in data)) {
        result.author ??= typeof data.author_name === 'string' ? data.author_name : null
        result.imageUrl ??= typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null
      }
    } catch {
      // egal — dann bleibt es eben ohne Bild
    }
  }

  return result
}

// ---------------------------------------------------------------- schema.org

type JsonValue = unknown

/** Nimmt das erste Element, wenn etwas als Array kommt (schema.org ist da unentschlossen). */
function first<T>(value: T | T[] | undefined | null): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null
  return value ?? null
}

function typeIncludes(node: Record<string, JsonValue>, wanted: string): boolean {
  const t = node['@type']
  if (typeof t === 'string') return t.toLowerCase() === wanted
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && x.toLowerCase() === wanted)
  return false
}

/** Sucht rekursiv nach dem Recipe-Knoten — der steckt oft in @graph oder in einer Liste. */
function findRecipeNode(node: JsonValue, depth = 0): Record<string, JsonValue> | null {
  if (depth > 6 || node === null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findRecipeNode(item, depth + 1)
      if (hit) return hit
    }
    return null
  }
  const obj = node as Record<string, JsonValue>
  if (typeIncludes(obj, 'recipe')) return obj
  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    if (key in obj) {
      const hit = findRecipeNode(obj[key], depth + 1)
      if (hit) return hit
    }
  }
  return null
}

/** ISO-8601-Dauer („PT1H15M“) in Minuten. */
export function isoDurationToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = value.match(/^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?/)
  if (!m) return null
  const days = Number(m[1] ?? 0)
  const hours = Number(m[2] ?? 0)
  const minutes = Number(m[3] ?? 0)
  const total = days * 1440 + hours * 60 + minutes
  return total > 0 ? Math.round(total) : null
}

/** `totalTime`, sonst prep + cook zusammen — was der Blog eben hergibt. */
function totalMinutesOf(node: Record<string, JsonValue>): number | null {
  const total = isoDurationToMinutes(node.totalTime)
  if (total) return total
  const sum =
    (isoDurationToMinutes(node.cookTime) ?? 0) + (isoDurationToMinutes(node.prepTime) ?? 0)
  return sum > 0 ? sum : null
}

function textOf(value: JsonValue): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (value && typeof value === 'object') {
    const obj = value as Record<string, JsonValue>
    if (typeof obj.name === 'string') return obj.name.trim() || null
    if (typeof obj.text === 'string') return obj.text.trim() || null
    if (typeof obj.url === 'string') return obj.url.trim() || null
  }
  return null
}

/** Anleitungen kommen als String, als Liste, oder als verschachtelte HowToSection. */
function collectSteps(value: JsonValue, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return out
  if (typeof value === 'string') {
    for (const part of htmlToText(value).split('\n')) {
      const trimmed = part.trim()
      if (trimmed) out.push(trimmed)
    }
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSteps(item, out, depth + 1)
    return out
  }
  const obj = value as Record<string, JsonValue>
  if ('itemListElement' in obj) return collectSteps(obj.itemListElement, out, depth + 1)
  const text = typeof obj.text === 'string' ? obj.text : typeof obj.name === 'string' ? obj.name : null
  if (text) {
    const clean = htmlToText(text).trim()
    if (clean) out.push(clean)
  }
  return out
}

/**
 * Liest ein schema.org/Recipe aus der Seite. Das ist der genaueste Weg
 * überhaupt: die Daten stammen wörtlich vom Blog, es ist keine KI beteiligt
 * und es kostet nichts.
 */
export function parseJsonLdRecipe(html: string): StructuredRecipe | null {
  const scripts = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const script of scripts) {
    let data: JsonValue
    try {
      data = JSON.parse(decodeEntities(script[1].trim()))
    } catch {
      continue
    }
    const node = findRecipeNode(data)
    if (!node) continue

    const title = textOf(node.name)
    if (!title) continue

    const rawIngredients = Array.isArray(node.recipeIngredient)
      ? node.recipeIngredient
      : Array.isArray(node.ingredients)
        ? node.ingredients
        : []

    const yieldText = textOf(first(node.recipeYield as JsonValue))
    const servings = yieldText ? (yieldText.match(/\d+/)?.[0] ?? null) : null

    const image = first(node.image as JsonValue)

    return {
      title,
      servings: servings ? Number(servings) : null,
      totalMinutes: totalMinutesOf(node),
      ingredients: rawIngredients
        .map((line) => (typeof line === 'string' ? line : textOf(line)))
        .filter((line): line is string => Boolean(line))
        .map((line) => parseIngredientLine(htmlToText(line))),
      steps: collectSteps(node.recipeInstructions).map((text) => toStep(text)),
      imageUrl: textOf(image),
      author: textOf(first(node.author as JsonValue)),
    }
  }
  return null
}

/** Meta-Tags als Rückfall, wenn die Seite kein JSON-LD hat. */
function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`,
    'i',
  )
  const m = html.match(re)
  return m ? decodeEntities(m[1]) : null
}

/** Grober Lesetext: Skripte und Styles raus, Rest als Fließtext. */
function readableText(html: string): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  return htmlToText(body).slice(0, 12000)
}

export async function fetchWeb(url: string): Promise<SourceResult> {
  const html = await getText(url)
  if (!html) {
    return { sourceType: 'web', text: '', author: null, title: null, imageUrl: null, structured: null }
  }
  const structured = parseJsonLdRecipe(html)
  return {
    sourceType: 'web',
    text: structured ? '' : readableText(html),
    author: structured?.author ?? metaContent(html, 'author'),
    title: structured?.title ?? metaContent(html, 'og:title'),
    imageUrl: structured?.imageUrl ?? metaContent(html, 'og:image'),
    structured,
  }
}

/** Ein Link rein, alles Öffentliche raus. */
export async function fetchSource(url: string): Promise<SourceResult> {
  switch (detectSource(url)) {
    case 'tiktok':
      return await fetchTikTok(url)
    case 'instagram':
      return await fetchInstagram(url)
    default:
      return await fetchWeb(url)
  }
}
