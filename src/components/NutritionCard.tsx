import { useState } from 'react'
import { fmtTimeAgo } from '../lib/dates'
import { requestNutrition } from '../lib/nutrition'
import type { Recipe } from '../lib/types'
import { Button, Card, SectionLabel } from '../components/ui'

const ROWS: [keyof Pick<NonNullable<Recipe['nutrition']>, 'protein_g' | 'carbs_g' | 'fat_g'>, string][] =
  [
    ['protein_g', 'Eiweiß'],
    ['carbs_g', 'Kohlenhydrate'],
    ['fat_g', 'Fett'],
  ]

export function NutritionCard({ recipe }: { recipe: Recipe }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nutrition = recipe.nutrition
  const canEstimate = recipe.ingredients.length > 0

  async function estimate(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await requestNutrition(recipe.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (!nutrition && !canEstimate) return null

  return (
    <section className="mt-6">
      <SectionLabel>Nährwerte</SectionLabel>
      <Card>
        {nutrition ? (
          <>
            {/* Geschätzt heißt geschätzt — deshalb steht es an der Zahl, nicht im Kleingedruckten. */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-guess-deep">
                ≈ {Math.round(nutrition.kcal)}
              </span>
              <span className="text-sm text-soft">kcal pro Portion</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {ROWS.map(([key, label]) => (
                <div key={key} className="rounded-xl bg-guess-soft px-3 py-2">
                  <dt className="text-xs text-guess-deep">{label}</dt>
                  <dd className="text-sm font-medium tabular-nums text-guess-deep">
                    ≈ {Math.round(nutrition[key])} g
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-faint">
              Geschätzt aus der Zutatenliste ({nutrition.model}, {fmtTimeAgo(nutrition.generated_at)}).
              Keine gemessenen Werte — für die Richtung gut, nicht fürs Protokoll.
            </p>
            <Button variant="ghost" className="mt-1 px-0" onClick={() => void estimate()} disabled={busy}>
              {busy ? 'Schätzt…' : 'Neu schätzen'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-soft">
              Noch nichts geschätzt. Eine Schätzung aus der Zutatenliste liegt erfahrungsgemäß
              ±20 % daneben — genug, um Rezepte zu vergleichen, zu wenig fürs Tracking.
            </p>
            <Button variant="secondary" className="mt-3" onClick={() => void estimate()} disabled={busy}>
              {busy ? 'Schätzt…' : 'kcal schätzen'}
            </Button>
          </>
        )}
        {error && <p className="mt-2 text-sm text-clay-deep">{error}</p>}
      </Card>
    </section>
  )
}
