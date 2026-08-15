import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { Button, inputClass, Wordmark } from '../components/ui'

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('Invalid login credentials')) return 'E-Mail oder Passwort stimmt nicht.'
  if (msg.includes('Email not confirmed'))
    return 'Die E-Mail ist noch nicht bestätigt — schau in dein Postfach.'
  if (msg.includes('Password should be')) return 'Das Passwort braucht mindestens 6 Zeichen.'
  return 'Hat nicht geklappt. Nochmal versuchen?'
}

type Mode = 'in' | 'up' | 'sent' | 'forgot' | 'forgot_sent'

export function AuthScreen() {
  const { signIn, signUp, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        setMode('forgot_sent')
      } else if (mode === 'in') {
        await signIn(email, password)
      } else {
        const result = await signUp(email, password)
        if (result === 'confirm_email') setMode('sent')
      }
    } catch (err) {
      setError(mapError(err))
    } finally {
      setBusy(false)
    }
  }

  const notice =
    mode === 'sent'
      ? {
          title: 'Fast fertig',
          body: `Wir haben eine Bestätigungs-Mail an ${email} geschickt. Einmal draufklicken, dann geht es los.`,
        }
      : mode === 'forgot_sent'
        ? {
            title: 'Mail unterwegs',
            body: `Wenn es zu ${email} ein Konto gibt, liegt jetzt ein Link zum Zurücksetzen im Postfach.`,
          }
        : null

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-2 text-sm text-soft">
            Rezepte aus Reels, TikToks und Foodblogs an einem Ort.
          </p>
        </div>

        {notice ? (
          <div className="space-y-4 text-center">
            <h2 className="text-base font-semibold">{notice.title}</h2>
            <p className="text-sm text-soft">{notice.body}</p>
            <Button variant="secondary" full onClick={() => setMode('in')}>
              Zurück zur Anmeldung
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            {mode === 'forgot' && (
              <div className="pb-1 text-center">
                <h2 className="text-base font-semibold">Passwort vergessen</h2>
                <p className="mt-1 text-sm text-soft">
                  Trag deine E-Mail ein, dann schicken wir einen Link zum Zurücksetzen.
                </p>
              </div>
            )}

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail"
              className={inputClass}
            />

            {mode !== 'forgot' && (
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                className={inputClass}
              />
            )}

            {error && <p className="text-sm text-clay-deep">{error}</p>}

            <Button type="submit" disabled={busy} full>
              {busy
                ? 'Moment…'
                : mode === 'in'
                  ? 'Anmelden'
                  : mode === 'up'
                    ? 'Konto anlegen'
                    : 'Link schicken'}
            </Button>

            <div className="flex justify-between pt-1 text-sm text-soft">
              {mode === 'forgot' ? (
                <button type="button" onClick={() => setMode('in')} className="hover:text-ink">
                  Zurück
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
                    className="hover:text-ink"
                  >
                    {mode === 'in' ? 'Konto anlegen' : 'Ich habe schon eins'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="hover:text-ink"
                  >
                    Passwort vergessen?
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
