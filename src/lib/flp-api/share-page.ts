import { createClient } from '@supabase/supabase-js'

import { garmentCredit, getGarment, sideViewAlt } from '../garments.ts'
import { embeddedJson, escapeHtml, injectBeforeRoot, replaceSiteHead } from '../html-shell.ts'
import { shareCardHead, shareCardHtml } from '../og-card.ts'
import { type PublicLimiter, sharedLimiter } from '../rate-limit.ts'
import type { PublicDesign } from './publication.ts'
import {
  PUBLIC_CACHE_CONTROL,
  PUBLIC_ROBOTS,
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

/**
 * The sleeve row under the three main views: two up at every width, and on
 * wider screens two-thirds wide, so each sleeve matches a main view's size.
 * `s.$slug.tsx` uses the same classes.
 */
export const SLEEVE_GRID_CLASS = 'grid grid-cols-2 gap-4 sm:mx-auto sm:w-2/3'

type ShellLoader = (origin: string) => Promise<string | null>

/**
 * The plain app shell. `/index.html` is the prerendered landing, so every
 * other page (this one included) starts from `/app.html` (docs/deploy.md).
 */
export const SHELL_PATH = '/app.html'

/** The built app shell, fetched from this deployment's own origin. */
async function fetchShell(origin: string) {
  try {
    const response = await fetch(`${origin}${SHELL_PATH}`, { headers: { Accept: 'text/html' } })
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

type StaticView = { kind: keyof PublicDesign['renders']; label: string; alt: string }

const STATIC_VIEWS: StaticView[] = [
  { kind: 'view_front', label: 'Front', alt: 'front view' },
  { kind: 'view_three_quarter', label: 'Three-quarter', alt: 'three-quarter view' },
  { kind: 'view_back', label: 'Back', alt: 'back view' },
]

/** Named from the wearer's side: render `left` is the wearer's right (#179). */
const STATIC_SLEEVE_VIEWS: StaticView[] = [
  { kind: 'view_left', label: "Wearer's right", alt: "wearer's right sleeve" },
  { kind: 'view_right', label: "Wearer's left", alt: "wearer's left sleeve" },
]

/**
 * The shared page's views as plain HTML inside `#root`, so the preloaded
 * front image shows before the app's JavaScript arrives (#182). It mirrors
 * `s.$slug.tsx` and sits over the app (outside `#root`, which React clears
 * on mount) until the page has rendered and removes it, so there is no
 * blank frame in between.
 */
/** The garment's CC BY credit for the link preview, when it has one. */
function shareCredit({ garmentId }: { garmentId: string }) {
  const credit = garmentCredit({ garmentId })
  return credit ? { credit: `${credit.label}, ${credit.license}` } : {}
}

function staticShareMarkup({ payload }: { payload: PublicDesign }) {
  const title = escapeHtml({ value: payload.title })
  const credit = garmentCredit({ garmentId: payload.garmentId })
  const garment = `${escapeHtml({ value: getGarment({ garmentId: payload.garmentId }).label })}${
    credit ? ` (${escapeHtml({ value: `${credit.label}, ${credit.license}` })})` : ''
  } · `
  const byline = `${payload.displayName ? `By ${escapeHtml({ value: payload.displayName })} · ` : ''}${garment}version ${payload.seq}`
  // Sleeves sit below the fold: lazy, so they never slow the front view.
  const item = (view: StaticView, src: string, lazy = false) =>
    `<li class="flex min-w-0 flex-col gap-2"><img src="${escapeHtml({ value: src })}"${lazy ? ' loading="lazy"' : ''} alt="${title}, ${escapeHtml({ value: view.alt })}" class="aspect-[3/4] w-full border border-flv-line bg-flv-paper object-contain" /><span class="font-body text-xs tracking-[0.08em] text-flv-muted uppercase">${escapeHtml({ value: view.label })}</span></li>`
  const views = STATIC_VIEWS.map((view) => item(view, payload.renders[view.kind]!)).join('')
  // Older publications have no sleeve views; show only what exists.
  const sleeves = STATIC_SLEEVE_VIEWS.flatMap((view) => {
    const src = payload.renders[view.kind]
    return src ? [item({ ...view, alt: sideViewAlt({ alt: view.alt, garmentId: payload.garmentId }) }, src, true)] : []
  }).join('')
  const sleeveList = sleeves ? `<ul class="${SLEEVE_GRID_CLASS}">${sleeves}</ul>` : ''

  return `<div id="${STATIC_SHARE_ELEMENT_ID}" class="fixed inset-0 z-50 overflow-auto bg-flv-paper text-flv-ink"><main class="relative min-h-dvh bg-flv-paper text-flv-ink"><section class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-16"><header class="flex flex-col gap-1"><p class="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Shared design</p><h1 class="font-display text-4xl leading-tight [overflow-wrap:anywhere]">${title}</h1><p class="font-body text-sm text-flv-muted">${byline}</p></header><ul class="grid gap-4 sm:grid-cols-3">${views}</ul>${sleeveList}</section></main></div>`
}

/**
 * Replaces the shell's site-wide title and preview tags with this design's,
 * and adds the preload and payload. A published design also loses the
 * build's JS preloads: on a slow connection they share the line with the
 * first image and held it past the 3 s budget. Pure, so it is tested directly.
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
  const firstImageFirst = payload ? shell.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/gi, '') : shell

  const extra = payload
    ? `
    <link rel="preload" as="image" href="${payload.renders.view_front}" fetchpriority="high" />
    <script type="application/json" id="${PUBLIC_PAYLOAD_ELEMENT_ID}">${embeddedJson({ value: payload })}</script>`
    : ''

  const withHead = replaceSiteHead({ shell: firstImageFirst, head: `${head}${extra}` })

  return payload ? injectBeforeRoot({ shell: withHead, html: staticShareMarkup({ payload }) }) : withHead
}

export async function handleSharePage({
  request,
  env = flpServerEnv(),
  loadShell = fetchShell,
  limiter = sharedLimiter,
}: {
  request: Request
  env?: FlpServerEnv | null
  loadShell?: ShellLoader
  limiter?: PublicLimiter
}) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug') ?? url.pathname.match(/^\/s\/([^/]+)\/?$/)?.[1] ?? undefined
  // Over the limit (P2), the design isn't read or embedded: the page comes
  // back as a 429 with the plain app, which asks the public API itself and
  // says the design can't load right now if that is limited too.
  const decision = await limiter({ request, bucket: 'share_page' })
  // A failed read still serves the app, which asks again and can say so.
  const published = env && decision.allowed
    ? await findPublishedDesign({
        admin: createClient(env.url, env.secretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
        slug,
      }).catch((error: unknown) => {
        console.error('flp share page read failed', { error })
        return null
      })
    : null

  const shared = published
    ? {
        slug: published.slug,
        title: published.title,
        displayName: published.displayName,
        imageUrl: `${url.origin}${publicImagePath({ slug: published.slug })}`,
        imageType: published.renderPaths.get('view_front')?.endsWith('.png') ? 'image/png' : 'image/jpeg',
        ...shareCredit({ garmentId: published.garmentId }),
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
    status: decision.allowed ? 200 : decision.reason === 'limited' ? 429 : 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Unpublishing must take effect at once (#183).
      'Cache-Control': PUBLIC_CACHE_CONTROL,
      'X-Robots-Tag': PUBLIC_ROBOTS,
      ...(decision.allowed ? {} : { 'Retry-After': decision.reason === 'limited' ? String(decision.retryAfter) : '30' }),
    },
  })
}
