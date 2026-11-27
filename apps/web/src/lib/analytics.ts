/**
 * Product analytics (docs/analytics.md): PostHog EU cloud, anonymous and
 * cookieless. Nothing here knows who anyone is:
 * - `persistence: 'memory'`, so no cookie or storage, and every page load
 *   is a new anonymous visitor;
 * - `person_profiles: 'never'` and no `identify`, ever;
 * - properties pass {@link cleanProperties}: a fixed set of names, and
 *   short id-like values only, so no email, title, handle or words;
 * - URLs are reduced to their route ({@link routeOfPath}), so a share
 *   slug, look id or public handle never leaves the browser;
 * - replay masks every input and all text.
 *
 * With no `VITE_POSTHOG_KEY`, or with Do Not Track / Global Privacy
 * Control on, nothing loads and every call is a no-op.
 */

export type AnalyticsEnv = {
  VITE_POSTHOG_KEY?: string
  VITE_POSTHOG_HOST?: string
  [name: string]: unknown
}

export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com'

/** True when this build has a PostHog key (the privacy page says so). */
export const PRODUCT_ANALYTICS = Boolean((import.meta.env?.VITE_POSTHOG_KEY as string | undefined)?.trim())

export type AnalyticsValue = string | number | boolean

export type AnalyticsProperties = Record<string, AnalyticsValue | null | undefined>

/** The only property names an event may carry. */
export const ALLOWED_PROPERTIES = [
  'action',
  'bucket',
  'count',
  'face',
  'fabric',
  'finish',
  'garment',
  'kind',
  'method',
  'neck',
  'panel',
  'pattern',
  'preset',
  'rating',
  'result',
  'route',
  'seconds',
  'source',
  'step',
  'surface',
  'tool',
  'view',
  'words',
  'sketch',
] as const

const ALLOWED = new Set<string>(ALLOWED_PROPERTIES)

/** A catalogue id or enum value: no spaces, no `@`, nothing long. */
const ID_LIKE = /^[a-z0-9][a-z0-9_.:-]{0,39}$/i

/**
 * Keeps known names with id-like or numeric values and drops the rest, so
 * a caller's slip can't send an email, a design title or a word.
 */
export function cleanProperties({ properties }: { properties?: AnalyticsProperties }) {
  const clean: Record<string, AnalyticsValue> = {}

  for (const [key, value] of Object.entries(properties ?? {})) {
    if (!ALLOWED.has(key)) {
      continue
    }

    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      clean[key] = value
    } else if (typeof value === 'string' && ID_LIKE.test(value) && !value.includes('@')) {
      clean[key] = value
    }
  }

  return clean
}

/** The site's routes; a path with an id in it is reported by its pattern. */
const STATIC_ROUTES = new Set([
  '/',
  '/account-deleted',
  '/create',
  '/privacy',
  '/ranking',
  '/sign-in',
  '/soon',
  '/studio',
  '/terms',
  '/vote',
])

const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/s\/[^/]+\/?$/, '/s/:slug'],
  [/^\/look\/[^/]+\/?$/, '/look/:lookId'],
  [/^\/u\/[^/]+\/?$/, '/u/:handle'],
]

