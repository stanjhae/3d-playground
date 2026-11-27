import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  DEFAULT_POSTHOG_HOST,
  analyticsActive,
  analyticsConfig,
  capture,
  cleanProperties,
  posthogOptions,
  prefersNoTracking,
  resetAnalyticsForTests,
  routeOfPath,
  scrubEvent,
  startAnalytics,
} from './analytics'
import { track } from './assumption-events'

const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))

beforeEach(() => {
  resetAnalyticsForTests()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeLoad() {
  const sent: Array<[string, unknown]> = []
  const load = vi.fn(async (_options: { key: string; host: string }) => ({ capture: (name: string, properties?: unknown) => void sent.push([name, properties]) }))
  return { sent, load }
}

describe('analyticsConfig', () => {
  test('off without a key', () => {
    expect(analyticsConfig({ env: {} })).toBeNull()
    expect(analyticsConfig({ env: { VITE_POSTHOG_KEY: '  ' } })).toBeNull()
  })

  test('EU cloud unless a host is set', () => {
    expect(analyticsConfig({ env: { VITE_POSTHOG_KEY: 'phc_test' } })).toEqual({ key: 'phc_test', host: DEFAULT_POSTHOG_HOST })
    expect(DEFAULT_POSTHOG_HOST).toBe('https://eu.i.posthog.com')
    expect(analyticsConfig({ env: { VITE_POSTHOG_KEY: 'k', VITE_POSTHOG_HOST: 'https://x.example' } })?.host).toBe('https://x.example')
  })
})

describe('no key: a no-op', () => {
  test('nothing loads and nothing is sent to PostHog', async () => {
    const { sent, load } = fakeLoad()
    expect(await startAnalytics({ env: {}, load })).toBe(false)
    expect(load).not.toHaveBeenCalled()
    expect(analyticsActive()).toBe(false)

    capture({ name: 'tool_opened', properties: { tool: 'text' } })
    await track({ name: 'undo' })
    expect(sent).toEqual([])
  })

  test('the assumption counts still go to /api/events, unchanged', async () => {
    await track({ name: 'design_created' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/events')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'design_created' })
  })

  test('studio-only events never reach /api/events', async () => {
    await track({ name: 'tool_opened', properties: { tool: 'text' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('track() fan-out with a key', () => {
  test('sends every event to PostHog, and counted ones to /api/events too', async () => {
    const { sent, load } = fakeLoad()
    expect(await startAnalytics({ env: { VITE_POSTHOG_KEY: 'phc_test' }, load })).toBe(true)
    expect(load).toHaveBeenCalledWith({ key: 'phc_test', host: DEFAULT_POSTHOG_HOST })

    await track({ name: 'publish_succeeded' })
    await track({ name: 'garment_picked', properties: { garment: 'tee' } })

    expect(sent).toEqual([
      ['publish_succeeded', {}],
      ['garment_picked', { garment: 'tee' }],
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ name: 'publish_succeeded' })
  })

  test('events before PostHog loads wait, then go in order', async () => {
    const { sent, load } = fakeLoad()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const started = startAnalytics({
      env: { VITE_POSTHOG_KEY: 'phc_test' },
      load: async (options) => {
        await gate
        return load(options)
      },
    })

    capture({ name: 'step_viewed', properties: { step: 'select' } })
    capture({ name: 'undo' })
    expect(sent).toEqual([])
    release()
    await started
    expect(sent.map(([name]) => name)).toEqual(['step_viewed', 'undo'])
  })

  test('Do Not Track: nothing loads', async () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    const { load } = fakeLoad()
    expect(await startAnalytics({ env: { VITE_POSTHOG_KEY: 'phc_test' }, load })).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })

  test('a failed load leaves analytics off', async () => {
    const ok = await startAnalytics({
      env: { VITE_POSTHOG_KEY: 'phc_test' },
      load: async () => {
        throw new Error('blocked')
      },
    })
    expect(ok).toBe(false)
    expect(analyticsActive()).toBe(false)
  })
})

describe('no PII', () => {
  test('only known names with id-like values pass', () => {
    expect(
      cleanProperties({
        properties: {
          tool: 'text',
          garment: 'tee',
          count: 3,
          sketch: true,
          email: 'a@b.co',
          title: 'My jacket',
          step: 'person@example.com',
          fabric: 'Summer linen for Sam',
          face: 'x'.repeat(41),
          route: '/s/:slug',
          seconds: Number.NaN,
        },
      }),
    ).toEqual({ tool: 'text', garment: 'tee', count: 3, sketch: true })
  })

  test('routes, never ids', () => {
    expect(routeOfPath({ pathname: '/' })).toBe('/')
    expect(routeOfPath({ pathname: '/studio/' })).toBe('/studio')
    expect(routeOfPath({ pathname: '/s/abc123' })).toBe('/s/:slug')
    expect(routeOfPath({ pathname: '/u/someone' })).toBe('/u/:handle')
    expect(routeOfPath({ pathname: '/look/42' })).toBe('/look/:lookId')
    expect(routeOfPath({ pathname: '/what/ever' })).toBe('/:other')
    expect(routeOfPath({ pathname: '/create?design=abc#x' })).toBe('/create')
  })

  test('before_send reduces URLs to routes and drops referrers, IP and person updates', () => {
    const event = scrubEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://flv.example/u/someone?ref=mail#top',
        $pathname: '/u/someone',
        $initial_current_url: 'https://flv.example/s/slug-1',
        $referrer: 'https://mail.example/inbox/123',
        $referring_domain: 'mail.example',
        $ip: '1.2.3.4',
        title: 'Summer jacket by Sam · Fashion Leader Vote',
        tool: 'text',
      },
      $set: { email: 'a@b.co' },
      $set_once: { name: 'x' },
    })

    expect(event).toEqual({
      event: '$pageview',
      properties: {
        $current_url: 'https://flv.example/u/:handle',
        $pathname: '/u/:handle',
        $initial_current_url: 'https://flv.example/s/:slug',
        route: '/u/:handle',
        tool: 'text',
      },
    })
    expect(scrubEvent(null)).toBeNull()
  })

  test('the PostHog options: memory only, no person profiles, inputs and text masked', () => {
    const options = posthogOptions({ host: DEFAULT_POSTHOG_HOST })
    expect(options.persistence).toBe('memory')
    expect(options.person_profiles).toBe('never')
    expect(options.respect_dnt).toBe(true)
    expect(options.session_recording.maskAllInputs).toBe(true)
    expect(options.session_recording.maskTextSelector).toBe('*')
    expect(options.mask_all_text).toBe(true)
    expect(options.mask_all_element_attributes).toBe(true)
    expect(options.autocapture).toEqual({ capture_copied_text: false })
    expect(options.rageclick).toBe(true)
    expect(options.before_send).toBe(scrubEvent)
    expect(options.disable_external_dependency_loading).toBe(true)
  })

  test('Do Not Track and Global Privacy Control', () => {
    expect(prefersNoTracking({ navigator: {}, window: {} })).toBe(false)
    expect(prefersNoTracking({ navigator: { doNotTrack: '1' }, window: {} })).toBe(true)
    expect(prefersNoTracking({ navigator: {}, window: { doNotTrack: '1' } })).toBe(true)
    expect(prefersNoTracking({ navigator: { globalPrivacyControl: true }, window: {} })).toBe(true)
  })
})
