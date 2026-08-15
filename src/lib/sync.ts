import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db } from './db'
import { nowIso } from './dates'
import { supabase } from './supabase'
import type { CookLog, ImportJob, PullOnlyTable, Recipe, ShoppingItem, SyncTable } from './types'

export type SyncState = 'disabled' | 'offline' | 'syncing' | 'synced' | 'error'

export interface SyncSnapshot {
  state: SyncState
  lastSyncAt: string | null
  /** Klartext des letzten Fehlers — wird unter „Mehr“ angezeigt statt nur eines Punkts. */
  lastError: string | null
}

let snapshot: SyncSnapshot = {
  state: supabase ? 'offline' : 'disabled',
  lastSyncAt: null,
  lastError: null,
}
const listeners = new Set<() => void>()

function setSnapshot(next: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
}

// Letzten Sync-Zeitpunkt aus der lokalen DB wiederherstellen
void db.meta.get('last_sync').then((row) => {
  if (row) setSnapshot({ lastSyncAt: row.value })
})

/** Reihenfolge wegen Fremdschlüsseln: cook_logs referenzieren recipes. */
const PUSH_ORDER: readonly SyncTable[] = ['recipes', 'cook_logs', 'shopping_items']
const PULL_ORDER: readonly (SyncTable | PullOnlyTable)[] = [
  'recipes',
  'cook_logs',
  'shopping_items',
  'imports',
]

const newerOrEqual = (a: string, b: string): boolean =>
  new Date(a).getTime() >= new Date(b).getTime()

/** Supabase-Fehler sind keine Error-Instanzen, sondern plain objects mit `message`. */
const errMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

/**
 * Pusht pro Tabelle isoliert: ein Problem bei einer Tabelle (z. B. eine
 * fehlende Migration) darf die anderen nicht blockieren. Fehlgeschlagene
 * Zeilen bleiben in der Outbox und werden beim nächsten Sync erneut versucht.
 * Gibt die erste Fehlermeldung zurück (oder null).
 */
async function pushOutbox(): Promise<string | null> {
  const ops = await db.outbox.orderBy('seq').toArray()
  if (ops.length === 0) return null
  let firstError: string | null = null

  for (const table of PUSH_ORDER) {
    const upserts = ops.filter((o) => o.table === table && o.op === 'upsert')
    if (upserts.length === 0) continue
    try {
      const rowIds = [...new Set(upserts.map((o) => o.row_id))]
      const rows = (await db.table(table).bulkGet(rowIds)).filter((r) => r !== undefined)
      if (rows.length > 0) {
        const { error } = await supabase!.from(table).upsert(rows, { onConflict: 'id' })
        if (error) throw error
      }
      await db.outbox.bulkDelete(upserts.map((o) => o.seq))
    } catch (err) {
      firstError ??= errMsg(err)
    }
  }

  // Deletes nach den Upserts, in umgekehrter Reihenfolge wegen der Fremdschlüssel
  for (const table of [...PUSH_ORDER].reverse()) {
    const dels = ops.filter((o) => o.table === table && o.op === 'delete')
    if (dels.length === 0) continue
    try {
      const { error } = await supabase!
        .from(table)
        .delete()
        .in('id', [...new Set(dels.map((o) => o.row_id))])
      if (error) throw error
      await db.outbox.bulkDelete(dels.map((o) => o.seq))
    } catch (err) {
      firstError ??= errMsg(err)
    }
  }
  return firstError
}

type RemoteRow = Record<string, unknown>

/**
 * Postgres liefert fehlende JSONB-Felder als null; lokal wollen wir überall
 * echte Arrays sehen, damit `.map()` nirgends knallt.
 */
function normalize(table: SyncTable | PullOnlyTable, raw: RemoteRow): Recipe | CookLog | ShoppingItem | ImportJob {
  const base = {
    id: raw.id as string,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  }
  switch (table) {
    case 'recipes':
      return {
        ...base,
        title: raw.title as string,
        source_type: raw.source_type as Recipe['source_type'],
        source_url: (raw.source_url as string | null) ?? null,
        source_author: (raw.source_author as string | null) ?? null,
        image_path: (raw.image_path as string | null) ?? null,
        servings: (raw.servings as number | null) ?? null,
        total_minutes: (raw.total_minutes as number | null) ?? null,
        status: (raw.status as Recipe['status']) ?? 'complete',
        lang: (raw.lang as string | null) ?? null,
        raw_text: (raw.raw_text as string | null) ?? null,
        ingredients: (raw.ingredients as Recipe['ingredients'] | null) ?? [],
        steps: (raw.steps as Recipe['steps'] | null) ?? [],
        tags: (raw.tags as Recipe['tags'] | null) ?? [],
        nutrition: (raw.nutrition as Recipe['nutrition'] | null) ?? null,
        variant: (raw.variant as Recipe['variant'] | null) ?? null,
      }
    case 'cook_logs':
      return {
        ...base,
        recipe_id: raw.recipe_id as string,
        cooked_on: raw.cooked_on as string,
        rating: (raw.rating as CookLog['rating']) ?? null,
        actual_minutes: (raw.actual_minutes as number | null) ?? null,
        note: (raw.note as string | null) ?? null,
      }
    case 'shopping_items':
      return {
        ...base,
        name_key: raw.name_key as string,
        name_display: raw.name_display as string,
        qty: (raw.qty as number | null) ?? null,
        unit: (raw.unit as string | null) ?? null,
        checked: (raw.checked as boolean | null) ?? false,
        from_recipe_ids: (raw.from_recipe_ids as string[] | null) ?? [],
      }
    case 'imports':
      return {
        ...base,
        kind: raw.kind as ImportJob['kind'],
        payload: (raw.payload as string | null) ?? '',
        status: raw.status as ImportJob['status'],
        error: (raw.error as string | null) ?? null,
        recipe_id: (raw.recipe_id as string | null) ?? null,
      }
  }
}

