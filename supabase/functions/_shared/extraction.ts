/**
 * Was beim Extrahieren unabhängig vom Anbieter gilt: die Regeln, das Schema
 * und die Nachbearbeitung.
 *
 * Bewusst ohne SDK und ohne Plattform-APIs — dieselbe Datei wird von der
 * Edge Function (Deno, Claude) und vom Browser (Vite, Groq) benutzt. Wenn es
 * zwei Anbieter gibt, dürfen sie sich in *einem* Punkt unterscheiden, nämlich
 * im Aufruf. Alles andere muss identisch sein, sonst extrahiert dieselbe
 * Caption je nach Weg etwas anderes.
 *
 * Absichtlich fragen wir NICHT nach `name_key`, `aisle` oder Timern. Die
 * rechnet der Rezept-Kern deterministisch aus (derselbe Code, der auch
 * Foodblog-Importe trägt). Was die KI nicht liefern muss, kann sie auch nicht
 * halluzinieren.
 */

import {
  canonicalUnit,
  guessAisle,
  normalizeName,
  stripDecoration,
  toMetric,
  toStep,
  type Ingredient,
  type RecipeTag,
  type Step,
} from './recipe-core.ts'

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

export const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found_recipe', 'title', 'servings', 'total_minutes', 'lang', 'ingredients', 'steps', 'tags'],
  properties: {
    found_recipe: {
      type: 'boolean',
      description: 'false, wenn die Vorlage kein Rezept enthält (nur Werbung, Hashtags, „DM für das Rezept“).',
    },
    title: nullable({ type: 'string' }),
    servings: nullable({ type: 'integer' }),
    total_minutes: nullable({ type: 'integer' }),
    lang: nullable({ type: 'string', description: 'ISO-639-1 der Vorlage, z. B. de oder en.' }),
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['raw', 'qty', 'unit', 'name_display', 'note', 'group'],
        properties: {
          raw: { type: 'string', description: 'Die Zeile wortwörtlich, wie sie in der Vorlage steht.' },
          qty: nullable({ type: 'number' }),
          unit: nullable({ type: 'string' }),
          name_display: { type: 'string' },
          note: nullable({ type: 'string' }),
          group: nullable({ type: 'string' }),
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'group'],
        properties: {
          text: { type: 'string' },
          group: nullable({ type: 'string' }),
        },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'kind'],
        properties: {
          label: { type: 'string' },
          kind: { type: 'string', enum: ['cuisine', 'time', 'diet', 'method', 'custom'] },
        },
      },
    },
  },
}

export const EXTRACTION_RULES = `Du überträgst Rezepte aus Social-Media-Posts, Screenshots und Webseiten in eine feste Struktur.

Du bist Abschreiber, nicht Koch. Gib ausschließlich wieder, was in der Vorlage steht.

Nicht ergänzen:
- Keine Zutat hinzufügen, die nicht dasteht — auch keine, die "natürlich dazugehört" (Salz, Öl, Wasser).
- Keine Mengen einsetzen, die fehlen. Fehlt die Menge, ist qty null. null heißt "steht nicht da", nicht "null davon".
- Keine Zubereitungsschritte erfinden, ergänzen oder ausschmücken, auch wenn das Rezept ohne sie unvollständig wirkt.
- Portionen und Gesamtzeit nur, wenn sie dastehen oder direkt aus den Schritten summierbar sind. Sonst null.
Ein halbes Rezept, dem man ansieht, dass es halb ist, ist brauchbar. Ein vollständig aussehendes, das zur Hälfte geraten ist, ist gefährlich.

found_recipe = false, wenn die Vorlage gar kein Rezept enthält. Häufigster Fall: Der Post wirbt damit, das Rezept per DM zu schicken ("Kommentier YES und ich schick es dir"). Auch bei reiner Werbung, einer bloßen Hashtag-Liste oder einem Bild ohne lesbaren Text. Dann alle übrigen Felder leer oder null lassen — nicht aus dem Bild oder dem Titel zusammenreimen, was es sein könnte.

Sprache: Nicht übersetzen. title, name_display, note, group und steps bleiben in der Sprache der Vorlage. lang gibt an, welche das ist.

Einheiten: Rechne nur um, wo die Umrechnung feststeht — oz, lb, cup, fl oz, stick Butter, °F. tbsp wird EL, tsp wird TL. Rechne NIEMALS über die Dichte um: "1 cup Mehl" wird 240 ml, nicht 120 g — dazu müsstest du raten, was in der Tasse ist. raw enthält immer die Originalzeile, ungeändert.

Steht in der Vorlage sowohl ein Haushaltsmaß als auch eine Grammangabe ("Cucumber 1x | 300g"), nimm die Grammangabe für qty/unit; raw behält trotzdem die ganze Zeile.

group ist eine Zwischenüberschrift der Vorlage ("Für die Soße", "FOR THE DILL AIOLI", "TO ASSEMBLE"), falls es eine gibt, sonst null. Es gibt group bei Zutaten UND bei Schritten, und beide benutzen dieselbe Schreibweise, damit sie zusammenfinden. Besteht ein Post aus mehreren Teilen, ordne jeden Schritt dem Teil zu, zu dem er gehört: "Alles verrühren" steht in solchen Posts mehrfach und meint jedes Mal etwas anderes. Schritte, die am Ende alles zusammenbauen, gehören in die Zusammenbau-Gruppe, falls die Vorlage eine benennt. Hat die Vorlage keine Überschriften, ist group überall null — erfinde keine.

Schreibe die Zutatennamen so ab, wie sie dastehen. Emoji, @-Handles und Rabattcodes musst du nicht selbst entfernen, das passiert danach automatisch — lass sie einfach stehen, statt den Namen umzuformulieren.

name_display ist nur die Zutat selbst, nicht die ganze Zeile. Was mit ihr geschieht oder wofür sie da ist, gehört in note: "sliced into sandwich-sized pieces", "melted", "gehackt", "to taste", "for frying", "abgetropft". Genauso Alternativen ("or 1.5 tsp dried dill") und Zusätze in Klammern. Aus "2 cloves garlic, minced or grated" wird also name_display "garlic" und note "minced or grated". Umformulieren sollst du dabei nichts — nur trennen. raw behält immer die ganze Zeile.

Tags: höchstens fünf, jeder muss aus der Vorlage belegbar sein. Küche nur bei erkennbarer Zuordnung, Zeit-Tag ("unter 30 Min") nur bei tatsächlich genannter Zeit, Diät-Tag ("vegetarisch") nur, wenn es dasteht oder die Zutatenliste es eindeutig hergibt. Im Zweifel weglassen.

Nimm keine Hashtags als Zutaten. Antworte ausschließlich im vorgegebenen JSON-Format, ohne Kommentar.`

