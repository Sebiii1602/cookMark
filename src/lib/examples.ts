import { parseIngredientLine, toStep, type Step } from '@core/recipe-core.ts'
import { addRecipe, db } from './db'
import { supabase } from './supabase'
import type { NewRecipe } from './db'

/**
 * Beispielrezepte für den lokalen Modus — damit die App nicht leer dasteht,
 * wenn man sie sich zum ersten Mal ansieht.
 *
 * Sie werden **nur ohne Supabase** angelegt (`npm run dev:local`). Sobald ein
 * echter Account dranhängt, bleibt die Liste leer, bis du selbst etwas holst:
 * Demo-Daten haben in echten Daten nichts verloren.
 *
 * Bewusst mit allem, woran der Parser sich beweisen muss: Bereichsangaben,
 * amerikanische Einheiten, Zwischenüberschriften, Zeilen ganz ohne Menge.
 */

interface Example {
  title: string
  /** null, wenn der Post keinen Urheber nennt — auch hier wird nichts erfunden. */
  author: string | null
  sourceType: NewRecipe['source_type']
  servings: number
  minutes: number
  tags: string[]
  ingredients: string
  steps: string[]
}

const EXAMPLES: Example[] = [
  {
    // Echte Caption aus Sebis Sammlung (siehe fixtures/captions.json), inklusive
    // Emoji hinter den Zutaten und einem eigenen Abschnitt fürs Dressing.
    // Der Post nennt keinen Urheber, also steht hier auch keiner.
    title: 'Sommerlicher Thunfisch-Salat',
    author: null,
    sourceType: 'instagram',
    servings: 2,
    minutes: 15,
    tags: ['Salat', 'ohne Kochen', 'unter 30 Min'],
    ingredients: `1 Gurke 🥒
1 Dose Thunfisch 🐟
1/2 Zwiebel 🧅
100 g Mais 🌽
100 g Feta
Frischer Dill 🌿
Optional etwas Schnittlauch
Für das Dressing:
150 g Joghurt
1 EL Senf
1 EL Light-Mayonnaise
1 Limette
1 TL Honig 🍯
Salz & Pfeffer`,
    steps: [
      'Zuerst die Gurke in Scheiben schneiden und in eine Schüssel geben.',
      'Den Thunfisch abtropfen lassen und zusammen mit der fein gewürfelten Zwiebel und dem Mais zur Gurke geben.',
      'Anschließend Feta und frischen Dill dazugeben und alles miteinander vermengen.',
      'Für das Dressing:',
      'Joghurt, Senf und Light-Mayonnaise miteinander verrühren. Mit Salz und Pfeffer würzen und anschließend Limettensaft sowie etwas Honig dazugeben.',
      'Wer mag, kann noch etwas fein geschnittenen Schnittlauch unter das Dressing mischen.',
      '--',
      'Das Dressing über den Salat geben, alles gut vermengen.',
    ],
  },
  {
    title: 'Ofengemüse mit Feta',
    author: 'emmikochteinfach',
    sourceType: 'web',
    servings: 2,
    minutes: 40,
    tags: ['vegetarisch', 'Ofengericht', 'unter 45 Min'],
    ingredients: `1 Zucchini
2 rote Paprika
1 rote Zwiebel
250 g Kirschtomaten
3 EL Olivenöl
2 TL Paprikapulver
Salz und Pfeffer
200 g Feta
Zum Servieren:
1 Bund Petersilie
1 Zitrone`,
    steps: [
      'Ofen auf 200 Grad Ober-/Unterhitze vorheizen.',
      'Zucchini und Paprika in mundgerechte Stücke schneiden, Zwiebel in Spalten.',
      'Gemüse mit Öl, Paprikapulver, Salz und Pfeffer auf einem Blech vermengen.',
      '25 Minuten backen, dann die Kirschtomaten dazugeben.',
      'Feta darüberbröseln und weitere 10 Minuten backen.',
      'Mit gehackter Petersilie und einem Spritzer Zitrone servieren.',
    ],
  },
  {
    title: 'Cremige Zitronen-Pasta',
    author: 'pastagrannies',
    sourceType: 'instagram',
    servings: 2,
    minutes: 20,
    tags: ['italienisch', 'unter 30 Min', 'vegetarisch'],
    ingredients: `250 g Spaghetti
1 Zitrone
150 ml Sahne
50 g Parmesan, gerieben
2 EL Butter
Salz für das Nudelwasser
schwarzer Pfeffer`,
    steps: [
      'Spaghetti in reichlich Salzwasser 9 Minuten kochen, eine Tasse Nudelwasser aufheben.',
      'Butter in einer Pfanne schmelzen, Zitronenabrieb und -saft dazugeben.',
      'Sahne einrühren und 2 Minuten einkochen lassen.',
      'Nudeln mit etwas Nudelwasser in die Pfanne geben und schwenken, bis die Soße bindet.',
      'Parmesan unterheben, mit Pfeffer abschmecken.',
    ],
  },
  {
    title: 'Miso Butter Noodles',
    author: 'tiffycooks',
    sourceType: 'tiktok',
    servings: 1,
    minutes: 15,
    tags: ['asiatisch', 'unter 30 Min', 'Feierabend'],
    ingredients: `150 g ramen noodles
2 tbsp butter
1 tbsp white miso paste
1 tsp soy sauce
2 cloves garlic
1 tsp chili flakes
2 spring onions`,
    steps: [
      'Cook the noodles according to the package, about 4 minutes.',
      'Melt the butter in a pan, add the minced garlic and cook for 1 minute.',
      'Whisk in the miso paste and soy sauce with a splash of noodle water.',
      'Toss the noodles in the sauce and top with chili flakes and spring onions.',
    ],
  },
  {
    title: 'Linsensuppe mit Zitrone',
    author: 'Selbst',
    sourceType: 'manual',
    servings: 4,
    minutes: 45,
    tags: ['vegan', 'Meal Prep'],
    ingredients: `250 g rote Linsen
1 Zwiebel
2 Zehen Knoblauch
2 Karotten
1 EL Tomatenmark
1 TL Kreuzkümmel
1,5 l Gemüsebrühe
1 Zitrone
Salz und Pfeffer
Olivenöl zum Anbraten`,
    steps: [
      'Zwiebel, Knoblauch und Karotten würfeln.',
      'In Olivenöl 5 Minuten anbraten, Tomatenmark und Kreuzkümmel dazugeben und kurz mitrösten.',
      'Linsen und Brühe zugeben, aufkochen und 25 Minuten köcheln lassen.',
      'Mit Zitronensaft, Salz und Pfeffer abschmecken.',
    ],
  },
  {
    title: 'Turkey Potato Croquettes',
    author: 'weelicious',
    sourceType: 'instagram',
    servings: 4,
    minutes: 35,
    tags: [],
    ingredients: '',
    steps: [],
  },
]

