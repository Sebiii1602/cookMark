import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { activeVersion, bySection, originalVersion, type RecipeVersion } from '@core/recipe-core.ts'
import { CookLogSheet } from '../components/CookLogSheet'
import { FilePick } from '../components/FilePick'
import { IngredientList } from '../components/IngredientList'
import { NutritionCard } from '../components/NutritionCard'
import { RecipeForm } from '../components/RecipeForm'
import { ServingScaler } from '../components/ServingScaler'
import { Button, Card, Chip, SectionLabel } from '../components/ui'
import { db, deleteCookLog, discardVariant } from '../lib/db'
import { fmtMinutes, fmtRelativeDay } from '../lib/dates'
import { useImageUrl } from '../lib/images'
import {
  fileToImageInput,
  ImportUnavailableError,
  pollForResult,
  requestImport,
} from '../lib/import'
import { addIngredientsToList } from '../lib/shopping'
import { deleteRecipeEverywhere } from '../lib/sync'
import type { Rating, Recipe } from '../lib/types'

const SOURCE_ACTION: Record<Recipe['source_type'], string> = {
  tiktok: 'Auf TikTok öffnen',
  instagram: 'Auf Instagram öffnen',
  web: 'Original öffnen',
  image: 'Original öffnen',
  text: 'Original öffnen',
  manual: 'Original öffnen',
}

const RATING_LABEL: Record<Rating, string> = {
  3: '♡ nochmal',
  2: '○ ganz ok',
  1: '× nie wieder',
}

