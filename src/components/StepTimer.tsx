import { useEffect, useRef, useState } from 'react'
import { fmtClock } from '../lib/dates'

/**
 * Timer für einen Kochschritt. Läuft über einen Zeitstempel statt über einen
 * Zähler — sonst geht die Zeit verloren, sobald iOS die Seite in den
 * Hintergrund schiebt und die Intervalle drosselt.
 */
export function StepTimer({ seconds }: { seconds: number }) {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(seconds)
  const alerted = useRef(false)

  useEffect(() => {
    setEndsAt(null)
    setRemaining(seconds)
    alerted.current = false
  }, [seconds])

  useEffect(() => {
    if (endsAt === null) return
    const tick = (): void => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0 && !alerted.current) {
        alerted.current = true
        navigator.vibrate?.([200, 100, 200, 100, 400])
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  const running = endsAt !== null && remaining > 0
  const done = endsAt !== null && remaining === 0

  return (
    <button
      type="button"
      onClick={() => {
        if (done) {
          setEndsAt(null)
          setRemaining(seconds)
          alerted.current = false
        } else if (running) {
          setEndsAt(null)
          setRemaining(seconds)
        } else {
          setEndsAt(Date.now() + seconds * 1000)
        }
      }}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium tabular-nums transition-colors ${
        done
          ? 'border-transparent bg-clay text-white'
          : running
            ? 'border-clay bg-clay-soft text-clay-deep'
            : 'border-line bg-card text-soft hover:border-clay'
      }`}
    >
      <span>{done ? '⏰' : '⏱'}</span>
      <span>{done ? 'Zeit um — nochmal?' : fmtClock(remaining)}</span>
      {!running && !done && <span className="text-faint">starten</span>}
    </button>
  )
}
