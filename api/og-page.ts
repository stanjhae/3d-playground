import seedDesigns from '../data/designs.json' with { type: 'json' }

import type { Design } from '../src/lib/design-schema.ts'
import { lookCardHtml } from '../src/lib/og-card.ts'

function lookFromSeed({ lookId }: { lookId: string }) {
  return (seedDesigns as Design[]).find((design) => design.id === lookId) ?? null
}

export function GET(request?: Request) {
  const url = new URL(request?.url ?? 'http://localhost/api/og-page')
  const lookId = url.searchParams.get('id') ?? ''
  const origin = url.origin
  const design = lookId ? lookFromSeed({ lookId }) : null
  const imageUrl = `${origin}/api/og?lookId=${encodeURIComponent(lookId)}`
  const pageUrl = lookId
    ? `${origin}/look/${encodeURIComponent(lookId)}`
    : `${origin}/`

  return new Response(
    lookCardHtml({
      title: design?.title || 'Fashion Leader Vote',
      author: design?.author || '',
      imageUrl,
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
