import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { seedExamplesIfLocal } from './lib/examples'
import { wireSyncEvents } from './lib/sync'
import { TabBar } from './components/TabBar'
import { RecipeForm } from './components/RecipeForm'
import { ImportSheet } from './components/ImportSheet'
import { Recipes } from './routes/Recipes'
import { RecipeDetail } from './routes/RecipeDetail'
import { CookMode } from './routes/CookMode'
import { Shopping } from './routes/Shopping'
import { More } from './routes/More'
import { AuthScreen } from './routes/AuthScreen'
import { NewPasswordScreen } from './routes/NewPasswordScreen'

/**
 * Der Knopf, der aus „hab ich gesehen“ ein gespeichertes Rezept macht.
 * Nur auf der Liste — im Rezept selbst läge er sonst auf den Aktionen.
 */
function AddButton() {
  const [sheet, setSheet] = useState<'none' | 'import' | 'manual'>('none')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (pathname !== '/') return null
  return (
    <>
      <button
        type="button"
        onClick={() => setSheet('import')}
        aria-label="Rezept hinzufügen"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-herb text-2xl text-white shadow-lg transition-colors hover:bg-herb-deep"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        +
      </button>
      {sheet === 'import' && (
        <ImportSheet
          open
          onClose={() => setSheet('none')}
          onManual={() => setSheet('manual')}
        />
      )}
      {sheet === 'manual' && (
        <RecipeForm
          open
          onClose={() => setSheet('none')}
          onSaved={(id) => navigate(`/rezept/${id}`)}
        />
      )}
    </>
  )
}

function Shell() {
  // Der Kochmodus nimmt den ganzen Bildschirm — Tab-Leiste würde beim
  // Weiterwischen mit klebrigen Fingern nur im Weg sein.
  const cooking = /^\/rezept\/[^/]+\/kochen/.test(useLocation().pathname)
  return (
    <div
      className="min-h-dvh"
      style={{ paddingTop: cooking ? undefined : 'env(safe-area-inset-top)' }}
    >
      <main>
        <Routes>
          <Route path="/" element={<Recipes />} />
          <Route path="/rezept/:id" element={<RecipeDetail />} />
          <Route path="/rezept/:id/kochen" element={<CookMode />} />
          <Route path="/einkaufen" element={<Shopping />} />
          <Route path="/mehr" element={<More />} />
          <Route path="*" element={<Recipes />} />
        </Routes>
      </main>
      {!cooking && (
        <>
          <AddButton />
          <TabBar />
        </>
      )}
    </div>
  )
}

function Gate() {
  const { cloud, session, loading, recovery } = useAuth()

  useEffect(() => {
    wireSyncEvents()
    void seedExamplesIfLocal()
  }, [])

  if (cloud && loading) {
    return <div className="grid min-h-dvh place-items-center text-sm text-soft">Moment…</div>
  }
  // Reset-Link geöffnet: erst neues Passwort setzen, dann normal weiter
  if (cloud && recovery) return <NewPasswordScreen />
  if (cloud && !session) return <AuthScreen />
  return <Shell />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