/** A pathname as its route, never with the id, query or hash in it. */
export function routeOfPath({ pathname }: { pathname: string }) {
  const path = pathname.split(/[?#]/)[0] || '/'
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path

  if (STATIC_ROUTES.has(trimmed)) {
    return trimmed
  }

  return DYNAMIC_ROUTES.find(([pattern]) => pattern.test(trimmed))?.[1] ?? '/:other'
}

const URL_PROPERTIES = ['$current_url', '$initial_current_url', '$session_entry_url']
const PATH_PROPERTIES = ['$pathname', '$initial_pathname', '$session_entry_pathname']
const DROPPED_PROPERTIES = [
  '$referrer',
  '$referring_domain',
  '$initial_referrer',
  '$initial_referring_domain',
  '$session_entry_referrer',
  '$session_entry_referring_domain',
  '$ip',
  '$el_text',
  // The page title can name a design (a share page's title is its title).
  'title',
  '$title',
]

type CaptureLike = { event: string; properties: Record<string, unknown>; $set?: unknown; $set_once?: unknown }

/**
 * The last step before an event leaves (`before_send`): every URL becomes
 * its route on this origin, referrers and IP go, person updates go, and
 * autocapture keeps the element path but no text or attributes.
 */
export function scrubEvent<T extends CaptureLike>(event: T | null): T | null {
  if (!event) {
    return null
  }

  const properties: Record<string, unknown> = { ...event.properties }

  for (const key of URL_PROPERTIES) {
    if (typeof properties[key] === 'string') {
      try {
        const url = new URL(properties[key] as string)
        properties[key] = `${url.origin}${routeOfPath({ pathname: url.pathname })}`
      } catch {
        delete properties[key]
      }
    }
  }

  for (const key of PATH_PROPERTIES) {
    if (typeof properties[key] === 'string') {
      properties[key] = routeOfPath({ pathname: properties[key] as string })
    }
  }

  for (const key of DROPPED_PROPERTIES) {
    delete properties[key]
  }

  if (typeof properties.$pathname === 'string') {
    properties.route = properties.$pathname
  }

  const { $set: _set, $set_once: _setOnce, ...rest } = event
  return { ...rest, properties } as T
}

/** Do Not Track or Global Privacy Control: either one means no analytics. */
export function prefersNoTracking({
  navigator: nav = globalThis.navigator,
  window: win = globalThis.window as unknown as { doNotTrack?: string } | undefined,
}: {
  navigator?: Partial<Navigator> & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  window?: { doNotTrack?: string } | undefined
} = {}) {
  const dnt = nav?.doNotTrack ?? win?.doNotTrack ?? nav?.msDoNotTrack
  return dnt === '1' || dnt === 'yes' || nav?.globalPrivacyControl === true
}

/** The key and host, or null when analytics is off. */
export function analyticsConfig({ env }: { env: AnalyticsEnv }) {
  const key = env.VITE_POSTHOG_KEY?.trim()

  if (!key) {
    return null
  }

  return { key, host: env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST }
}

/** The init options; exported so the privacy settings are tested. */
export function posthogOptions({ host }: { host: string }) {
  return {
    api_host: host,
    // Anonymous and cookieless.
    persistence: 'memory' as const,
    person_profiles: 'never' as const,
    save_referrer: false,
    respect_dnt: true,
    mask_personal_data_properties: true,
    property_denylist: ['$ip', '$referrer', '$referring_domain'],
    // Clicks and pageviews (per route, see before_send), rage and dead clicks.
    autocapture: { capture_copied_text: false },
    mask_all_text: true,
    mask_all_element_attributes: true,
    rageclick: true,
    capture_dead_clicks: true,
    capture_pageview: 'history_change' as const,
    capture_pageleave: true,
    // Replay: layout, clicks and movement only.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      recordHeaders: false,
      recordBody: false,
    },
    // Nothing else: errors have their own tunnel (O1), vitals their counts (P4).
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    before_send: scrubEvent,
  }
}

type Client = {
  capture: (event: string, properties?: Record<string, AnalyticsValue>) => void
}

let client: Client | null = null
let starting = false
const queue: Array<[string, Record<string, AnalyticsValue>]> = []
const QUEUE_LIMIT = 100

/**
 * Sends one event to PostHog, if analytics is on. Before PostHog has
 * loaded, events wait (up to a hundred); when it's off, they're dropped.
 */
export function capture({ name, properties }: { name: string; properties?: AnalyticsProperties }) {
  const clean = cleanProperties({ properties })

  if (client) {
    client.capture(name, clean)
  } else if (starting && queue.length < QUEUE_LIMIT) {
    queue.push([name, clean])
  }
}

/** True once analytics is starting or running (tests, friction signals). */
export function analyticsActive() {
  return starting || client !== null
}

/**
 * Loads PostHog when a key is set and the browser hasn't asked not to be
 * tracked. The library and its recorder load only then, from this site's
 * own bundle.
 */
export async function startAnalytics({
  env,
  load = loadPosthog,
}: {
  env: AnalyticsEnv
  load?: typeof loadPosthog
}) {
  const config = analyticsConfig({ env })

  if (!config || starting || client || typeof window === 'undefined' || prefersNoTracking()) {
    return false
  }

  starting = true

  try {
    client = await load({ key: config.key, host: config.host })
  } catch {
    client = null
  } finally {
    starting = false
  }

  for (const [name, properties] of queue.splice(0)) {
    client?.capture(name, properties)
  }

  return client !== null
}

async function loadPosthog({ key, host }: { key: string; host: string }): Promise<Client> {
  const [{ default: posthog }] = await Promise.all([import('posthog-js'), import('posthog-js/dist/recorder')])
  posthog.init(key, posthogOptions({ host }) as Parameters<typeof posthog.init>[1])
  return posthog
}

/** Tests only: back to a fresh page load. */
export function resetAnalyticsForTests() {
  client = null
  starting = false
  queue.length = 0
}
