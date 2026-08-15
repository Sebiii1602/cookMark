import { functionsUrl, supabase } from './supabase'
import { ImportUnavailableError } from './import'
import { syncNow } from './sync'

/**
 * Stößt die Nährwert-Schätzung an. Bewusst ein eigener Knopf und kein
 * Automatismus beim Import: Nährwerte sind der einzige Wert in cookMark, der
 * geschätzt ist — das soll eine Entscheidung bleiben, keine Nebenwirkung.
 */
export async function requestNutrition(recipeId: string): Promise<void> {
  if (!supabase || !functionsUrl) {
    throw new ImportUnavailableError(
      'Die Schätzung läuft über den Server — dafür braucht cookMark die Supabase-Zugangsdaten.',
    )
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ImportUnavailableError('Nicht angemeldet.')

  const res = await fetch(`${functionsUrl}/nutrition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipe_id: recipeId }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Der Server hat mit ${res.status} geantwortet.`)

  await syncNow()
}
