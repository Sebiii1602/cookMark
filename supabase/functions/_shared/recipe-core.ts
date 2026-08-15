/**
 * Rezept-Kern — Datenmodell und die reine Logik drumherum.
 *
 * Läuft unverändert im Browser (Vite, via `@core/…`) und in der Deno-Edge-Function
 * (via `../_shared/recipe-core.ts`). Deshalb: kein Import, keine Plattform-APIs.
 *
 * Grundsatz für alles hier drin: **nichts dazuerfinden**. Was nicht eindeutig
 * aus dem Text hervorgeht, bleibt `null` — eine fehlende Menge ist eine
 * Information, eine geratene ist ein Fehler.
 */

// ------------------------------------------------------------------ Modell

export type SourceType = 'tiktok' | 'instagram' | 'web' | 'image' | 'text' | 'manual'

/**
 * `needs_recipe` = Bild, Link und Creator sind da, aber im Post stand kein
 * Rezept (der „Kommentier YES und ich schick's dir per DM“-Fall).
 */
export type RecipeStatus = 'complete' | 'needs_recipe'

export type Aisle =
  | 'obst_gemuese'
  | 'kuehlregal'
  | 'fleisch_fisch'
  | 'trocken'
  | 'konserven'
  | 'tiefkuehl'
  | 'backen'
  | 'gewuerze'
  | 'getraenke'
  | 'sonstiges'

export interface Ingredient {
  /** Originalzeile, wie sie im Post stand („1 cup flour“) — geht nie verloren. */
  raw: string
  /** Nur gesetzt, wenn eindeutig aus `raw` lesbar. null heißt „nicht bezifferbar“, nicht „0“. */
  qty: number | null
  unit: string | null
  name_display: string
  /** Kleingeschrieben und entstopfwortet — der Schlüssel fürs Zusammenrechnen. */
  name_key: string
  note: string | null
  /** Abschnitt wie „Für die Soße“. */
  group: string | null
  aisle: Aisle | null
}

export interface Step {
  text: string
  timer_seconds: number | null
  /**
   * Abschnitt wie „Für die Soße“ — dasselbe Feld wie bei den Zutaten.
   * Viele Posts bauen ein Gericht aus mehreren Teilen, und dann steht
   * „Alles verrühren“ dreimal da und meint jedes Mal etwas anderes.
   */
  group: string | null
}

export type TagKind = 'cuisine' | 'time' | 'diet' | 'method' | 'custom'

/**
 * Ein Tag ist eine Behauptung. Von der KI kommt er als Vorschlag
 * (`source: 'ai'`, `confirmed: null`); nach dem Kochen wird er bestätigt
 * oder widerlegt.
 */
export interface RecipeTag {
  label: string
  kind: TagKind
  source: 'ai' | 'user'
  confirmed: boolean | null
}

export interface Nutrition {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  per: 'portion'
  estimated: true
  model: string
  generated_at: string
}

/**
 * Deine eigene Fassung eines Rezepts. Das Original bleibt daneben unangetastet
 * stehen — beim Nachkochen will man beides sehen können: was dastand und was
 * man tatsächlich draus gemacht hat.
 */
export interface RecipeVariant {
  servings: number | null
  total_minutes: number | null
  ingredients: Ingredient[]
  steps: Step[]
  /** Was du geändert hast und warum („halbe Chili, dafür doppelt Knoblauch“). */
  note: string | null
  updated_at: string
}

export interface Recipe {
  id: string
  title: string
  source_type: SourceType
  source_url: string | null
  source_author: string | null
  /** Pfad im Supabase-Storage — Insta/TikTok-CDN-URLs laufen ab, wir kopieren das Bild. */
  image_path: string | null
  servings: number | null
  total_minutes: number | null
  status: RecipeStatus
  /** Sprache des Originals. Wir übersetzen nicht; das hier sagt nur, was drinsteht. */
  lang: string | null
  /** Original-Caption/Quelltext — der Beleg für alles Extrahierte. */
  raw_text: string | null
  ingredients: Ingredient[]
  steps: Step[]
  tags: RecipeTag[]
  nutrition: Nutrition | null
  /** null = es gibt (noch) keine eigene Fassung, nur das Original. */
  variant: RecipeVariant | null
  created_at: string
  updated_at: string
}

