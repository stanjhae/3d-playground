import { withErrorReporting } from '../src/lib/error-tunnel.ts'
import {
  getStoredDesign,
  hydrateDesignsStore,
} from '../src/lib/designs-store.ts'
import { garmentCredit } from '../src/lib/garments.ts'
import { lookRecipe, lookShareLine } from '../src/lib/look-recipe.ts'
import { lookCardHtml, lookShareImage } from '../src/lib/og-card.ts'

async function render(request?: Request) {
  const url = new URL(request?.url ?? 'http://localhost/api/og-page')
  const lookId = url.searchParams.get('id') ?? ''
  const origin = url.origin

  await hydrateDesignsStore()

  const design = lookId ? getStoredDesign({ id: lookId }) : null
  const recipe = design ? lookRecipe({ design }) : ''
  const credit = design ? garmentCredit({ garmentId: design.garmentId }) : undefined
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
        credit: credit ? `${credit.label}, ${credit.license}` : undefined,
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

const reported = withErrorReporting((request) => render(request))

/** Without a request (unit tests) it renders the default card. */
export function GET(request?: Request) {
  return request ? reported(request) : render()
}

export default {
  fetch(request: Request) {
    return reported(request)
  },
}
