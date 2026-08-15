import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { onSignedIn, syncNow } from './sync'
import { clearLocalData, db } from './db'

/** Abmelden verweigert, solange noch ungesicherte lokale Änderungen offen sind. */
export class UnsyncedDataError extends Error {}

interface AuthValue {
  /** false = lokaler Modus ohne Supabase-Keys */
  cloud: boolean
  session: Session | null
  loading: boolean
  /** true, wenn die App über einen Passwort-Zurücksetzen-Link geöffnet wurde */
  recovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<'ok' | 'confirm_email'>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

/**
 * Bestätigungs- und Reset-Links sollen immer dorthin zurückführen, wo man
 * gerade ist (Vercel-URL, localhost, …). Ohne diese Angabe nimmt Supabase die
 * im Dashboard hinterlegte „Site URL“ — und die zeigt im Zweifel noch auf den
 * Standardwert localhost:3000.
 */
const redirectTo = (): string => window.location.origin

/** Recovery-Links kommen je nach Supabase-Flow als #type=recovery oder ?type=recovery */
function urlLooksLikeRecovery(): boolean {
  return (
    window.location.hash.includes('type=recovery') ||
    new URLSearchParams(window.location.search).get('type') === 'recovery'
  )
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [recovery, setRecovery] = useState(() => supabase !== null && urlLooksLikeRecovery())

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      // Beim Zurücksetzen zuerst das neue Passwort setzen lassen, nicht direkt rein
      if (data.session && !urlLooksLikeRecovery()) void onSignedIn(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_IN' && s && !urlLooksLikeRecovery()) void onSignedIn(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  /**
   * Funktioniert mit und ohne „Confirm email“ in Supabase: kommt eine Session
   * zurück, ist man direkt drin; sonst wartet eine Bestätigungs-Mail.
   */
  async function signUp(email: string, password: string): Promise<'ok' | 'confirm_email'> {
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo() },
    })
    if (error) throw error
    return data.session ? 'ok' : 'confirm_email'
  }

  async function requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
    if (error) throw error
  }

  async function updatePassword(password: string): Promise<void> {
    const { data, error } = await supabase!.auth.updateUser({ password })
    if (error) throw error
    setRecovery(false)
    // URL-Fragment mit den Recovery-Tokens entfernen, damit ein Reload nicht
    // wieder im Zurücksetzen-Modus landet
    window.history.replaceState(null, '', window.location.pathname)
    const { data: current } = await supabase!.auth.getSession()
    if (current.session) void onSignedIn(current.session)
    else if (data.user) setSession(null)
  }

  async function signOut(): Promise<void> {
    // Erst versuchen, alles Ausstehende zu sichern — Abmelden räumt danach
    // lokal auf, und das darf nie Daten mitnehmen, die nirgendwo sonst liegen.
    await syncNow()
    if ((await db.outbox.count()) > 0) {
      throw new UnsyncedDataError()
    }
    const { error } = await supabase!.auth.signOut()
    if (error) throw error
    // Erst nach bestätigtem Abmelden räumen — sonst würde ein Versuch offline
    // die lokalen Daten löschen, obwohl die Session clientseitig weiterbesteht.
    await clearLocalData()
  }

  return (
    <AuthContext.Provider
      value={{
        cloud: supabase !== null,
        session,
        loading,
        recovery,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth außerhalb des AuthProviders')
  return value
}