/** „Für die Soße:“ am Zeilenende macht eine Zwischenüberschrift. */
function parseIngredients(text: string) {
  let group: string | null = null
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.endsWith(':')) {
      group = trimmed.slice(0, -1).trim()
      continue
    }
    out.push(parseIngredientLine(trimmed, group))
  }
  return out
}

/**
 * Schritte mit Abschnitten, gleiche Schreibweise wie bei den Zutaten:
 * Zeile mit Doppelpunkt am Ende setzt die Überschrift, `--` hebt sie wieder
 * auf (für den Schlussschritt, der zu keinem Einzelteil mehr gehört).
 */
function parseSteps(lines: string[]): Step[] {
  let group: string | null = null
  const out: Step[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '--') {
      group = null
      continue
    }
    if (trimmed.endsWith(':')) {
      group = trimmed.slice(0, -1).trim()
      continue
    }
    out.push(toStep(trimmed, group))
  }
  return out
}

export async function seedExamplesIfLocal(): Promise<void> {
  // Nur im lokalen Modus, und nur solange noch gar nichts da ist
  if (supabase) return

  /*
   * Prüfen und Flagge setzen müssen zusammen in einer Transaktion passieren.
   * React ruft Effekte im StrictMode absichtlich doppelt auf; ohne das kamen
   * beide Läufe an einem einfachen `if` vorbei, bevor einer die Flagge
   * gesetzt hatte — und jedes Beispiel stand danach zweimal in der Liste.
   */
  const claimed = await db.transaction('rw', db.meta, db.recipes, async () => {
    if (await db.meta.get('examples_seeded')) return false
    const empty = (await db.recipes.count()) === 0
    await db.meta.put({ key: 'examples_seeded', value: '1' })
    return empty
  })
  if (!claimed) return

  for (const example of EXAMPLES) {
    const ingredients = parseIngredients(example.ingredients)
    const steps = parseSteps(example.steps)
    // Das letzte Beispiel ist absichtlich leer: so sieht ein Post aus, der das
    // Rezept nur per DM verspricht.
    const empty = ingredients.length === 0 && steps.length === 0
    await addRecipe({
      title: example.title,
      source_type: example.sourceType,
      source_author: example.author,
      source_url: null,
      servings: empty ? null : example.servings,
      total_minutes: empty ? null : example.minutes,
      status: empty ? 'needs_recipe' : 'complete',
      lang: example.sourceType === 'tiktok' ? 'en' : 'de',
      raw_text: empty
        ? "Thanksgiving LEFTOVERS! Comment 'YES' and I'll DM you these TURKEY POTATO CROQUETTES"
        : null,
      ingredients,
      steps,
      tags: example.tags.map((label) => ({
        label,
        kind: 'custom' as const,
        // Als KI-Vorschlag markiert, damit man die Prüfen-Funktion gleich sieht
        source: 'ai' as const,
        confirmed: null,
      })),
    })
  }
}
