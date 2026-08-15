import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
}

/**
 * Hält den Bildschirm an, solange gekocht wird — mit klebrigen Händen tippt
 * niemand gern das Passwort neu ein.
 *
 * iOS kann den Lock verlieren, wenn die App kurz in den Hintergrund geht;
 * deshalb holen wir ihn beim Zurückkommen erneut. Wo die API fehlt, passiert
 * schlicht nichts.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const api = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }).wakeLock
    if (!api) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async (): Promise<void> => {
      try {
        const lock = await api.request('screen')
        if (cancelled) void lock.release()
        else sentinel = lock
      } catch {
        // Akkusparmodus oder verweigerte Erlaubnis — dann bleibt es beim Normalverhalten
      }
    }

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [active])
}
