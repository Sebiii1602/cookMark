import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AISLE_LABEL, AISLE_ORDER, formatAmount, guessAisle, type Aisle } from '@core/recipe-core.ts'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { db, deleteShoppingItems, setShoppingChecked } from '../lib/db'
import { addManualItem } from '../lib/shopping'
import type { ShoppingItem } from '../lib/types'

export function Shopping() {
  const [entry, setEntry] = useState('')
  const items = useLiveQuery(() => db.shopping_items.toArray(), [])

  /** Die Abteilung leiten wir aus dem Namen ab — sie braucht keine eigene Spalte. */
  const sections = useMemo(() => {
    const open = (items ?? []).filter((i) => !i.checked)
    const map = new Map<Aisle, ShoppingItem[]>()
    for (const item of open) {
      const aisle = guessAisle(item.name_key)
      const list = map.get(aisle)
      if (list) list.push(item)
      else map.set(aisle, [item])
    }
    return AISLE_ORDER.filter((aisle) => map.has(aisle)).map(
      (aisle) => [aisle, map.get(aisle)!] as const,
    )
  }, [items])

  const done = useMemo(() => (items ?? []).filter((i) => i.checked), [items])

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!entry.trim()) return
    await addManualItem(entry.trim())
    setEntry('')
  }

  if (!items) return null

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Einkaufen</h1>
        {items.length > 0 && (
          <span className="text-sm text-faint">
            {items.length - done.length} offen
          </span>
        )}
      </header>

      <form onSubmit={(e) => void submit(e)} className="mb-5 flex gap-2">
        <input
          className={inputClass}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="500 g Kartoffeln"
        />
        <Button type="submit" disabled={!entry.trim()}>
          Drauf
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="Liste ist leer">
          Öffne ein Rezept und tippe auf „Auf die Einkaufsliste“ — Mengen aus mehreren Rezepten
          werden zusammengerechnet.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {sections.map(([aisle, list]) => (
            <section key={aisle}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">
                {AISLE_LABEL[aisle]}
              </div>
              <Card className="divide-y divide-line p-0">
                {list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void setShoppingChecked(item.id, true)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper"
                  >
                    <span className="h-5 w-5 shrink-0 rounded-md border border-line" />
                    <span className="grow text-sm">{item.name_display}</span>
                    <span className="shrink-0 text-sm tabular-nums text-soft">
                      {formatAmount(item.qty, item.unit)}
                    </span>
                  </button>
                ))}
              </Card>
            </section>
          ))}

          {done.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-faint">
                  Im Wagen ({done.length})
                </span>
                <button
                  type="button"
                  onClick={() => void deleteShoppingItems(done.map((i) => i.id))}
                  className="text-sm text-soft hover:text-ink"
                >
                  Abräumen
                </button>
              </div>
              <Card className="divide-y divide-line p-0">
                {done.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void setShoppingChecked(item.id, false)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-herb text-xs text-white">
                      ✓
                    </span>
                    <span className="grow text-sm text-faint line-through">
                      {item.name_display}
                    </span>
                  </button>
                ))}
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