export function RecipeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [tab, setTab] = useState<'variant' | 'original'>('variant')
  const [factor, setFactor] = useState(1)
  const [editing, setEditing] = useState<'none' | 'original' | 'variant'>('none')
  const [logging, setLogging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const [listNote, setListNote] = useState<string | null>(null)

  const recipe = useLiveQuery(() => db.recipes.get(id), [id])
  const cookLogs = useLiveQuery(
    () => db.cook_logs.where('recipe_id').equals(id).reverse().sortBy('cooked_on'),
    [id],
  )
  const imageUrl = useImageUrl(recipe?.image_path ?? null)

  // Aus dem Kochmodus zurück: gleich nach dem Eintrag fragen
  useEffect(() => {
    if (params.get('gekocht') === '1') {
      setLogging(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  async function addScreenshot(file: File): Promise<void> {
    setUploading(true)
    setUploadNote('Wird gelesen…')
    try {
      await requestImport({ image: await fileToImageInput(file), recipeId: id })
      setUploadNote('Läuft — die Zutaten erscheinen gleich hier.')
      pollForResult()
    } catch (err) {
      setUploadNote(
        err instanceof ImportUnavailableError || err instanceof Error
          ? err.message
          : 'Hat nicht geklappt.',
      )
    } finally {
      setUploading(false)
    }
  }

  if (recipe === undefined) return null
  if (recipe === null) {
    return (
      <div className="mx-auto max-w-md px-4 pb-28 pt-6">
        <p className="text-soft">Dieses Rezept gibt es nicht (mehr).</p>
        <Link to="/" className="mt-3 inline-block text-sm text-herb-deep">
          Zurück zu den Rezepten
        </Link>
      </div>
    )
  }

  async function remove(): Promise<void> {
    setDeleteError(null)
    try {
      await deleteRecipeEverywhere(id)
      navigate('/')
    } catch (err) {
      setDeleteError(
        err instanceof Error && err.message === 'offline'
          ? 'Löschen geht nur online — sonst käme das Rezept beim nächsten Sync zurück.'
          : 'Löschen hat nicht geklappt.',
      )
    }
  }

  const hasVariant = recipe.variant !== null
  const showingVariant = hasVariant && tab === 'variant'
  const version: RecipeVersion = showingVariant ? activeVersion(recipe) : originalVersion(recipe)
  const needsRecipe = recipe.status === 'needs_recipe'
  /**
   * In die eigene Fassung schreiben lohnt nur, wenn es ein Original gibt, das
   * geschont werden will. Bei selbst angelegten Rezepten und bei Karten, in
   * denen noch gar kein Rezept steckt, wird direkt das Original gefüllt —
   * sonst stünde die eigene Version vor einem leeren Original.
   */
  const editsOriginal =
    recipe.source_type === 'manual' ||
    (recipe.ingredients.length === 0 && recipe.steps.length === 0)

  async function toShoppingList(): Promise<void> {
    const count = await addIngredientsToList(version.ingredients, id, factor)
    setListNote(`${count} ${count === 1 ? 'Posten' : 'Posten'} auf der Liste.`)
  }

  return (
    <div className="pb-28">
      {imageUrl && (
        <div className="aspect-[4/3] w-full overflow-hidden bg-paper sm:aspect-[16/9]">
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mx-auto max-w-md px-4 pt-4">
        <Link to="/" className="mb-3 inline-block text-sm text-soft hover:text-ink">
          ← Rezepte
        </Link>

        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{recipe.title}</h1>

        {recipe.source_author && (
          <p className="mt-1 text-sm text-soft">von {recipe.source_author}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {version.total_minutes !== null && <Chip>{fmtMinutes(version.total_minutes)}</Chip>}
          {version.servings !== null && <Chip>{version.servings} Portionen</Chip>}
          {recipe.tags.map((tag) => (
            <Chip
              key={tag.label}
              tone={tag.confirmed === true ? 'herb' : 'neutral'}
              struck={tag.confirmed === false}
            >
              {tag.confirmed === true && '✓ '}
              {tag.label}
            </Chip>
          ))}
        </div>

        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-herb-deep hover:underline"
          >
            {SOURCE_ACTION[recipe.source_type]} ↗
          </a>
        )}

        {needsRecipe && (
          <Card className="mt-4 border-clay/40 bg-clay-soft">
            <p className="text-sm font-medium text-clay-deep">Im Post stand kein Rezept.</p>
            <p className="mt-1 text-sm text-clay-deep/90">
              Bild, Link und Creator sind gespeichert — die Zutaten nicht, weil sie nirgends
              standen. Schick einen Screenshot nach oder trag sie von Hand ein.
            </p>
            <div className="mt-3">
              <FilePick tone="clay" disabled={uploading} onPick={(file) => void addScreenshot(file)}>
                Screenshot auswählen
              </FilePick>
            </div>
            {uploadNote && <p className="mt-2 text-sm text-clay-deep">{uploadNote}</p>}
          </Card>
        )}

        {/* Original ↔ eigene Fassung. Erscheint erst, wenn es beides gibt. */}
        {hasVariant && (
          <div className="mt-5 flex overflow-hidden rounded-xl border border-line">
            {(
              [
                ['variant', 'Meine Version'],
                ['original', 'Original'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`grow px-3 py-2 text-sm font-medium transition-colors ${
                  tab === key ? 'bg-herb text-white' : 'bg-card text-soft hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {showingVariant && recipe.variant?.note && (
          <p className="mt-3 rounded-xl bg-herb-soft px-3 py-2 text-sm text-herb-deep">
            {recipe.variant.note}
          </p>
        )}
        {hasVariant && !showingVariant && (
          <p className="mt-3 text-sm text-faint">
            So stand es in der Quelle — unverändert, egal was du an deiner Fassung drehst.
          </p>
        )}

        {version.ingredients.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Zutaten</SectionLabel>
              <ServingScaler
                servings={version.servings}
                factor={factor}
                onChange={(f) => {
                  setFactor(f)
                  setListNote(null)
                }}
              />
            </div>
            <Card>
              <IngredientList ingredients={version.ingredients} factor={factor} />
              <div className="mt-4 border-t border-line pt-3">
                <Button variant="secondary" onClick={() => void toShoppingList()} full>
                  Auf die Einkaufsliste
                </Button>
                {listNote && (
                  <p className="mt-2 text-center text-sm text-herb-deep">
                    {listNote}{' '}
                    <Link to="/einkaufen" className="underline">
                      Ansehen
                    </Link>
                  </p>
                )}
              </div>
            </Card>
          </section>
        )}

        {version.steps.length > 0 && (
          <section className="mt-6">
            <SectionLabel>Zubereitung</SectionLabel>
            <Card>
              {/* Nummeriert wird durchgehend, auch über die Abschnitte hinweg —
                  im Kochmodus steht „Schritt 7 von 12“, und das soll dieselbe
                  Zahl sein wie hier. */}
              <div className="space-y-4">
                {bySection(version.steps).map(([group, items], section, all) => {
                  const offset = all
                    .slice(0, section)
                    .reduce((n, [, previous]) => n + previous.length, 0)
                  return (
                    <div key={group ?? section}>
                      {group && (
                        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
                          {group}
                        </div>
                      )}
                      <ol className="space-y-3">
                        {items.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm leading-relaxed">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-herb-soft text-[11px] font-semibold text-herb-deep">
                              {offset + i + 1}
                            </span>
                            <span>{step.text}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                })}
              </div>
            </Card>
            <Button
              className="mt-3"
              full
              onClick={() => navigate(`/rezept/${id}/kochen?p=${factor}`)}
            >
              Kochmodus starten
            </Button>
          </section>
        )}

        {/* Der Beleg: was tatsächlich im Post stand. Alles oben ist daraus abgeschrieben. */}
        {recipe.raw_text && (
          <details className="mt-6 rounded-2xl border border-line bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium text-soft">
              Original-Text aus dem Post
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-soft">
              {recipe.raw_text}
            </p>
          </details>
        )}

        <NutritionCard recipe={recipe} />

        {cookLogs && cookLogs.length > 0 && (
          <section className="mt-6">
            <SectionLabel>Schon gekocht</SectionLabel>
            <Card className="divide-y divide-line p-0">
              {cookLogs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">
                      {fmtRelativeDay(log.cooked_on)}
                      {log.rating && (
                        <span className="ml-2 text-soft">{RATING_LABEL[log.rating]}</span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-baseline gap-3">
                      {log.actual_minutes !== null && (
                        <span className="text-sm tabular-nums text-soft">
                          {fmtMinutes(log.actual_minutes)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteCookLog(log.id)}
                        className="text-xs text-faint hover:text-clay-deep"
                        aria-label="Eintrag löschen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {log.note && <p className="mt-1 text-sm text-soft">{log.note}</p>}
                </div>
              ))}
            </Card>
          </section>
        )}

        <div className="mt-8 space-y-2">
          <Button variant="secondary" onClick={() => setLogging(true)} full>
            Gekocht eintragen
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setEditing(editsOriginal ? 'original' : 'variant')}
              full
            >
              {needsRecipe
                ? 'Rezept eintragen'
                : editsOriginal
                  ? 'Bearbeiten'
                  : hasVariant
                    ? 'Meine Version bearbeiten'
                    : 'Eigene Version anlegen'}
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} full>
              Löschen
            </Button>
          </div>
          {hasVariant && (
            <button
              type="button"
              onClick={() => void discardVariant(id)}
              className="w-full py-1 text-center text-sm text-soft hover:text-ink"
            >
              Meine Version verwerfen
            </button>
          )}
        </div>

        {confirmDelete && (
          <Card className="mt-3">
            <p className="text-sm">„{recipe.title}“ endgültig löschen?</p>
            {deleteError && <p className="mt-2 text-sm text-clay-deep">{deleteError}</p>}
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} full>
                Behalten
              </Button>
              <Button variant="danger" onClick={() => void remove()} full>
                Löschen
              </Button>
            </div>
          </Card>
        )}
      </div>

      {editing !== 'none' && (
        <RecipeForm
          open
          recipe={recipe}
          target={editing}
          onClose={() => setEditing('none')}
          onSaved={() => setTab('variant')}
        />
      )}

      {logging && <CookLogSheet open onClose={() => setLogging(false)} recipe={recipe} />}
    </div>
  )
}
