import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RecipeCard } from '../components/RecipeCard'
import { Button, Chip, EmptyState, inputClass, Wordmark } from '../components/ui'
import { db } from '../lib/db'
import { fmtRelativeDay } from '../lib/dates'
import { activeVersion, normalizeName } from '@core/recipe-core.ts'
import type { Recipe } from '../lib/types'

type QuickFilter = 'schnell' | 'nie_gekocht' | 'unvollstaendig'

const QUICK_FILTERS: [QuickFilter, string][] = [
  ['schnell', 'unter 30 Min'],
  ['nie_gekocht', 'noch nie gekocht'],
  ['unvollstaendig', 'Rezept fehlt'],
]

/** Sucht in Titel, Creator und Zutatennamen — normalisiert, damit „Zwiebeln“ auch „Zwiebel“ findet. */
function matchesSearch(recipe: Recipe, needle: string): boolean {
  if (!needle) return true
  const hay = [
    recipe.title,
    recipe.source_author ?? '',
    ...recipe.ingredients.map((i) => `${i.name_display} ${i.name_key}`),
    ...recipe.tags.map((t) => t.label),
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(needle) || hay.includes(normalizeName(needle))
}

export function Recipes() {
  const [search, setSearch] = useState('')
  const [quick, setQuick] = useState<QuickFilter | null>(null)
  const [tag, setTag] = useState<string | null>(null)

  const recipes = useLiveQuery(() => db.recipes.orderBy('created_at').reverse().toArray(), [])
  const cookLogs = useLiveQuery(() => db.cook_logs.toArray(), [])

  /** recipe_id → zuletzt gekocht (yyyy-MM-dd), für Filter und Kartenzeile. */
  const lastCookedBy = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of cookLogs ?? []) {
      const current = map.get(log.recipe_id)
      if (!current || log.cooked_on > current) map.set(log.recipe_id, log.cooked_on)
    }
    return map
  }, [cookLogs])

  /** Tag-Vokabular kommt aus den Rezepten selbst — es gibt keine eigene Tag-Tabelle. */
  const allTags = useMemo(() => {
    // Was schon als fester Filter oben steht, nicht noch einmal als Tag anbieten
    const reserved = new Set(QUICK_FILTERS.map(([, label]) => label.toLowerCase()))
    const counts = new Map<string, number>()
    for (const recipe of recipes ?? []) {
      for (const t of recipe.tags) {
        // Widerlegte Tags gehören nicht in die Filterleiste — sie stimmen ja nicht
        if (t.confirmed === false) continue
        if (reserved.has(t.label.toLowerCase())) continue
        counts.set(t.label, (counts.get(t.label) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)
  }, [recipes])

  const needle = search.trim().toLowerCase()

  const shown = useMemo(() => {
    return (recipes ?? []).filter((recipe) => {
      if (!matchesSearch(recipe, needle)) return false
      if (tag && !recipe.tags.some((t) => t.label === tag && t.confirmed !== false)) return false
      if (quick === 'schnell') {
        // Deine eigene Fassung sticht die Zeitangabe der Quelle
        const minutes = activeVersion(recipe).total_minutes
        if (minutes === null || minutes > 30) return false
      }
      if (quick === 'nie_gekocht' && lastCookedBy.has(recipe.id)) return false
      if (quick === 'unvollstaendig' && recipe.status !== 'needs_recipe') return false
      return true
    })
  }, [recipes, needle, tag, quick, lastCookedBy])

  if (!recipes) return null

  const openCount = recipes.filter((r) => r.status === 'needs_recipe').length

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-5">
      <header className="mb-4 flex items-baseline justify-between">
        <Wordmark className="text-xl" />
        <span className="text-sm text-faint">
          {recipes.length} {recipes.length === 1 ? 'Rezept' : 'Rezepte'}
        </span>
      </header>

      <input
        className={`${inputClass} mb-3`}
        placeholder="Suchen — Titel, Creator, Zutat"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        type="search"
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map(([key, label]) => {
          const active = quick === key
          if (key === 'unvollstaendig' && openCount === 0 && !active) return null
          return (
            <button key={key} onClick={() => setQuick(active ? null : key)} type="button">
              <Chip tone={active ? 'herb' : 'neutral'}>
                {label}
                {key === 'unvollstaendig' && openCount > 0 && ` (${openCount})`}
              </Chip>
            </button>
          )
        })}
        {allTags.map(([label]) => {
          const active = tag === label
          return (
            <button key={label} onClick={() => setTag(active ? null : label)} type="button">
              <Chip tone={active ? 'herb' : 'neutral'}>{label}</Chip>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={recipes.length === 0 ? 'Noch nichts gespeichert' : 'Nichts gefunden'}
          action={
            recipes.length === 0 ? undefined : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setQuick(null)
                  setTag(null)
                }}
              >
                Filter zurücksetzen
              </Button>
            )
          }
        >
          {recipes.length === 0
            ? 'Teile ein Reel oder einen Link in cookMark — oder leg unten rechts eins von Hand an.'
            : 'Für diese Kombination liegt hier nichts.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              lastCooked={
                lastCookedBy.has(recipe.id)
                  ? fmtRelativeDay(lastCookedBy.get(recipe.id)!)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
