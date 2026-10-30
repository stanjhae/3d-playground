import { createClient } from '@supabase/supabase-js'

import { shareCardHtml } from '../og-card.ts'
import { findPublishedDesign, publicImagePath } from './publication.ts'
import { type FlpServerEnv, flpServerEnv } from './server.ts'

/**
 * Crawler page for `/s/:slug` (#184), reached through the user-agent
 * rewrite in vercel.json. Only a live publication's title and display name
 * reach the card; unknown, revoked or unconfigured all look the same.
 */
export async function handleSharePage({
  request,
  env = flpServerEnv(),
}: {
  request: Request
  env?: FlpServerEnv | null
}) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug') ?? undefined
  const published = env
    ? await findPublishedDesign({
        admin: createClient(env.url, env.secretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
        slug,
      })
    : null

  return new Response(
    shareCardHtml({
      origin: url.origin,
      shared: published
        ? {
            slug: published.slug,
            title: published.title,
            displayName: published.displayName,
            imageUrl: `${url.origin}${publicImagePath({ slug: published.slug })}`,
            imageType: published.renderPaths.get('view_front')?.endsWith('.png') ? 'image/png' : 'image/jpeg',
          }
        : null,
    }),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Short, so an unpublish clears the card from caches quickly.
        'Cache-Control': 'public, max-age=60',
      },
    },
  )
}
