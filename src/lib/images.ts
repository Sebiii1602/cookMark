import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const BUCKET = 'recipe-images'
const TTL_SECONDS = 60 * 60

/** Signierte URLs laufen ab — deshalb merken wir uns auch, wann. */
const cache = new Map<string, { url: string; expiresAt: number }>()

async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.expiresAt > Date.now()) return hit.url
  if (!supabase) return null

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error || !data) return null
  // Etwas früher ablaufen lassen als der Server, damit kein Bild mitten im Blick stirbt
  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + (TTL_SECONDS - 300) * 1000 })
  return data.signedUrl
}

/**
 * Liefert die anzeigbare URL zu einem Storage-Pfad. `null` heißt schlicht
 * „kein Bild“ — im lokalen Modus ohne Supabase ist das der Normalfall.
 */
export function useImageUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? (cache.get(path)?.url ?? null) : null))

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    let cancelled = false
    void signedUrl(path).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [path])

  return url
}
