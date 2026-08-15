import { bySection, formatAmount, scaleIngredient } from '@core/recipe-core.ts'
import type { Ingredient } from '../lib/types'

export function IngredientList({
  ingredients,
  factor = 1,
  compact = false,
}: {
  ingredients: Ingredient[]
  factor?: number
  compact?: boolean
}) {
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {bySection(ingredients).map(([group, items], index) => (
        <div key={group ?? index}>
          {group && (
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
              {group}
            </div>
          )}
          <ul className="space-y-1.5">
            {items.map((ing, i) => {
              const scaled = scaleIngredient(ing, factor)
              return (
                <li key={i} className="flex gap-3 text-sm" title={ing.raw}>
                  <span className="w-20 shrink-0 tabular-nums text-soft">
                    {formatAmount(scaled.qty, scaled.unit)}
                  </span>
                  <span>
                    {ing.name_display}
                    {ing.note && <span className="text-faint"> · {ing.note}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
