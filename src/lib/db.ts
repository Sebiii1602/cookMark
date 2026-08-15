import Dexie, { type EntityTable } from 'dexie'
import { nowIso } from './dates'
import type {
  CookLog,
  ImportJob,
  MetaRow,
  OutboxRow,
  Rating,
  Recipe,
  RecipeTag,
  RecipeVariant,
  ShoppingItem,
  SyncTable,
} from './types'

class CookMarkDB extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>
  cook_logs!: EntityTable<CookLog, 'id'>
  shopping_items!: EntityTable<ShoppingItem, 'id'>
  imports!: EntityTable<ImportJob, 'id'>
  outbox!: EntityTable<OutboxRow, 'seq'>
  meta!: EntityTable<MetaRow, 'key'>
}

export const db = new CookMarkDB('cookmark')

// `checked` ist bewusst kein Index: IndexedDB kann Booleans nicht als Schlüssel.
const STORES = {
  recipes: 'id, updated_at, created_at, status',
  cook_logs: 'id, recipe_id, cooked_on, updated_at',
  shopping_items: 'id, name_key, updated_at',
  imports: 'id, status, created_at, updated_at',
  outbox: '++seq, row_id',
  meta: 'key',
}

db.version(1).stores(STORES)

// v2: recipes.variant — die eigene Fassung neben dem Original
db.version(2)
  .stores(STORES)
  .upgrade((tx) =>
    tx
      .table('recipes')
      .toCollection()
      .modify((r) => {
        if (r.variant === undefined) r.variant = null
      }),
  )

/**
 * Löscht alle lokalen Daten (beim Abmelden), damit das Gerät für den nächsten
 * Account sauber dasteht. Wird nur aufgerufen, wenn die Outbox nachweislich
 * leer ist — siehe `signOut()` in auth.tsx.
 */
export async function clearLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.recipes, db.cook_logs, db.shopping_items, db.imports, db.outbox, db.meta],
    async () => {
      await db.recipes.clear()
      await db.cook_logs.clear()
      await db.shopping_items.clear()
      await db.imports.clear()
      await db.outbox.clear()
      await db.meta.clear()
    },
  )
}

/**
 * Merkt eine Zeile für den Sync vor. Upserts werden pro Zeile dedupliziert;
 * ein Delete ersetzt alle vorgemerkten Upserts derselben Zeile.
 */
async function enqueue(table: SyncTable, op: 'upsert' | 'delete', rowId: string): Promise<void> {
  if (op === 'delete') {
    await db.outbox.where('row_id').equals(rowId).delete()
  } else {
    const existing = await db.outbox.where('row_id').equals(rowId).first()
    if (existing && existing.op === 'upsert' && existing.table === table) return
  }
  await db.outbox.add({ table, op, row_id: rowId })
}

// ---------------------------------------------------------------- Rezepte

/** Alles außer Titel ist optional — ein Rezept darf lückenhaft sein. */
export type NewRecipe = Partial<Omit<Recipe, 'id' | 'created_at' | 'updated_at'>> & {
  title: string
}

export async function addRecipe(input: NewRecipe): Promise<string> {
  const id = crypto.randomUUID()
  const t = nowIso()
  const recipe: Recipe = {
    id,
    title: input.title.trim(),
    source_type: input.source_type ?? 'manual',
    source_url: input.source_url ?? null,
    source_author: input.source_author ?? null,
    image_path: input.image_path ?? null,
    servings: input.servings ?? null,
    total_minutes: input.total_minutes ?? null,
    status: input.status ?? 'complete',
    lang: input.lang ?? null,
    raw_text: input.raw_text ?? null,
    ingredients: input.ingredients ?? [],
    steps: input.steps ?? [],
    tags: input.tags ?? [],
    nutrition: input.nutrition ?? null,
    variant: input.variant ?? null,
    created_at: t,
    updated_at: t,
  }
  await db.transaction('rw', db.recipes, db.outbox, async () => {
    await db.recipes.add(recipe)
    await enqueue('recipes', 'upsert', id)
  })
  return id
}

export async function updateRecipe(
  id: string,
  patch: Partial<Omit<Recipe, 'id' | 'created_at'>>,
): Promise<void> {
  await db.transaction('rw', db.recipes, db.outbox, async () => {
    await db.recipes.update(id, { ...patch, updated_at: nowIso() })
    await enqueue('recipes', 'upsert', id)
  })
}