/** Die gerade angezeigte Fassung — Original oder eigene. */
export interface RecipeVersion {
  servings: number | null
  total_minutes: number | null
  ingredients: Ingredient[]
  steps: Step[]
}

export function originalVersion(recipe: Recipe): RecipeVersion {
  return {
    servings: recipe.servings,
    total_minutes: recipe.total_minutes,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  }
}

/**
 * Die Fassung, mit der gearbeitet wird: die eigene, wenn es sie gibt, sonst
 * das Original. Kochmodus, Einkaufsliste und Nährwerte hängen daran.
 */
export function activeVersion(recipe: Recipe): RecipeVersion {
  if (!recipe.variant) return originalVersion(recipe)
  return {
    servings: recipe.variant.servings,
    total_minutes: recipe.variant.total_minutes,
    ingredients: recipe.variant.ingredients,
    steps: recipe.variant.steps,
  }
}

// ---------------------------------------------------------------- Einheiten

/**
 * Schreibweisen → kanonische Einheit. Absichtlich großzügig bei der Eingabe
 * und knapp bei der Ausgabe.
 */
const UNIT_ALIASES: Record<string, string> = {
  // Masse
  g: 'g', gr: 'g', gramm: 'g', gramme: 'g', grams: 'g', gram: 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg',
  mg: 'mg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  // Volumen
  ml: 'ml', milliliter: 'ml', millilitre: 'ml',
  cl: 'cl',
  l: 'l', liter: 'l', litre: 'l', liters: 'l',
  cup: 'cup', cups: 'cup', tasse: 'cup', tassen: 'cup',
  pint: 'pint', pints: 'pint', quart: 'quart', quarts: 'quart',
  // Löffel
  el: 'EL', essloeffel: 'EL', esslöffel: 'EL', tbsp: 'EL', tablespoon: 'EL', tablespoons: 'EL',
  tl: 'TL', teeloeffel: 'TL', teelöffel: 'TL', tsp: 'TL', teaspoon: 'TL', teaspoons: 'TL',
  // Stückiges und Küchensprache
  stk: 'Stk', stück: 'Stk', stueck: 'Stk', st: 'Stk', piece: 'Stk', pieces: 'Stk',
  prise: 'Prise', prisen: 'Prise', pinch: 'Prise',
  bund: 'Bund', bunch: 'Bund',
  zehe: 'Zehe', zehen: 'Zehe', clove: 'Zehe', cloves: 'Zehe',
  dose: 'Dose', dosen: 'Dose', can: 'Dose', cans: 'Dose',
  pck: 'Pck', packung: 'Pck', packungen: 'Pck', paket: 'Pck', package: 'Pck',
  blatt: 'Blatt', blätter: 'Blatt', blaetter: 'Blatt',
  scheibe: 'Scheibe', scheiben: 'Scheibe', slice: 'Scheibe', slices: 'Scheibe',
  stange: 'Stange', stangen: 'Stange', stalk: 'Stange', stick: 'stick', sticks: 'stick',
  handvoll: 'Handvoll', handful: 'Handvoll',
  schuss: 'Schuss', spritzer: 'Spritzer', dash: 'Spritzer',
}

/**
 * Umrechnung in metrische Einheiten. Hier stehen **nur definitorische**
 * Umrechnungen (1 lb = 453,6 g, 1 cup = 240 ml, 1 Stick Butter = 113 g) —
 * keine dichteabhängigen wie „1 cup Mehl = 120 g“. Die hingen an Annahmen über
 * die Zutat, und geratene Gramm sehen genauso aus wie gemessene.
 */
