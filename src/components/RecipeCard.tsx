import { Link } from 'react-router-dom'
import { activeVersion } from '@core/recipe-core.ts'
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
  const needsRecipe = recipe.status === 'needs_recipe'
  // Wenn du eine eigene Fassung hast, gilt in der Liste deine Zeit, nicht die der Quelle
  const minutes = activeVersion(recipe).total_minutes

  return (
    <Link
      to={`/rezept/${recipe.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm transition-colors hover:border-herb"
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
            {needsRecipe ? '📎' : '🍳'}
          </div>
        )}
        {needsRecipe && (
          <span className="absolute left-2 top-2 rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
            Rezept fehlt
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
