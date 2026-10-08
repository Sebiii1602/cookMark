import { Link } from 'react-router-dom'
import { activeVersion, missingLabel, missingParts } from '@core/recipe-core.ts'
import { fmtMinutes } from '../lib/dates'
import { useImageUrl } from '../lib/images'
import type { Recipe } from '../lib/types'

const SOURCE_LABEL: Record<Recipe['source_type'], string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  web: 'Web',
  image: 'Foto',
  text: 'Text',
  manual: 'Selbst',
}

export function RecipeCard({ recipe, lastCooked }: { recipe: Recipe; lastCooked?: string }) {
  const imageUrl = useImageUrl(recipe.image_path)
  // Abgeleitet statt am Status abgelesen: manche Quellen liefern Zutaten ohne
  // Zubereitung und galten damit bisher als fertig.
  const missing = missingParts(recipe)
  const incomplete = missing.length > 0
  // Wenn du eine eigene Fassung hast, gilt in der Liste deine Zeit, nicht die der Quelle
  const minutes = activeVersion(recipe).total_minutes

  return (
    <Link
      to={`/rezept/${recipe.id}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors ${
        incomplete ? 'border-clay hover:border-clay-deep' : 'border-line hover:border-herb'
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-paper">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-faint">
            {incomplete ? '📎' : '🍳'}
          </div>
        )}
        {incomplete && (
          <span className="absolute left-2 top-2 rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
            {missingLabel(missing)}
          </span>
        )}
      </div>

      <div className="flex grow flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{recipe.title}</h3>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
          {minutes !== null && <span>{fmtMinutes(minutes)}</span>}
          <span>{recipe.source_author ?? SOURCE_LABEL[recipe.source_type]}</span>
          {lastCooked && <span className="text-herb-deep">· {lastCooked}</span>}
        </div>
      </div>
    </Link>
  )
}