const TO_METRIC: Record<string, { factor: number; unit: string }> = {
  kg: { factor: 1000, unit: 'g' },
  mg: { factor: 0.001, unit: 'g' },
  lb: { factor: 453.6, unit: 'g' },
  oz: { factor: 28.35, unit: 'g' },
  stick: { factor: 113, unit: 'g' },
  l: { factor: 1000, unit: 'ml' },
  cl: { factor: 10, unit: 'ml' },
  cup: { factor: 240, unit: 'ml' },
  pint: { factor: 473, unit: 'ml' },
  quart: { factor: 946, unit: 'ml' },
}

/** Einheiten, in denen sich Bruchteile albern lesen („0,5 g Salz“). */
const WHOLE_ISH = new Set(['g', 'ml', 'kcal'])

export function canonicalUnit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!key) return null
  return UNIT_ALIASES[key] ?? null
}

/**
 * Rechnet in g/ml um, wo es eindeutig ist. Alles andere (EL, Stk, Prise, …)
 * bleibt wie es ist — „2 Zehen Knoblauch“ will niemand in Gramm lesen.
 */
export function toMetric(qty: number | null, unit: string | null): { qty: number | null; unit: string | null } {
  if (qty === null || !unit) return { qty, unit }
  const conv = TO_METRIC[unit]
  if (!conv) return { qty, unit }
  return { qty: roundNice(qty * conv.factor), unit: conv.unit }
}

// ------------------------------------------------------------------ Zahlen

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('')

/**
 * Liest eine führende Menge: „2“, „1,5“, „1/2“, „1 1/2“, „1½“, „½“.
 * Bei Bereichen („2-3 Eier“, „2 bis 3“) gewinnt die **untere** Zahl — lieber
 * zu wenig nachlegen als zu viel drin haben; `raw` zeigt ohnehin das Original.
 */
export function parseLeadingAmount(input: string): { qty: number; rest: string } | null {
  const s = input.trimStart()

  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    // 1 1/2
    [/^(\d+)\s+(\d+)\s*\/\s*(\d+)/, (m) => Number(m[1]) + Number(m[2]) / Number(m[3])],
    // 1½
    [new RegExp(`^(\\d+)\\s*([${FRACTION_CHARS}])`), (m) => Number(m[1]) + UNICODE_FRACTIONS[m[2]]],
    // 1/2
    [/^(\d+)\s*\/\s*(\d+)/, (m) => Number(m[1]) / Number(m[2])],
    // ½
    [new RegExp(`^([${FRACTION_CHARS}])`), (m) => UNICODE_FRACTIONS[m[1]]],
    // 1,5 / 1.5 / 200
    [/^(\d+(?:[.,]\d+)?)/, (m) => Number(m[1].replace(',', '.'))],
  ]

  for (const [re, toValue] of patterns) {
    const m = s.match(re)
    if (!m) continue
    const qty = toValue(m)
    if (!Number.isFinite(qty)) continue
    let rest = s.slice(m[0].length)
    // Bereich: die zweite Zahl schlucken, die erste behalten
    const range = rest.match(/^\s*(?:-|–|—|bis|to)\s*\d+(?:[.,/]\d+)?\s*/i)
    if (range) rest = rest.slice(range[0].length)
    return { qty, rest }
  }
  return null
}

/** Rundet auf etwas, das man in einer Küche auch abmessen kann. */
export function roundNice(n: number): number {
  const abs = Math.abs(n)
  if (abs >= 20) return Math.round(n)
  if (abs >= 2) return Math.round(n * 2) / 2
  return Math.round(n * 4) / 4
}