export interface ExtractedRecipe {
  foundRecipe: boolean
  title: string | null
  servings: number | null
  totalMinutes: number | null
  lang: string | null
  ingredients: Ingredient[]
  steps: Step[]
  tags: RecipeTag[]
}

export interface RawExtraction {
  found_recipe: boolean
  title: string | null
  servings: number | null
  total_minutes: number | null
  lang: string | null
  ingredients: {
    raw: string
    qty: number | null
    unit: string | null
    name_display: string
    note: string | null
    group: string | null
  }[]
  steps: { text: string; group: string | null }[]
  tags: { label: string; kind: RecipeTag['kind'] }[]
}

export interface ImageInput {
  mediaType: string
  /** base64, ohne data:-Präfix */
  data: string
}

/** Die KI hat abgeschrieben — der Kern rechnet aus, was sich ausrechnen lässt. */
function toIngredient(raw: RawExtraction['ingredients'][number]): Ingredient {
  // Die Einheit erst durch dieselbe Tabelle schicken wie beim Foodblog-Import.
  // Ohne das kam „3 cloves garlic“ als „3 cloves“ durch statt als „3 Zehen“ —
  // das Modell übersetzt ja absichtlich nicht. Kennen wir die Einheit nicht
  // („1 inch ginger“), bleibt sie stehen, statt verlorenzugehen.
  const unit = canonicalUnit(raw.unit) ?? raw.unit
  const metric = toMetric(raw.qty, unit)
  const nameDisplay = stripDecoration(raw.name_display) || raw.name_display
  const nameKey = normalizeName(nameDisplay)
  return {
    raw: raw.raw,
    qty: metric.qty,
    unit: metric.unit,
    name_display: nameDisplay,
    name_key: nameKey,
    note: raw.note === null ? null : stripDecoration(raw.note) || null,
    group: raw.group,
    aisle: nameKey ? guessAisle(nameKey) : 'sonstiges',
  }
}

/**
 * Rohe Modellantwort → fertiges Rezept. `null` heißt: in der Vorlage stand
 * kein Rezept (die Karte wird `needs_recipe`).
 *
 * Beide Anbieter laufen hier durch, damit eine Caption über Groq und über
 * Claude dieselben Zutaten ergibt.
 */
export function fromRawExtraction(parsed: RawExtraction): ExtractedRecipe | null {
  if (!parsed.found_recipe) return null
  return {
    foundRecipe: true,
    title: parsed.title,
    servings: parsed.servings,
    totalMinutes: parsed.total_minutes,
    lang: parsed.lang,
    ingredients: (parsed.ingredients ?? []).map(toIngredient),
    steps: (parsed.steps ?? []).map((step) => toStep(step.text, step.group)),
    // Jeder KI-Tag ist erst mal eine Behauptung — bestätigt wird nach dem Kochen.
    tags: (parsed.tags ?? []).map((tag) => ({
      label: tag.label,
      kind: tag.kind,
      source: 'ai' as const,
      confirmed: null,
    })),
  }
}

/** Der Nutzertext, den beide Anbieter identisch vorgesetzt bekommen. */
export function buildPrompt(text: string, context?: string): string {
  const header = context ? `Quelle: ${context}\n\n` : ''
  return text
    ? `${header}Vorlage:\n\n${text}`
    : `${header}Die Vorlage besteht nur aus dem Bild bzw. den Bildern oben.`
}

export class RefusalError extends Error {}
