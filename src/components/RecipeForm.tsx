import { useState } from 'react'
import { originalVersion, parseIngredientLine, toStep, type RecipeVersion } from '@core/recipe-core.ts'
import { addRecipe, saveVariant, updateRecipe } from '../lib/db'
import type { Recipe } from '../lib/types'
import { Button, Field, inputClass, Sheet } from './ui'

/**
 * Zutaten und Schritte werden zeilenweise eingegeben und beim Speichern vom
 * Rezept-Kern zerlegt — derselbe Parser, der auch Foodblog-Importe trägt.
 * Was er nicht sicher erkennt, bleibt als reiner Text stehen.
 */
function linesToIngredients(text: string) {
  let group: string | null = null
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // „Für die Soße:“ — eine Zeile, die nur mit Doppelpunkt endet, ist eine Überschrift
    if (trimmed.endsWith(':')) {
      group = trimmed.slice(0, -1).trim()
      continue
    }
    out.push(parseIngredientLine(trimmed, group))
  }
  return out
}

function ingredientsToLines(version: RecipeVersion): string {
  const lines: string[] = []
  let group: string | null = null
  for (const ing of version.ingredients) {
    if (ing.group !== group) {
      group = ing.group
      if (group) lines.push(`${group}:`)
    }
    lines.push(ing.raw)
  }
  return lines.join('\n')
}

export function RecipeForm({
  open,
  onClose,
  recipe,
  /**
   * 'variant' schreibt in die eigene Fassung und lässt das Original in Ruhe.
   * Bei selbst angelegten Rezepten gibt es nichts zu schonen — dort 'original'.
   */
  target = 'original',
  onSaved,
}: {
  open: boolean
  onClose: () => void
  recipe?: Recipe
  target?: 'original' | 'variant'
  onSaved?: (id: string) => void
}) {
  const editingVariant = target === 'variant' && recipe !== undefined
  const base: RecipeVersion | null = recipe
    ? editingVariant && recipe.variant
      ? {
          servings: recipe.variant.servings,
          total_minutes: recipe.variant.total_minutes,
          ingredients: recipe.variant.ingredients,
          steps: recipe.variant.steps,
        }
      : originalVersion(recipe)
    : null

  const [title, setTitle] = useState(recipe?.title ?? '')
  const [servings, setServings] = useState(base?.servings?.toString() ?? '')
  const [minutes, setMinutes] = useState(base?.total_minutes?.toString() ?? '')
  const [ingredients, setIngredients] = useState(base ? ingredientsToLines(base) : '')
  const [steps, setSteps] = useState(base ? base.steps.map((s) => s.text).join('\n') : '')
  const [note, setNote] = useState(recipe?.variant?.note ?? '')
  const [saving, setSaving] = useState(false)

  const toNumber = (value: string): number | null => {
    const n = Number(value.replace(',', '.'))
    return value.trim() && Number.isFinite(n) && n > 0 ? n : null
  }

  async function save(): Promise<void> {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const parsedIngredients = linesToIngredients(ingredients)
      const parsedSteps = steps
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => toStep(line))

      if (editingVariant && recipe) {
        await saveVariant(recipe.id, {
          servings: toNumber(servings),
          total_minutes: toNumber(minutes),
          ingredients: parsedIngredients,
          steps: parsedSteps,
          note: note.trim() || null,
        })
        // Der Titel gehört zum Rezept, nicht zur Fassung
        if (title.trim() !== recipe.title) await updateRecipe(recipe.id, { title: title.trim() })
        onSaved?.(recipe.id)
        onClose()
        return
      }

      const patch = {
        title: title.trim(),
        servings: toNumber(servings),
        total_minutes: toNumber(minutes),
        ingredients: parsedIngredients,
        steps: parsedSteps,
        // Von Hand nachgetragen heißt: das Rezept ist jetzt da
        status:
          parsedIngredients.length > 0 || parsedSteps.length > 0
            ? ('complete' as const)
            : (recipe?.status ?? ('complete' as const)),
      }

      if (recipe) {
        await updateRecipe(recipe.id, patch)
        onSaved?.(recipe.id)
      } else {
        const id = await addRecipe({ ...patch, source_type: 'manual' })
        onSaved?.(id)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const heading = editingVariant
    ? recipe?.variant
      ? 'Meine Version bearbeiten'
      : 'Meine Version anlegen'
    : recipe
      ? 'Rezept bearbeiten'
      : 'Rezept anlegen'

  return (
    <Sheet open={open} onClose={onClose} title={heading}>
      <div className="space-y-4">
        {editingVariant && !recipe?.variant && (
          <p className="rounded-xl bg-herb-soft px-3 py-2 text-sm text-herb-deep">
            Die Felder stehen auf dem Original. Ändere, was du anders machst — das Original bleibt
            daneben erhalten.
          </p>
        )}

        <Field label="Titel">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ofengemüse mit Feta"
            autoFocus={!recipe}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Portionen">
            <input
              className={inputClass}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              placeholder="2"
              inputMode="numeric"
            />
          </Field>
          <Field label="Dauer (Min)">
            <input
              className={inputClass}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="35"
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="Zutaten" hint="Eine pro Zeile. „Für die Soße:“ macht eine Überschrift.">
          <textarea
            className={`${inputClass} min-h-32 font-mono text-sm`}
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder={'400 g Nudeln\n2 Zehen Knoblauch\nSalz nach Geschmack'}
          />
        </Field>

        <Field label="Schritte" hint="Ein Schritt pro Zeile. Zeiten werden als Timer erkannt.">
          <textarea
            className={`${inputClass} min-h-32 text-sm`}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={'Nudeln in Salzwasser 9 Minuten kochen.\nKnoblauch in Öl anbraten.'}
          />
        </Field>

        {editingVariant && (
          <Field label="Was hast du geändert?" hint="Steht später über deiner Fassung.">
            <textarea
              className={`${inputClass} min-h-20 text-sm`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="halbe Chili, dafür doppelt Knoblauch"
            />
          </Field>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} full>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={!title.trim() || saving} full>
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