const NICE_FRACTIONS: [number, string][] = [
  [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'],
]

/** „1½“, „¾“, „300“, „2,5“ — deutsche Schreibweise, Brüche wo es sich anbietet. */
export function formatQty(qty: number): string {
  const whole = Math.floor(qty)
  const frac = qty - whole
  if (frac > 0.001) {
    const hit = NICE_FRACTIONS.find(([value]) => Math.abs(frac - value) < 0.02)
    if (hit) return whole === 0 ? hit[1] : `${whole}${hit[1]}`
  }
  const rounded = Math.round(qty * 100) / 100
  return String(rounded).replace('.', ',')
}

/** Zählbare Einheiten im Plural — „2 Zehe Knoblauch“ liest sich falsch. */
const UNIT_PLURAL: Record<string, string> = {
  Zehe: 'Zehen',
  Prise: 'Prisen',
  Dose: 'Dosen',
  Scheibe: 'Scheiben',
  Stange: 'Stangen',
  Blatt: 'Blätter',
  Packung: 'Packungen',
}

/** Reine Anzeigefrage: gespeichert wird immer die kanonische Einheit. */
export function formatUnit(qty: number | null, unit: string | null): string {
  if (!unit) return ''
  if (qty === null || qty <= 1) return unit
  return UNIT_PLURAL[unit] ?? unit
}

/** „300 g“, „1½ EL“, „2 Zehen“ — ohne Menge nur die Einheit, ohne beides leer. */
export function formatAmount(qty: number | null, unit: string | null): string {
  if (qty === null) return unit ?? ''
  const q = WHOLE_ISH.has(unit ?? '') ? String(Math.round(qty)) : formatQty(qty)
  const u = formatUnit(qty, unit)
  return u ? `${q} ${u}` : q
}

// --------------------------------------------------------------------- Deko

// ️ = Variantenselektor, ‍ = Zero-Width-Joiner. Beide sind unsichtbar
// und bleiben sonst als Geisterzeichen im Namen stehen.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D]/gu

// Negativer Lookbehind statt „Anfang oder Leerzeichen“: Handles kleben oft
// direkt an einer Klammer („(@violife_foods)“), aber eine Mailadresse wie
// foo@bar.com soll nicht angeknabbert werden.
const HANDLE = /(?<!\w)@[\w.]+/g

/** Ab hier ist der Rest der Zeile Werbung und keine Zutat mehr. */
const PROMO_TAIL =
  /\s*\b(?:discount\s+code|promo\s+code|rabattcode|use\s+code|link\s+in\s+bio|werbung|anzeige)\b.*$/i

/**
 * Räumt Emoji, Marken-Handles und Rabattcodes aus einem Zutatennamen.
 *
 * Captions sind Werbeflächen: „shredded vegan mozzarella (@violife_foods)“,
 * „1 scoop vanilla whey @legion discount code KORY to save 20 percent!“, und
 * deutsche Foodblogger setzen gern ein 🧅 hinter jede Zwiebel. Auf einem
 * Einkaufszettel steht davon nichts Brauchbares.
 *
 * Betrifft ausschließlich die Anzeige. `raw` behält die Zeile wortwörtlich,
 * damit nachprüfbar bleibt, was wirklich im Post stand — und die
 * Zubereitungsschritte bleiben unangetastet, die Emojis dort sind die Stimme
 * des Autors und stören niemanden.
 *
 * Gibt einen leeren String zurück, wenn nichts übrig bleibt; was dann passiert,
 * entscheidet der Aufrufer (Name: Original behalten, Zusatz: weglassen).
 */
export function stripDecoration(text: string): string {
  return text
    .replace(EMOJI, ' ')
    .replace(HANDLE, ' ')
    .replace(PROMO_TAIL, '')
    // Stand nur ein Handle in der Klammer, ist jetzt die Klammer selbst Müll.
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:·•\-–—]+|[\s,;:·•\-–—]+$/g, '')
    .trim()
}

// -------------------------------------------------------------------- Namen