/**
 * Lesen, ändern, schreiben — in einer Transaktion.
 *
 * Ohne das gehen schnell aufeinanderfolgende Änderungen an derselben Zeile
 * verloren: zwei Tag-Klicks lasen beide das Rezept, bevor einer zurückschrieb,
 * und der zweite überschrieb den ersten. Dexie serialisiert Transaktionen auf
 * denselben Tabellen, damit stellt sich die Reihenfolge von allein her.
 */
async function mutateRecipe(
  recipeId: string,
  mutate: (recipe: Recipe) => Partial<Omit<Recipe, 'id' | 'created_at'>> | null,
): Promise<void> {
  await db.transaction('rw', db.recipes, db.outbox, async () => {
    const recipe = await db.recipes.get(recipeId)
    if (!recipe) return
    const patch = mutate(recipe)
    if (!patch) return
    await db.recipes.update(recipeId, { ...patch, updated_at: nowIso() })
    await enqueue('recipes', 'upsert', recipeId)
  })
}

/**
 * Setzt einen KI-Tag auf bestätigt/widerlegt. Ein widerlegter Tag verschwindet
 * nicht — durchgestrichen stehen zu bleiben ist die Information.
 */
export async function setTagConfirmed(
  recipeId: string,
  label: string,
  confirmed: boolean | null,
): Promise<void> {
  await mutateRecipe(recipeId, (recipe) => ({
    tags: recipe.tags.map((tag) => (tag.label === label ? { ...tag, confirmed } : tag)),
  }))
}

export async function addTag(recipeId: string, tag: RecipeTag): Promise<void> {
  await mutateRecipe(recipeId, (recipe) =>
    recipe.tags.some((t) => t.label.toLowerCase() === tag.label.toLowerCase())
      ? null
      : { tags: [...recipe.tags, tag] },
  )
}

export async function removeTag(recipeId: string, label: string): Promise<void> {
  await mutateRecipe(recipeId, (recipe) => ({
    tags: recipe.tags.filter((t) => t.label !== label),
  }))
}

/**
 * Speichert die eigene Fassung. Das Original wird dabei nie angefasst — genau
 * dafür gibt es die Variante.
 */
export async function saveVariant(
  recipeId: string,
  variant: Omit<RecipeVariant, 'updated_at'>,
): Promise<void> {
  await updateRecipe(recipeId, { variant: { ...variant, updated_at: nowIso() } })
}

/** Eigene Fassung verwerfen — zurück auf das, was in der Quelle stand. */
export async function discardVariant(recipeId: string): Promise<void> {
  await updateRecipe(recipeId, { variant: null })
}

// -------------------------------------------------------- Nachgekocht-Log

export async function addCookLog(
  recipeId: string,
  input: { cooked_on: string; rating?: Rating | null; actual_minutes?: number | null; note?: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  const t = nowIso()
  await db.transaction('rw', db.cook_logs, db.outbox, async () => {
    await db.cook_logs.add({
      id,
      recipe_id: recipeId,
      cooked_on: input.cooked_on,
      rating: input.rating ?? null,
      actual_minutes: input.actual_minutes ?? null,
      note: input.note ?? null,
      created_at: t,
      updated_at: t,
    })
    await enqueue('cook_logs', 'upsert', id)
  })
  return id
}

export async function updateCookLog(
  id: string,
  patch: Partial<Omit<CookLog, 'id' | 'recipe_id' | 'created_at'>>,
): Promise<void> {
  await db.transaction('rw', db.cook_logs, db.outbox, async () => {
    await db.cook_logs.update(id, { ...patch, updated_at: nowIso() })
    await enqueue('cook_logs', 'upsert', id)
  })
}

export async function deleteCookLog(id: string): Promise<void> {
  await db.transaction('rw', db.cook_logs, db.outbox, async () => {
    await db.cook_logs.delete(id)
    await enqueue('cook_logs', 'delete', id)
  })
}

// ---------------------------------------------------------- Einkaufsliste

export async function upsertShoppingItem(item: ShoppingItem): Promise<void> {
  await db.transaction('rw', db.shopping_items, db.outbox, async () => {
    await db.shopping_items.put(item)
    await enqueue('shopping_items', 'upsert', item.id)
  })
}

export async function setShoppingChecked(id: string, checked: boolean): Promise<void> {
  await db.transaction('rw', db.shopping_items, db.outbox, async () => {
    await db.shopping_items.update(id, { checked, updated_at: nowIso() })
    await enqueue('shopping_items', 'upsert', id)
  })
}

export async function deleteShoppingItems(ids: string[]): Promise<void> {
  await db.transaction('rw', db.shopping_items, db.outbox, async () => {
    await db.shopping_items.bulkDelete(ids)
    for (const id of ids) await enqueue('shopping_items', 'delete', id)
  })
}
