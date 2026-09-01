import {
  getStoredDesign,
  hydrateDesignsStore,
} from '../src/lib/designs-store.ts'
import { lookRecipe, lookShareLine } from '../src/lib/look-recipe.ts'
import { lookCardHtml, lookShareImage } from '../src/lib/og-card.ts'

export async function GET(request?: Request) {
  const url = new URL(request?.url ?? 'http://localhost/api/og-page')
  const lookId = url.searchParams.get('id') ?? ''
  const origin = url.origin

  await hydrateDesignsStore()

  const design = lookId ? getStoredDesign({ id: lookId }) : null
  const recipe = design ? lookRecipe({ design }) : ''
  const shareImage = lookShareImage({
    origin,
    lookId,
    thumbnailDataUrl: design?.thumbnailDataUrl,
  })
  const pageUrl = lookId
    ? `${origin}/look/${encodeURIComponent(lookId)}`
    : `${origin}/`

  return new Response(
    lookCardHtml({
      title: design?.title || 'Fashion Leader Vote',
      author: design?.author || '',
      description: lookShareLine({
        recipe,
        author: design?.author || '',
      }),
      imageUrl: shareImage.imageUrl,
      imageType: shareImage.imageType,
      pageUrl,
    }),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    },
  )
}

export default {
  fetch(request: Request) {
    return GET(request)
  },
}
