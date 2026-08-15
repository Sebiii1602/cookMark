import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, SectionLabel } from '../components/ui'
import { db } from '../lib/db'
import { useAuth, UnsyncedDataError } from '../lib/auth'
import { syncNow, useSyncStatus } from '../lib/sync'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import { fmtTimeAgo } from '../lib/dates'

const THEME_OPTIONS: [ThemePref, string][] = [
  ['system', 'System'],
  ['light', 'Hell'],
  ['dark', 'Dunkel'],
]

const SYNC_TEXT: Record<string, string> = {
  disabled: 'Nur auf diesem Gerät — es sind keine Supabase-Zugangsdaten hinterlegt.',
  offline: 'Offline. Änderungen werden gesichert, sobald wieder Netz da ist.',
  syncing: 'Synchronisiert gerade…',
  synced: 'Alles gesichert.',
  error: 'Beim Synchronisieren ist etwas schiefgegangen.',
}

export function More() {
  const { cloud, session, signOut } = useAuth()
  const sync = useSyncStatus()
  const [theme, setTheme] = useState<ThemePref>(getThemePref)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const pending = useLiveQuery(() => db.outbox.count(), [])
  const counts = useLiveQuery(
    async () => ({
      recipes: await db.recipes.count(),
      logs: await db.cook_logs.count(),
    }),
    [],
  )

  function pickTheme(pref: ThemePref): void {
    setThemePref(pref)
    setTheme(pref)
  }

  /** Alles Lokale als JSON — damit die Daten dir gehören und nicht der App. */
  async function exportJson(): Promise<void> {
    const [recipes, cookLogs, shoppingItems] = await Promise.all([
      db.recipes.toArray(),
      db.cook_logs.toArray(),
      db.shopping_items.toArray(),
    ])
    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), recipes, cookLogs, shoppingItems }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cookmark-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function leave(): Promise<void> {
    setSignOutError(null)
    try {
      await signOut()
    } catch (err) {
      setSignOutError(
        err instanceof UnsyncedDataError
          ? 'Es liegen noch ungesicherte Änderungen auf diesem Gerät. Abmelden würde sie löschen — erst synchronisieren, dann nochmal.'
          : 'Abmelden hat nicht geklappt.',
      )
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-5">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Mehr</h1>

      <section className="mb-6">
        <SectionLabel>Synchronisierung</SectionLabel>
        <Card>
          <p className="text-sm">{SYNC_TEXT[sync.state] ?? sync.state}</p>
          {sync.lastSyncAt && (
            <p className="mt-1 text-sm text-faint">Zuletzt {fmtTimeAgo(sync.lastSyncAt)}</p>
          )}
          {/* Die Outbox füllt sich auch ohne Cloud (damit nach dem ersten Login
              alles hochwandert) — nur zeigen, wo es auch einen Server gibt. */}
          {cloud && pending !== undefined && pending > 0 && (
            <p className="mt-1 text-sm text-clay-deep">
              {pending} {pending === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf den Server.
            </p>
          )}
          {sync.lastError && (
            <p className="mt-2 rounded-lg bg-clay-soft px-3 py-2 font-mono text-xs text-clay-deep">
              {sync.lastError}
            </p>
          )}
          {cloud && (
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => void syncNow()}
              disabled={sync.state === 'syncing'}
            >
              Jetzt synchronisieren
            </Button>
          )}
        </Card>
      </section>

      <section className="mb-6">
        <SectionLabel>Darstellung</SectionLabel>
        <Card>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(([pref, label]) => (
              <button
                key={pref}
                type="button"
                onClick={() => pickTheme(pref)}
                className={`grow rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  theme === pref
                    ? 'border-herb bg-herb-soft text-herb-deep'
                    : 'border-line text-soft hover:border-herb'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section className="mb-6">
        <SectionLabel>Deine Daten</SectionLabel>
        <Card>
          {counts && (
            <p className="text-sm text-soft">
              {counts.recipes} {counts.recipes === 1 ? 'Rezept' : 'Rezepte'}, {counts.logs}{' '}
              {counts.logs === 1 ? 'Kocheintrag' : 'Kocheinträge'}
            </p>
          )}
          <Button variant="secondary" className="mt-3" onClick={() => void exportJson()}>
            Als JSON exportieren
          </Button>
        </Card>
      </section>

      {cloud && session && (
        <section>
          <SectionLabel>Konto</SectionLabel>
          <Card>
            <p className="text-sm text-soft">{session.user.email}</p>
            {signOutError && <p className="mt-2 text-sm text-clay-deep">{signOutError}</p>}
            <Button variant="danger" className="mt-3" onClick={() => void leave()}>
              Abmelden
            </Button>
          </Card>
        </section>
      )}
    </div>
  )
}
