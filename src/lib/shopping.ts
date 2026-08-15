import { combineAmounts, scaleIngredient } from '@core/recipe-core.ts'
import { db, upsertShoppingItem } from './db'
import { nowIso } from './dates'
import type { Ingredient, ShoppingItem } from './types'

/**
 * Legt die Zutaten eines Rezepts auf die Liste und rechnet zusammen, was sich
 * zusammenrechnen lässt: gleicher normalisierter Name **und** gleiche Einheit.
 * Sonst kommt ein zweiter Posten dazu — „200 g Tomaten“ und „1 Dose Tomaten“
 * sind nun mal nicht dasselbe, und stillschweigend addieren wäre geraten.
 *
 * Abgehakte Posten werden nie wieder aufgefüllt: was im Wagen liegt, bleibt
 * liegen, Nachschub wird ein eigener Eintrag.
 */
export async function addIngredientsToList(
  ingredients: Ingredient[],
  recipeId: string,
  factor = 1,
): Promise<number> {
  const open = (await db.shopping_items.toArray()).filter((i) => !i.checked)
  let added = 0

  for (const raw of ingredients) {
    const ing = scaleIngredient(raw, factor)
    const name = ing.name_display.trim()
    if (!name) continue

    const match = open.find((item) => item.name_key === ing.name_key)
    const merged = match ? combineAmounts(match, ing) : null

    if (match && merged) {
      const updated: ShoppingItem = {
        ...match,
        qty: merged.qty,
        unit: merged.unit,
        from_recipe_ids: match.from_recipe_ids.includes(recipeId)
          ? match.from_recipe_ids
          : [...match.from_recipe_ids, recipeId],
        updated_at: nowIso(),
      }
      await upsertShoppingItem(updated)
      Object.assign(match, updated)
    } else {
      const t = nowIso()
      const item: ShoppingItem = {
        id: crypto.randomUUID(),
        name_key: ing.name_key,
        name_display: name,
        qty: ing.qty,
        unit: ing.unit,
        checked: false,
        from_recipe_ids: [recipeId],
        created_at: t,
        updated_at: t,
      }
      await upsertShoppingItem(item)
      open.push(item)
    }
    added += 1
  }
  return added
}

/** Freitext-Posten von Hand ergänzen („Klopapier“ darf auch mit drauf). */
export async function addManualItem(text: string): Promise<void> {
  const { parseIngredientLine } = await import('@core/recipe-core.ts')
  const parsed = parseIngredientLine(text)
  const t = nowIso()
  await upsertShoppingItem({
    id: crypto.randomUUID(),
    name_key: parsed.name_key,
    name_display: parsed.name_display,
    qty: parsed.qty,
    unit: parsed.unit,
    checked: false,
    from_recipe_ids: [],
    created_at: t,
    updated_at: t,
  })
}