/** Wörter, die nichts über die Zutat sagen, sondern über ihre Behandlung. */
const QUALIFIERS = new Set([
  'frisch', 'frische', 'frischer', 'frisches', 'frischen',
  'gehackt', 'gehackte', 'gehackter', 'gehacktes', 'gehackten',
  'gemahlen', 'gemahlene', 'gemahlener', 'gemahlenes',
  'gewuerfelt', 'gewürfelt', 'gewuerfelte', 'gewürfelte',
  'gerieben', 'geriebene', 'geriebener', 'geriebenes',
  'getrocknet', 'getrocknete', 'getrockneter', 'getrocknetes',
  'weich', 'weiche', 'weicher', 'zimmerwarm', 'zimmerwarme',
  'bio', 'gross', 'groß', 'grosse', 'große', 'klein', 'kleine', 'kleiner',
  'fresh', 'freshly', 'chopped', 'minced', 'ground', 'grated', 'dried', 'large', 'small',
])

/** Ein paar Klassiker, die überall anders heißen und trotzdem dasselbe sind. */
const SYNONYMS: Record<string, string> = {
  'weizenmehl': 'mehl', 'mehl type 405': 'mehl', 'all purpose flour': 'mehl', 'flour': 'mehl',
  'olivenol': 'olivenoel', 'olive oil': 'olivenoel',
  'salt': 'salz', 'pepper': 'pfeffer', 'sugar': 'zucker', 'butter': 'butter',
  'garlic': 'knoblauch', 'onion': 'zwiebel', 'onions': 'zwiebel',
  'egg': 'ei', 'eggs': 'ei', 'eier': 'ei',
  'milk': 'milch', 'cream': 'sahne', 'water': 'wasser',
}

