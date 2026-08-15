import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { activeVersion } from '@core/recipe-core.ts'
import { IngredientList } from '../components/IngredientList'
import { StepTimer } from '../components/StepTimer'
import { Button } from '../components/ui'
import { db } from '../lib/db'
import { useWakeLock } from '../lib/useWakeLock'

export function CookMode() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const factor = Number(params.get('p') ?? '1') || 1

  const [index, setIndex] = useState(0)
  const [showIngredients, setShowIngredients] = useState(false)

  const recipe = useLiveQuery(() => db.recipes.get(id), [id])
  useWakeLock(recipe !== undefined && recipe !== null)

  if (!recipe) return null

  const version = activeVersion(recipe)
  const steps = version.steps
  if (steps.length === 0) {
    navigate(`/rezept/${id}`, { replace: true })
    return null
  }

  const step = steps[Math.min(index, steps.length - 1)]
  const isLast = index >= steps.length - 1

  return (
    <div
      className="flex min-h-dvh flex-col bg-paper"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(`/rezept/${id}`)}
          className="text-sm text-soft hover:text-ink"
        >
          ← Beenden
        </button>
        <span className="text-sm tabular-nums text-faint">
          {index + 1} / {steps.length}
        </span>
      </header>

      <div className="h-1 w-full bg-line">
        <div
          className="h-full bg-herb transition-all"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <main className="flex grow flex-col justify-center px-6 py-8">
        {/* Bei mehrteiligen Rezepten steht „Alles verrühren“ mehrfach da und
            meint jedes Mal etwas anderes. Ohne die Überschrift ist im
            Kochmodus nicht zu erkennen, welche Schüssel gemeint ist. */}
        {step.group && (
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-herb-deep">
            {step.group}
          </div>
        )}
        <p className="text-2xl font-medium leading-relaxed">{step.text}</p>
        {step.timer_seconds !== null && (
          <div className="mt-6">
            <StepTimer seconds={step.timer_seconds} />
          </div>
        )}
      </main>

      {showIngredients && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-line bg-card px-6 py-4">
          <IngredientList ingredients={version.ingredients} factor={factor} compact />
        </div>
      )}

      <footer
        className="border-t border-line bg-card px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => setShowIngredients((v) => !v)}
          className="mb-3 w-full text-center text-sm text-soft hover:text-ink"
        >
          {showIngredients ? 'Zutaten ausblenden' : 'Zutaten einblenden'}
        </button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            full
          >
            Zurück
          </Button>
          {isLast ? (
            <Button onClick={() => navigate(`/rezept/${id}?gekocht=1`)} full>
              Fertig
            </Button>
          ) : (
            <Button onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} full>
              Weiter
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
