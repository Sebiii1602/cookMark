import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { fmtTimeAgo } from '../lib/dates'
import {
  canImportTextLocally,
  fileToImageInput,
  importTextLocally,
  ImportUnavailableError,
  normalizeRecipeUrl,
  pollForResult,
  requestImport,
} from '../lib/import'
import type { ImportJob } from '../lib/types'
import { FilePick } from './FilePick'
import { Button, Field, inputClass, Sheet } from './ui'

type Mode = 'link' | 'text' | 'foto'

const MODES: [Mode, string][] = [
  ['link', 'Link'],
  ['text', 'Text'],
  ['foto', 'Foto'],
]

const STATUS_TEXT: Record<ImportJob['status'], string> = {
  queued: 'wartet',
  running: 'läuft…',
  done: 'fertig',
  needs_input: 'kein Rezept im Post',
  failed: 'fehlgeschlagen',
}

export function ImportSheet({
  open,
  onClose,
  onManual,
}: {
  open: boolean
  onClose: () => void
  /** „Selbst eintippen“ — der Weg ohne Server. */
  onManual: () => void
}) {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const stopPolling = useRef<(() => void) | null>(null)
  const localText = canImportTextLocally()

  const recent = useLiveQuery(
    () => db.imports.orderBy('created_at').reverse().limit(5).toArray(),
    [],
  )

  useEffect(() => () => stopPolling.current?.(), [])

  async function pasteFromClipboard(): Promise<void> {
    try {
      const value = await navigator.clipboard.readText()
      const link = normalizeRecipeUrl(value)
      if (link) {
        setUrl(link)
        setError(null)
      } else {
        setError('In der Zwischenablage steht kein Link.')
      }
    } catch {
      setError('Die Zwischenablage lässt sich hier nicht lesen — bitte von Hand einfügen.')
    }
  }

  async function submit(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'link') {
        // Normalisiert, nicht nur geprueft: der Server bekommt die Adresse
        // samt Schema, auch wenn sie ohne eingefuegt wurde.
        const link = normalizeRecipeUrl(url)
        if (!link) throw new Error('Das sieht nicht nach einem Link aus.')
        await requestImport({ url: link })
      } else if (mode === 'text') {
        if (text.trim().length < 20) throw new Error('Der Text ist zu kurz für ein Rezept.')
        // Ohne Supabase, aber mit Groq-Schlüssel: das geht hier im Browser,
        // dauert ein paar Sekunden und ist danach sofort da — kein Server,
        // kein Warten auf den Sync.
        if (canImportTextLocally()) {
          const id = await importTextLocally(text.trim())
          if (!id) {
            throw new Error('In dem Text steckt kein Rezept — es fehlt eine Zutatenliste.')
          }
          setText('')
          onClose()
          return
        }
        await requestImport({ text: text.trim() })
      } else {
        if (!file) throw new Error('Erst ein Bild auswählen.')
        await requestImport({ image: await fileToImageInput(file) })
      }
      setSent(true)
      stopPolling.current = pollForResult()
      setUrl('')
      setText('')
      setFile(null)
    } catch (err) {
      setError(
        err instanceof ImportUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Hat nicht geklappt.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Rezept holen">
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {MODES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key)
                setError(null)
              }}
              className={`grow rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                mode === key
                  ? 'border-herb bg-herb-soft text-herb-deep'
                  : 'border-line text-soft hover:border-herb'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'link' && (
          <Field
            label="Link aus TikTok, Instagram oder einem Foodblog"
            hint="Teilen → Link kopieren, dann hier einfügen."
          >
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/…"
                inputMode="url"
                autoFocus
              />
              <Button variant="secondary" onClick={() => void pasteFromClipboard()}>
                Einfügen
              </Button>
            </div>
          </Field>
        )}

        {mode === 'text' && (
          <Field
            label="Rezepttext"
            hint={
              localText
                ? 'Läuft direkt hier im Browser über Groq — kostenlos und ohne Server. Dauert ein paar Sekunden.'
                : 'Für Seiten hinter einem Login: im Browser markieren, kopieren, hier einfügen.'
            }
          >
            <textarea
              className={`${inputClass} min-h-40 text-sm`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Zutaten und Zubereitung reinkopieren…"
              autoFocus
            />
          </Field>
        )}

        {mode === 'foto' && (
          <Field
            label="Screenshot oder Foto"
            hint="Funktioniert auch für Kochbuchseiten und handschriftliche Karten."
          >
            <div className="flex items-center gap-3">
              <FilePick onPick={setFile}>{file ? 'Anderes Bild' : 'Bild auswählen'}</FilePick>
              {file && <span className="truncate text-sm text-soft">{file.name}</span>}
            </div>
          </Field>
        )}

        {error && <p className="text-sm text-clay-deep">{error}</p>}

        {sent && !error && (
          <p className="rounded-xl bg-herb-soft px-3 py-2 text-sm text-herb-deep">
            Läuft. Das Rezept taucht gleich in der Liste auf — du kannst das Fenster zumachen.
          </p>
        )}

        <Button onClick={() => void submit()} disabled={busy} full>
          {busy ? (localText && mode === 'text' ? 'Liest…' : 'Schickt…') : 'Holen'}
        </Button>

        <button
          type="button"
          onClick={onManual}
          className="w-full py-1 text-center text-sm text-soft hover:text-ink"
        >
          Lieber selbst eintippen
        </button>

        {recent && recent.length > 0 && (
          <div className="border-t border-line pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">
              Zuletzt geholt
            </div>
            <ul className="space-y-1.5">
              {recent.map((job) => (
                <li key={job.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-soft">{job.payload}</span>
                  <span
                    className={`shrink-0 ${
                      job.status === 'failed' || job.status === 'needs_input'
                        ? 'text-clay-deep'
                        : 'text-faint'
                    }`}
                    title={job.error ?? undefined}
                  >
                    {STATUS_TEXT[job.status]} · {fmtTimeAgo(job.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