/** ä→ae usw., damit „Zwiebel“ und „zwiebel“ und „ZWIEBELN“ derselbe Schlüssel werden. */
function deaccent(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Vorsichtige Plural-Rückbildung: nur bei langen Wörtern auf -en/-ln/-rn/-ten.
 * „Zwiebeln“ → „zwiebel“, „Tomaten“ → „tomate“; „Butter“ und „Sahne“ bleiben heil.
 */
function singularize(word: string): string {
  if (word.length >= 6 && /(?:en|ln|rn)$/.test(word)) return word.slice(0, -1)
  return word
}

/**
 * Normalisierter Schlüssel fürs Zusammenrechnen in der Einkaufsliste.
 * Bewusst konservativ: lieber zwei Posten getrennt lassen als zwei
 * verschiedene Dinge zusammenwerfen.
 */
export function normalizeName(name: string): string {
  const cleaned = deaccent(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (SYNONYMS[cleaned]) return SYNONYMS[cleaned]

  const words = cleaned
    .split(' ')
    .filter((w) => w && !QUALIFIERS.has(w))
    .map(singularize)
  const key = words.join(' ') || cleaned
  return SYNONYMS[key] ?? key
}

// ---------------------------------------------------------------- Abteilung

const AISLE_KEYWORDS: [Aisle, string[]][] = [
  // Englisch steht gleichberechtigt daneben, weil wir absichtlich nicht
  // übersetzen: ein Post auf Englisch bleibt auf Englisch, und „cucumber“ muss
  // trotzdem ins Gemüseregal finden. Ergänzt anhand von Sebis echten Captions
  // (fixtures/captions.json) — vorher landete dort gut die Hälfte in „Sonstiges“.
  ['obst_gemuese', ['zwiebel', 'knoblauch', 'tomate', 'paprika', 'karotte', 'moehre', 'kartoffel', 'salat', 'gurke', 'zucchini', 'aubergine', 'brokkoli', 'spinat', 'pilz', 'champignon', 'lauch', 'sellerie', 'ingwer', 'zitrone', 'limette', 'apfel', 'banane', 'beere', 'avocado', 'petersilie', 'basilikum', 'koriander', 'schnittlauch', 'rosmarin', 'thymian', 'minze', 'dill', 'kohl', 'bohne', 'erbse', 'mais', 'kuerbis', 'orange', 'birne', 'mango', 'chili', 'jalapeno', 'radieschen', 'schalotte', 'rote bete', 'rote beete', 'blattspinat', 'onion', 'cucumber', 'ginger', 'lime', 'lemon', 'bell pepper', 'broccoli', 'spinach', 'cilantro', 'parsley', 'mushroom', 'potato', 'tomato', 'radish', 'shallot', 'garlic', 'watermelon']],
  ['kuehlregal', ['milch', 'sahne', 'butter', 'joghurt', 'quark', 'kaese', 'feta', 'mozzarella', 'parmesan', 'frischkaese', 'schmand', 'creme fraiche', 'ei', 'tofu', 'halloumi', 'ricotta', 'mascarpone', 'buttermilch', 'skyr', 'yogurt', 'cream cheese', 'cream', 'milk', 'cheddar', 'cheese', 'egg']],
  ['fleisch_fisch', ['hackfleisch', 'hack', 'haehnchen', 'huhn', 'pute', 'rind', 'schwein', 'speck', 'bacon', 'wurst', 'salami', 'schinken', 'lachs', 'thunfisch', 'garnele', 'fisch', 'steak', 'filet', 'chorizo', 'beef', 'chicken', 'turkey', 'tuna', 'salmon', 'shrimp']],
  // 'hefeflocke' muss vor der Backabteilung greifen, sonst zieht es das 'hefe'
  // dort an sich — Hefeflocken sind aber kein Triebmittel.
  ['trocken', ['nudel', 'pasta', 'spaghetti', 'reis', 'mehl', 'couscous', 'quinoa', 'linse', 'haferflocke', 'brot', 'semmelbroesel', 'panko', 'nuss', 'mandel', 'walnuss', 'cashew', 'sesam', 'chiasamen', 'pinienkern', 'hefeflocke', 'vermicelli', 'noodle', 'rice', 'whey', 'breadcrumb', 'oats', 'cereal', 'flour']],
  ['konserven', ['dose', 'passierte tomate', 'tomatenmark', 'kokosmilch', 'kichererbse', 'mais dose', 'oliven', 'kapern', 'bruehe', 'fond', 'sojasosse', 'sojasauce', 'essig', 'oel', 'olivenoel', 'senf', 'ketchup', 'mayonnaise', 'honig', 'ahornsirup', 'erdnussbutter', 'gochujang', 'mirin', 'sesamoel', 'miso', 'currypaste', 'buffalo sauce', 'soy sauce', 'sesame oil', 'olive oil', 'coconut milk', 'peanut butter', 'vinegar', 'pickle juice', 'mayo', 'honey', 'mustard', 'curry paste', 'hot sauce', 'oil']],
  ['tiefkuehl', ['tiefkuehl', 'tk', 'gefroren', 'eis']],
  ['backen', ['zucker', 'backpulver', 'natron', 'hefe', 'vanille', 'kakao', 'schokolade', 'puderzucker', 'staerke', 'speisestaerke', 'gelatine', 'sweetener', 'pudding mix', 'cornstarch', 'baking powder']],
  ['gewuerze', ['salz', 'pfeffer', 'paprikapulver', 'kreuzkuemmel', 'curry', 'zimt', 'muskat', 'oregano', 'kuemmel', 'lorbeer', 'chiliflocke', 'currypulver', 'garam masala', 'kurkuma', 'garlic powder', 'onion powder', 'cajun seasoning', 'seasoning', 'cumin', 'smoked paprika', 'salt', 'pepper']],
  ['getraenke', ['wasser', 'wein', 'bier', 'saft', 'cola', 'brühe', 'water']],
]

/**
 * Trifft ein Stichwort auf den Zutatennamen zu?
 *
 * Reines `includes` reicht hier nicht: „hackfleisch“ enthält „ei“ und wäre
 * damit im Kühlregal gelandet. Kurze Stichwörter zählen deshalb nur als ganzes
 * Wort; ab vier Zeichen darf auch mitten im Kompositum getroffen werden,
 * damit „Kirschtomaten“ noch bei „tomate“ hängenbleibt.
 */
function keywordHit(nameKey: string, keyword: string): boolean {
  if (keyword.includes(' ')) return nameKey.includes(keyword)
  const words = nameKey.split(' ')
  if (words.includes(keyword)) return true
  return keyword.length >= 4 && words.some((w) => w.includes(keyword))
}

/**
 * Grobe Zuordnung zur Supermarkt-Abteilung. Kommt nur zum Zug, wenn die
 * Quelle keine liefert; „sonstiges“ ist ein ehrliches Ergebnis, kein Fehler.
 */
export function guessAisle(nameKey: string): Aisle {
  // Das längste passende Stichwort gewinnt, nicht die erste Abteilung in der
  // Liste. „sesamoel“ enthält „sesam“ (Trockenware) und „sesamoel“ (Öle) —
  // gemeint ist offensichtlich das Speziellere. Sonst hinge die Zuordnung an
  // der Reihenfolge der Abteilungen, und die ist nach dem Supermarkt-Weg
  // sortiert, nicht nach Bedeutung.
  let best: { aisle: Aisle; length: number } | null = null
  for (const [aisle, words] of AISLE_KEYWORDS) {
    for (const word of words) {
      if (!keywordHit(nameKey, word)) continue
      if (!best || word.length > best.length) best = { aisle, length: word.length }
    }
  }
  return best?.aisle ?? 'sonstiges'
}

export const AISLE_ORDER: readonly Aisle[] = [
  'obst_gemuese', 'kuehlregal', 'fleisch_fisch', 'trocken', 'konserven',
  'tiefkuehl', 'backen', 'gewuerze', 'getraenke', 'sonstiges',
]

export const AISLE_LABEL: Record<Aisle, string> = {
  obst_gemuese: 'Obst & Gemüse',
  kuehlregal: 'Kühlregal',
  fleisch_fisch: 'Fleisch & Fisch',
  trocken: 'Trockenware',
  konserven: 'Konserven & Öle',
  tiefkuehl: 'Tiefkühl',
  backen: 'Backen',
  gewuerze: 'Gewürze',
  getraenke: 'Getränke',
  sonstiges: 'Sonstiges',
}

// -------------------------------------------------------------- Zutatenzeile

/**
 * Zerlegt eine rohe Zutatenzeile („1 cup flour, sifted“) in Menge, Einheit,
 * Name und Zusatz. Ohne KI — dieser Weg trägt den Import von Foodblogs
 * (schema.org liefert nur Strings) und die manuelle Eingabe.
 *
 * Was nicht sicher erkennbar ist, bleibt null und die Zeile steht als `raw` da.
 */
export function parseIngredientLine(raw: string, group: string | null = null): Ingredient {
  const line = raw.replace(/^[\s*•\-–—▢]+/, '').trim()

  const amount = parseLeadingAmount(line)
  let qty: number | null = amount?.qty ?? null
  let rest = amount ? amount.rest.trimStart() : line

  // Einheit ist das nächste Wort — aber nur, wenn wir es kennen.
  let unit: string | null = null
  const wordMatch = rest.match(/^([\p{L}]+\.?)\s*/u)
  if (wordMatch) {
    const candidate = canonicalUnit(wordMatch[1])
    if (candidate) {
      unit = candidate
      rest = rest.slice(wordMatch[0].length)
    }
  }

  const metric = toMetric(qty, unit)
  qty = metric.qty
  unit = metric.unit

  // „Mehl, gesiebt“ / „Mehl (gesiebt)“ → Zusatz abtrennen
  let note: string | null = null
  const paren = rest.match(/\(([^)]*)\)/)
  if (paren) {
    note = paren[1].trim()
    rest = rest.replace(paren[0], ' ')
  }
  const comma = rest.indexOf(',')
  if (comma >= 0) {
    const tail = rest.slice(comma + 1).trim()
    if (tail) note = note ? `${note}, ${tail}` : tail
    rest = rest.slice(0, comma)
  }

  // Beim Namen gewinnt im Zweifel das Original: eine Zutat ohne Beschriftung
  // wäre schlimmer als eine mit Emoji. Beim Zusatz umgekehrt — ein Zusatz, der
  // nur aus einem Marken-Handle bestand, ist keiner.
  const nameDisplay = stripDecoration(rest.replace(/\s+/g, ' ').trim())
  if (note !== null) note = stripDecoration(note) || null
  const nameKey = normalizeName(nameDisplay)

  return {
    raw: raw.trim(),
    qty,
    unit,
    name_display: nameDisplay || rest.replace(/\s+/g, ' ').trim() || raw.trim(),
    name_key: nameKey,
    note,
    group,
    aisle: nameKey ? guessAisle(nameKey) : 'sonstiges',
  }
}

// ------------------------------------------------------------------ Portionen

/**
 * Skaliert eine Zutat. Zutaten ohne Menge („Salz nach Geschmack“) bleiben
 * unverändert — dort gibt es nichts zu multiplizieren.
 */
export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  if (ing.qty === null || factor === 1) return ing
  return { ...ing, qty: roundNice(ing.qty * factor) }
}

