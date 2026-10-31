import { createClient } from '@supabase/supabase-js'

import { shareCardHead, shareCardHtml } from '../og-card.ts'
import type { PublicDesign } from './publication.ts'
import {
  PUBLIC_CACHE_CONTROL,
  findPublishedDesign,
  publicDesignPayload,
  publicImagePath,
} from './publication.ts'
import { type FlpServerEnv, flpServerEnv } from './server.ts'

/**
 * `/s/:slug` for every visitor (P04 #182, P06 #184). The app shell comes
 * back with the share card in its head, a preload for the front view and
 * the public payload as a JSON data block, so the first image starts
 * downloading with the app instead of after it. Crawlers read the same
 * head. Only a live publication's public fields are ever embedded; unknown,
 * revoked or unconfigured all look the same.
 */

export const PUBLIC_PAYLOAD_ELEMENT_ID = 'flp-public'
/** The pre-rendered views; `s.$slug.tsx` removes it once it has rendered. */
export const STATIC_SHARE_ELEMENT_ID = 'flp-static-share'

type ShellLoader = (origin: string) => Promise<string | null>

/** The built app shell, fetched from this deployment's own origin. */
async function fetchShell(origin: string) {
  try {
    const response = await fetch(`${origin}/index.html`, { headers: { Accept: 'text/html' } })
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

/** JSON that can sit inside `<script type="application/json">` safely. */
function embeddedJson({ value }: { value: unknown }) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split('\u2028')
    .join('\\u2028')
    .split('\u2029')
    .join('\\u2029')
}

function escapeHtml({ value }: { value: string }) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STATIC_VIEWS: Array<{ kind: keyof PublicDesign['renders']; label: string }> = [
  { kind: 'view_front', label: 'Front' },
  { kind: 'view_three_quarter', label: 'Three-quarter' },
  { kind: 'view_back', label: 'Back' },
]

/**
 * The shared page's views as plain HTML inside `#root`, so the preloaded
 * front image shows before the app's JavaScript arrives (#182). It mirrors
 * `s.$slug.tsx` and sits over the app (outside `#root`, which React clears
 * on mount) until the page has rendered and removes it, so there is no
 * blank frame in between.
 */
function staticShareMarkup({ payload }: { payload: PublicDesign }) {
  const title = escapeHtml({ value: payload.title })
  const byline = `${payload.displayName ? `By ${escapeHtml({ value: payload.displayName })} · ` : ''}version ${payload.seq}`
  const views = STATIC_VIEWS.map(
    (view) => `<li class="flex flex-col gap-2"><img src="${escapeHtml({ value: payload.renders[view.kind] })}" alt="${title}, ${view.label.toLowerCase()} view" class="aspect-[3/4] w-full border border-flv-line bg-flv-paper object-contain" /><span class="font-body text-xs tracking-[0.08em] text-flv-muted uppercase">${view.label}</span></li>`,
  ).join('')

  return `<div id="${STATIC_SHARE_ELEMENT_ID}" class="fixed inset-0 z-50 overflow-auto bg-flv-paper text-flv-ink"><main class="relative min-h-dvh bg-flv-paper text-flv-ink"><section class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-16"><header class="flex flex-col gap-1"><p class="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Shared design</p><h1 class="font-display text-4xl leading-tight">${title}</h1><p class="font-body text-sm text-flv-muted">${byline}</p></header><ul class="grid gap-4 sm:grid-cols-3">${views}</ul></section></main></div>`
}

/**
 * Replaces the shell's site-wide title and preview tags with this design's,
 * and adds the preload and payload. Pure, so it is tested directly.
 */
export function injectShareHead({
  shell,
  head,
  payload,
}: {
  shell: string
  head: string
  payload: PublicDesign | null
}) {
  const stripped = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\b[^>]*\b(?:property="og:[^"]*"|name="(?:twitter:[^"]*|description)")[^>]*>/gi, '')

  const extra = payload
    ? `
    <link rel="preload" as="image" href="${payload.renders.view_front}" fetchpriority="high" />
    <script type="application/json" id="${PUBLIC_PAYLOAD_ELEMENT_ID}">${embeddedJson({ value: payload })}</script>`
    : ''

  const withHead = stripped.replace(/<\/head>/i, `${head}${extra}\n  </head>`)

  return payload
    ? withHead.replace(/<div id="root"><\/div>/, `${staticShareMarkup({ payload })}<div id="root"></div>`)
    : withHead
}

export async function handleSharePage({
  request,
  env = flpServerEnv(),
  loadShell = fetchShell,
}: {
  request: Request
  env?: FlpServerEnv | null
  loadShell?: ShellLoader
}) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug') ?? url.pathname.match(/^\/s\/([^/]+)\/?$/)?.[1] ?? undefined
  const published = env
    ? await findPublishedDesign({
        admin: createClient(env.url, env.secretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
        slug,
      })
    : null

  const shared = published
    ? {
        slug: published.slug,
        title: published.title,
        displayName: published.displayName,
        imageUrl: `${url.origin}${publicImagePath({ slug: published.slug })}`,
        imageType: published.renderPaths.get('view_front')?.endsWith('.png') ? 'image/png' : 'image/jpeg',
      }
    : null

  const shell = await loadShell(url.origin)
  // Without the shell (e.g. a protected preview deployment), crawlers still
  // get the card; people get the card's text until the next load.
  const html = shell
    ? injectShareHead({
        shell,
        head: shareCardHead({ origin: url.origin, shared }),
        payload: published ? publicDesignPayload({ published }) : null,
      })
    : shareCardHtml({ origin: url.origin, shared })

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Unpublishing must take effect at once (#183).
      'Cache-Control': PUBLIC_CACHE_CONTROL,
    },
  })
}
