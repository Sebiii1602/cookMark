/**
 * Trockenlauf für den Import — zeigt, was aus einem Link herauskäme, ohne
 * irgendetwas zu speichern. Gut zum Prüfen, bevor die Edge Function live geht,
 * und zum Nachsehen, warum ein Post als „Rezept fehlt“ gelandet ist.
 *
 *   cd supabase/functions
 *   ANTHROPIC_API_KEY=sk-ant-… deno run --allow-net --allow-env import/probe.ts "<url>"
 *
 * Ohne ANTHROPIC_API_KEY läuft nur der Quellen-Teil (kostenlos) — das reicht
 * schon, um zu sehen, ob Caption, Creator und Bild ankommen.
 */

import { fetchSource } from '../_shared/sources.ts'
import { formatAmount } from '../_shared/recipe-core.ts'
import { extractRecipe, MODEL } from './extract.ts'

const url = Deno.args[0]
if (!url) {
  console.error('Aufruf: deno run --allow-net --allow-env import/probe.ts "<url>"')
  Deno.exit(1)
}

const source = await fetchSource(url)

console.log('\n── Quelle ' + '─'.repeat(58))
console.log('Typ        :', source.sourceType)
console.log('Creator    :', source.author ?? '—')
console.log('Bild       :', source.imageUrl ? 'ja' : 'nein')
console.log('schema.org :', source.structured ? 'JA — keine KI nötig' : 'nein')
if (!source.structured) {
  console.log('Text       :', source.text.length, 'Zeichen')
  console.log('─'.repeat(68))
  console.log(source.text.slice(0, 600))
}

const structured = source.structured
if (structured) {
  console.log('\n── Rezept (direkt vom Blog) ' + '─'.repeat(41))
  console.log(structured.title)
  console.log(`${structured.servings ?? '?'} Portionen · ${structured.totalMinutes ?? '?'} Min`)
  for (const i of structured.ingredients) {
    console.log(`  ${formatAmount(i.qty, i.unit).padStart(10)}  ${i.name_display}`)
  }
  structured.steps.forEach((s, n) => console.log(`  ${n + 1}. ${s.text}`))
  Deno.exit(0)
}

const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
if (!apiKey) {
  console.log('\n(ANTHROPIC_API_KEY nicht gesetzt — Extraktion übersprungen.)')
  Deno.exit(0)
}

console.log(`\n── Extraktion mit ${MODEL} ` + '─'.repeat(40))
const started = Date.now()
const extracted = await extractRecipe({
  apiKey,
  text: source.text,
  context: `${source.sourceType}${source.author ? ` von ${source.author}` : ''}`,
})
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)\n`)

if (!extracted) {
  console.log('KEIN REZEPT in der Vorlage — die Karte würde als „Rezept fehlt“ angelegt.')
  console.log('Das ist das richtige Ergebnis bei „Kommentier YES und ich schick es dir per DM“.')
  Deno.exit(0)
}

console.log(extracted.title)
console.log(
  `${extracted.servings ?? '?'} Portionen · ${extracted.totalMinutes ?? '?'} Min · Sprache: ${extracted.lang ?? '?'}`,
)
console.log('\nZutaten:')
for (const i of extracted.ingredients) {
  const amount = formatAmount(i.qty, i.unit)
  console.log(
    `  ${amount.padStart(10)}  ${i.name_display}${i.note ? ` (${i.note})` : ''}` +
      `${amount ? '' : '   ← ohne Menge, so stand es da'}`,
  )
}
console.log('\nSchritte:')
extracted.steps.forEach((s, n) =>
  console.log(`  ${n + 1}. ${s.text}${s.timer_seconds ? `   [Timer ${s.timer_seconds}s]` : ''}`),
)
console.log('\nTags:', extracted.tags.map((t) => t.label).join(', ') || '—')