/** Zwei Mengen zusammenrechnen — nur bei identischer Einheit. */
export function combineAmounts(
  a: { qty: number | null; unit: string | null },
  b: { qty: number | null; unit: string | null },
): { qty: number | null; unit: string | null } | null {
  if ((a.unit ?? null) !== (b.unit ?? null)) return null
  if (a.qty === null || b.qty === null) return null
  return { qty: roundNice(a.qty + b.qty), unit: a.unit }
}

// --------------------------------------------------------------------- Timer

/**
 * Findet die erste Dauer in einem Schritt („ca. 20 Min backen“) für den
 * Kochmodus-Timer. Bei Bereichen („20–25 Minuten“) gewinnt die untere Grenze:
 * lieber einmal nachschauen als anbrennen lassen.
 */
export function guessTimerSeconds(text: string): number | null {
  const re =
    /(\d+(?:[.,]\d+)?)\s*(?:-|–|—|bis|to)?\s*(?:\d+(?:[.,]\d+)?)?\s*(stunden?|std|hours?|hrs?|minuten?|minutes?|min|sekunden?|sek|seconds?|sec|[hms])\b\.?/i
  const m = text.match(re)
  if (!m) return null
  const value = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null

  // Ausgeschrieben prüfen statt über den Anfangsbuchstaben: „Stunde“ und
  // „Sekunde“ fangen beide mit s an, und daraus wurde schon mal 1 statt 3600.
  const unit = m[2].toLowerCase()
  if (/^(?:stunden?|std|hours?|hrs?|h)$/.test(unit)) return Math.round(value * 3600)
  if (/^(?:minuten?|minutes?|min|m)$/.test(unit)) return Math.round(value * 60)
  return Math.round(value)
}

// ---------------------------------------------------------------- Abschnitte

/**
 * Teilt Zutaten oder Schritte in ihre Abschnitte, ohne die Reihenfolge
 * anzutasten. Nur direkt aufeinanderfolgende Einträge mit derselben
 * Überschrift kommen zusammen: taucht „Für die Soße“ später nochmal auf, ist
 * das ein zweiter Block, weil die Vorlage ihn dort auch als zweiten gesetzt hat.
 */
export function bySection<T extends { group: string | null }>(items: T[]): [string | null, T[]][] {
  const out: [string | null, T[]][] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (last && last[0] === item.group) last[1].push(item)
    else out.push([item.group, [item]])
  }
  return out
}

/** Baut aus einer Schrittzeile einen Step samt erkanntem Timer. */
export function toStep(text: string, group: string | null = null): Step {
  const clean = text.replace(/^[\s*•\-–—]+/, '').replace(/^\d+[.)]\s*/, '').trim()
  return { text: clean, timer_seconds: guessTimerSeconds(clean), group }
}
