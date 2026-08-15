import { formatQty } from '@core/recipe-core.ts'

const STEPS = [0.5, 1, 2, 3]

/**
 * Portionsregler. Ohne Portionsangabe im Rezept zeigen wir Faktoren (½×, 2×) —
 * eine Portionszahl zu erfinden, nur damit der Regler hübscher aussieht,
 * wäre genau die Sorte Zahl, die man später für gemessen hält.
 */
export function ServingScaler({
  servings,
  factor,
  onChange,
}: {
  servings: number | null
  factor: number
  onChange: (factor: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-soft">{servings !== null ? 'Portionen' : 'Menge'}</span>
      <div className="flex overflow-hidden rounded-xl border border-line">
        {STEPS.map((step) => {
          const active = Math.abs(factor - step) < 0.001
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              className={`px-3 py-1.5 text-sm font-medium tabular-nums transition-colors ${
                active ? 'bg-herb text-white' : 'bg-card text-soft hover:text-ink'
              }`}
            >
              {servings !== null ? formatQty(servings * step) : `${formatQty(step)}×`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
