import { differenceInCalendarDays, format, parse } from 'date-fns'
import { de } from 'date-fns/locale'

/** Lokales Kalenderdatum als stabiler Schlüssel ('yyyy-MM-dd'). */
export const dateKey = (d: Date): string => format(d, 'yyyy-MM-dd')

export const todayKey = (): string => dateKey(new Date())

export const parseKey = (key: string): Date => parse(key, 'yyyy-MM-dd', new Date())

export const nowIso = (): string => new Date().toISOString()

/** „6. Juli“ */
export const fmtDayShort = (key: string): string =>
  format(parseKey(key), 'd. MMMM', { locale: de })

/** „6. Juli 2026“ */
export const fmtDayLong = (key: string): string =>
  format(parseKey(key), 'd. MMMM yyyy', { locale: de })

/** „heute“ / „gestern“ / „vor 5 Tagen“ / „6. Juli“ — für „zuletzt gekocht“. */
export function fmtRelativeDay(key: string): string {
  const days = differenceInCalendarDays(new Date(), parseKey(key))
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  if (days < 14) return 'letzte Woche'
  return fmtDayShort(key)
}

/**
 * Minuten menschlich: 45 → „45 Min“, 80 → „1 Std 20 Min“, 120 → „2 Std“.
 * Wird für Kochzeiten und Timer gebraucht.
 */
export function fmtMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} Min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} Std` : `${h} Std ${rest} Min`
}

/** „gerade eben“ / „vor 3 Minuten“ / „vor 2 Stunden“ / „am 6. Juli, 14:03“. */
export function fmtTimeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 90) return 'gerade eben'
  if (seconds < 3600) return `vor ${Math.round(seconds / 60)} Minuten`
  if (seconds < 86400) {
    const h = Math.round(seconds / 3600)
    return `vor ${h} ${h === 1 ? 'Stunde' : 'Stunden'}`
  }
  return `am ${format(new Date(iso), 'd. MMMM, HH:mm', { locale: de })}`
}

/** Sekunden als Timer-Anzeige: 90 → „1:30“, 3660 → „61:00“. */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}
