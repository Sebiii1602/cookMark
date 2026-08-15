/**
 * Das Datenmodell selbst liegt im Rezept-Kern, weil die Edge Function
 * dieselben Typen schreibt, die der Client liest — siehe
 * `supabase/functions/_shared/recipe-core.ts`. Hier steht nur, was rein
 * clientseitig ist: Sync-Plumbing und die Tabellen, die es nur lokal gibt.
 */
export type {
  Aisle,
  Ingredient,
  Nutrition,
  Recipe,
  RecipeStatus,
  RecipeTag,
  RecipeVariant,
  RecipeVersion,
  SourceType,
  Step,
  TagKind,
} from '@core/recipe-core.ts'

/** 1 = nie wieder, 2 = ok, 3 = nochmal. Aufsteigend, damit Sortieren intuitiv ist. */
export type Rating = 1 | 2 | 3

export interface CookLog {
  id: string
  recipe_id: string
  /** Lokales Kalenderdatum als 'yyyy-MM-dd'. */
  cooked_on: string
  rating: Rating | null
  /** Was es wirklich gedauert hat — die Gegenprobe zum „30 Min“-Tag. */
  actual_minutes: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface ShoppingItem {
  id: string
  name_key: string
  name_display: string
  qty: number | null
  unit: string | null
  checked: boolean
  /** Aus welchen Rezepten der Posten stammt (leer = manuell ergänzt). */
  from_recipe_ids: string[]
  created_at: string
  updated_at: string
}

export type ImportKind = 'url' | 'text' | 'image'
export type ImportStatus = 'queued' | 'running' | 'done' | 'failed' | 'needs_input'

/**
 * Ein Import-Auftrag. Wird serverseitig angelegt (Edge Function, auch vom
 * iOS-Kurzbefehl) — die App zieht ihn nur, deshalb steht er nicht in der Outbox.
 */
export interface ImportJob {
  id: string
  kind: ImportKind
  /** Link, Textanfang oder Storage-Pfad — genug, um den Auftrag im Log zu erkennen. */
  payload: string
  status: ImportStatus
  error: string | null
  recipe_id: string | null
  created_at: string
  updated_at: string
}

/** Tabellen mit lokalen Änderungen, die hochgepusht werden. */
export type SyncTable = 'recipes' | 'cook_logs' | 'shopping_items'

/** Tabellen, die nur heruntergeladen werden (serverseitig geschrieben). */
export type PullOnlyTable = 'imports'

export interface OutboxRow {
  seq: number
  table: SyncTable
  op: 'upsert' | 'delete'
  row_id: string
}

export interface MetaRow {
  key: string
  value: string
}
