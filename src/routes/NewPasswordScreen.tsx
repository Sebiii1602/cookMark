import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { Button, inputClass, Wordmark } from '../components/ui'

export function NewPasswordScreen() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg.includes('Password should be')
          ? 'Das Passwort braucht mindestens 6 Zeichen.'
          : 'Hat nicht geklappt. Vielleicht ist der Link abgelaufen — dann fordere einen neuen an.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-2 text-sm text-soft">Neues Passwort setzen</p>
        </div>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Neues Passwort"
            className={inputClass}
            autoFocus
          />
          {error && <p className="text-sm text-clay-deep">{error}</p>}
          <Button type="submit" disabled={busy} full>
            {busy ? 'Moment…' : 'Passwort speichern'}
          </Button>
        </form>
      </div>
    </div>
  )
}
