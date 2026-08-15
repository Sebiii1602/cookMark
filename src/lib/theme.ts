export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'cookmark_theme'
const THEME_COLOR = { light: '#faf8f5', dark: '#14120f' } as const

export function getThemePref(): ThemePref {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

function apply(): void {
  const pref = getThemePref()
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  // Statusleiste (PWA) mitfärben
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

export function setThemePref(pref: ThemePref): void {
  if (pref === 'system') localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, pref)
  apply()
}

/** Einmal beim Start aufrufen — folgt danach auch Systemwechseln (bei „System“). */
export function initTheme(): void {
  apply()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') apply()
  })
}
