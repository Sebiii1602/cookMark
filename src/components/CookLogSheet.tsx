import { useState } from 'react'
import { activeVersion } from '@core/recipe-core.ts'
import { addCookLog, setTagConfirmed } from '../lib/db'
import { fmtMinutes, todayKey } from '../lib/dates'
import type { Rating, Recipe } from '../lib/types'
import { Button, Field, inputClass, Sheet } from './ui'

const RATINGS: [Rating, string, string][] = [
  [3, '♡', 'nochmal'],
  [2, '○', 'ganz ok'],
  [1, '×', 'nie wieder'],
]

export function CookLogSheet({
  open,
  onClose,
  recipe,
}: {
  open: boolean
  onClose: () => void
  recipe: Recipe
}) {
  const [cookedOn, setCookedOn] = useState(todayKey())
  const [rating, setRating] = useState<Rating | null>(null)
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const claimed = activeVersion(recipe).total_minutes
  const actual = Number(minutes.replace(',', '.'))
  const hasActual = minutes.trim() !== '' && Number.isFinite(actual) && actual > 0
  /** „Angeblich 30 Min — waren 55.“ Ab 25 % Abweichung ist es der Rede wert. */
  const timeIsOff =
    claimed !== null && hasActual && Math.abs(actual - claimed) / claimed > 0.25

  const aiTags = recipe.tags.filter((t) => t.source === 'ai')

  async function save(): Promise<void> {
    if (saving) return
    setSaving(true)
    try {
      await addCookLog(recipe.id, {
        cooked_on: cookedOn,
        rating,
        actual_minutes: hasActual ? Math.round(actual) : null,
        note: note.trim() || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nachgekocht">
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-soft">Wie war's?</span>
          <div className="flex gap-2">
            {RATINGS.map(([value, icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(rating === value ? null : value)}
                className={`grow rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  rating === value
                    ? 'border-herb bg-herb-soft text-herb-deep'
                    : 'border-line text-soft hover:border-herb'
                }`}
              >
                <span className="mr-1.5">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Wann">
            <input
              type="date"
              className={inputClass}
              value={cookedOn}
              max={todayKey()}
              onChange={(e) => setCookedOn(e.target.value)}
            />
          </Field>
          <Field
            label="Gedauert (Min)"
            hint={claimed !== null ? `angesagt: ${fmtMinutes(claimed)}` : undefined}
          >
            <input
              className={inputClass}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder={claimed !== null ? String(claimed) : '45'}
              inputMode="numeric"
            />
          </Field>
        </div>

        {timeIsOff && (
          <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay-deep">
            {actual > (claimed ?? 0)
              ? `Deutlich länger als die angesagten ${fmtMinutes(claimed!)}.`
              : `Deutlich schneller als die angesagten ${fmtMinutes(claimed!)}.`}{' '}
            Unten kannst du das dem Rezept mitgeben.
          </p>
        )}

        <Field label="Notiz fürs nächste Mal">
          <textarea
            className={`${inputClass} min-h-24 text-sm`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="halbe Chili reicht, dafür doppelt Knoblauch"
          />
        </Field>

        {aiTags.length > 0 && (
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 text-sm font-medium text-soft">
              Hat gestimmt, was die KI behauptet hat?
            </div>
            <ul className="space-y-2">
              {aiTags.map((tag) => (
                <li key={tag.label} className="flex items-center justify-between gap-3">
                  <span
                    className={`text-sm ${tag.confirmed === false ? 'text-faint line-through' : ''}`}
                  >
                    {tag.label}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`${tag.label} stimmt`}
                      onClick={() =>
                        void setTagConfirmed(recipe.id, tag.label, tag.confirmed === true ? null : true)
                      }
                      className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                        tag.confirmed === true
                          ? 'border-herb bg-herb-soft text-herb-deep'
                          : 'border-line text-faint hover:border-herb'
                      }`}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      aria-label={`${tag.label} stimmt nicht`}
                      onClick={() =>
                        void setTagConfirmed(
                          recipe.id,
                          tag.label,
                          tag.confirmed === false ? null : false,
                        )
                      }
                      className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                        tag.confirmed === false
                          ? 'border-clay bg-clay-soft text-clay-deep'
                          : 'border-line text-faint hover:border-clay'
                      }`}
                    >
                      ✗
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} full>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={saving} full>
            {saving ? 'Speichert…' : 'Eintragen'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