async function pullTable(table: SyncTable | PullOnlyTable): Promise<void> {
  const cursorKey = `cursor_${table}`
  const cursor = (await db.meta.get(cursorKey))?.value ?? '1970-01-01T00:00:00Z'
  const { data, error } = await supabase!
    .from(table)
    .select('*')
    .gt('updated_at', cursor)
    .order('updated_at', { ascending: true })
    .limit(1000)
  if (error) throw error
  if (!data || data.length === 0) return

  const pending = new Set((await db.outbox.toArray()).map((o) => o.row_id))

  await db.transaction(
    'rw',
    [db.recipes, db.cook_logs, db.shopping_items, db.imports, db.meta],
    async () => {
      for (const raw of data as RemoteRow[]) {
        const row = normalize(table, raw)
        // Lokale, noch nicht gepushte Änderung ist neuer → behalten (last write wins).
        // `imports` schreibt nur der Server, da gibt es nichts zu verteidigen.
        if (table !== 'imports') {
          const local = await db.table(table).get(row.id)
          if (local && pending.has(row.id) && newerOrEqual(local.updated_at, row.updated_at)) continue
        }
        await db.table(table).put(row)
      }
      await db.meta.put({
        key: cursorKey,
        value: (data[data.length - 1] as RemoteRow).updated_at as string,
      })
    },
  )
}

let syncing = false

export async function syncNow(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  if (!navigator.onLine) {
    setSnapshot({ state: 'offline' })
    return
  }
  if (syncing) return
  syncing = true
  setSnapshot({ state: 'syncing' })
  try {
    const pushError = await pushOutbox()
    for (const table of PULL_ORDER) await pullTable(table)
    if (pushError) {
      console.error('[sync]', pushError)
      setSnapshot({ state: 'error', lastError: pushError })
      return
    }
    const t = nowIso()
    await db.meta.put({ key: 'last_sync', value: t })
    setSnapshot({ state: 'synced', lastSyncAt: t, lastError: null })
  } catch (err) {
    const message = errMsg(err)
    console.error('[sync]', message)
    setSnapshot({ state: 'error', lastError: message })
  } finally {
    syncing = false
  }
}

/**
 * Nach dem ersten Login: alles Lokale einmalig in die Outbox legen,
 * damit vor dem Login entstandene Rezepte hochwandern.
 */
export async function onSignedIn(session: Session): Promise<void> {
  const flagKey = `initial_push_${session.user.id}`
  const done = await db.meta.get(flagKey)
  if (!done) {
    const [recipes, logs, items] = await Promise.all([
      db.recipes.toArray(),
      db.cook_logs.toArray(),
      db.shopping_items.toArray(),
    ])
    await db.transaction('rw', db.outbox, db.meta, async () => {
      for (const r of recipes) await db.outbox.add({ table: 'recipes', op: 'upsert', row_id: r.id })
      for (const l of logs) await db.outbox.add({ table: 'cook_logs', op: 'upsert', row_id: l.id })
      for (const i of items)
        await db.outbox.add({ table: 'shopping_items', op: 'upsert', row_id: i.id })
      await db.meta.put({ key: flagKey, value: '1' })
    })
  }
  void syncNow()
}

/**
 * Rezept löschen. Bei aktivem Sync nur online (es gibt keinen Tombstone-Sync):
 * remote zuerst — das Cascade räumt die Kochlogs mit —, dann lokal.
 */
export async function deleteRecipeEverywhere(recipeId: string): Promise<void> {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      if (!navigator.onLine) throw new Error('offline')
      const { error } = await supabase.from('recipes').delete().eq('id', recipeId)
      if (error) throw error
    }
  }
  await db.transaction('rw', db.recipes, db.cook_logs, db.outbox, async () => {
    const logIds = (await db.cook_logs.where('recipe_id').equals(recipeId).primaryKeys()) as string[]
    await db.cook_logs.bulkDelete(logIds)
    await db.recipes.delete(recipeId)
    const gone = new Set<string>([recipeId, ...logIds])
    const stale = (await db.outbox.toArray()).filter((o) => gone.has(o.row_id))
    await db.outbox.bulkDelete(stale.map((o) => o.seq))
  })
}

let wired = false

/** Sync bei Reconnect und beim Zurückkehren in den Tab anstoßen. */
export function wireSyncEvents(): void {
  if (wired || !supabase) return
  wired = true
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
}
