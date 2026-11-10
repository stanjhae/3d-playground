import { beforeEach, describe, expect, test, vi } from 'vitest'

import { handleErrorsRequest, withErrorReporting } from './error-tunnel'
import { handleHealthRequest } from './health'
import { resetPublicWriteGuards } from './waitlist-handlers'
import packageJson from '../../package.json' with { type: 'json' }

/** `/api/errors`, the API wrapper and `/api/health` (O1). */

const DSN = 'https://pub@o1.ingest.sentry.io/77'
const ENVELOPE = 'https://o1.ingest.sentry.io/api/77/envelope/'

function sentryFetch() {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 200 }))
}

function errorsRequest({ body, origin }: { body: unknown; origin?: string }) {
  return new Request('https://flp.example/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}), 'x-forwarded-for': '203.0.113.9' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const browserReport = { source: 'browser', type: 'TypeError', message: 'x is undefined', mechanism: 'window-error' }

beforeEach(() => {
  resetPublicWriteGuards()
})

describe('POST /api/errors', () => {
  test('forwards a browser report to Sentry when a DSN is set', async () => {
    const fetchImpl = sentryFetch()
    const response = await handleErrorsRequest({
      request: errorsRequest({ body: browserReport, origin: 'https://flp.example' }),
      env: { SENTRY_DSN: DSN, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' },
      fetchImpl,
    })

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(ENVELOPE)
    const event = JSON.parse(String(init?.body).split('\n')[2])
    expect(event).toMatchObject({ release: 'abcdef123456', environment: 'preview', tags: { source: 'browser' } })
    // The client's address goes nowhere.
    expect(String(init?.body)).not.toContain('203.0.113.9')
  })

  test('accepts and drops reports without a DSN', async () => {
    const fetchImpl = sentryFetch()
    const response = await handleErrorsRequest({ request: errorsRequest({ body: browserReport }), env: {}, fetchImpl })

    expect(response.status).toBe(202)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test.each([
    ['another origin', { body: browserReport, origin: 'https://evil.example' }, 403],
    ['bad JSON', { body: '{' }, 400],
    ['an API report', { body: { ...browserReport, source: 'api' } }, 400],
    ['a huge body', { body: { ...browserReport, stack: 'x'.repeat(20_000) } }, 413],
  ])('refuses %s', async (_, request, status) => {
    const fetchImpl = sentryFetch()
    const response = await handleErrorsRequest({ request: errorsRequest(request), env: { SENTRY_DSN: DSN }, fetchImpl })

    expect(response.status).toBe(status)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('limits each client to 10 a minute', async () => {
    const statuses = []

    for (let i = 0; i < 11; i++) {
      statuses.push((await handleErrorsRequest({ request: errorsRequest({ body: browserReport }), env: {} })).status)
    }

    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  test('a failing tracker still answers 202', async () => {
    const response = await handleErrorsRequest({
      request: errorsRequest({ body: browserReport }),
      env: { SENTRY_DSN: DSN },
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
    })

    expect(response.status).toBe(202)
  })
})

describe('withErrorReporting', () => {
  const request = new Request('https://flp.example/api/flp/designs/0b6f2f6e-3a9f-4c1d-9a0e-2f7c1b5d8e4a')

  test('turns a throw into a reported 500', async () => {
    const fetchImpl = sentryFetch()
    const handler = withErrorReporting(
      () => {
        throw new Error('db exploded for ana@example.com')
      },
      { env: { SENTRY_DSN: DSN }, fetchImpl },
    )
    const response = await handler(request)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong' } })
    const body = String(fetchImpl.mock.calls[0][1]?.body)
    expect(body).toContain('db exploded for [email]')
    expect(body).toContain('/api/flp/designs/:id')
    expect(body).not.toContain('0b6f2f6e')
  })

  test('reports a 5xx the handler returned', async () => {
    const fetchImpl = sentryFetch()
    const handler = withErrorReporting(() => new Response(null, { status: 503 }), { env: { SENTRY_DSN: DSN }, fetchImpl })

    expect((await handler(request)).status).toBe(503)
    expect(String(fetchImpl.mock.calls[0][1]?.body)).toContain('answered 503')
  })

  test('leaves other responses alone', async () => {
    const fetchImpl = sentryFetch()
    const handler = withErrorReporting(() => new Response('ok', { status: 404 }), { env: { SENTRY_DSN: DSN }, fetchImpl })

    expect((await handler(request)).status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('GET /api/health', () => {
  const healthRequest = new Request('https://flp.example/api/health')
  const supabaseEnv = { SUPABASE_URL: 'https://ref.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }

  test('reports the build and a reachable Supabase', async () => {
    const fetchImpl = sentryFetch()
    const response = await handleHealthRequest({
      request: healthRequest,
      env: { ...supabaseEnv, VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890', VERCEL_ENV: 'preview' },
      fetchImpl,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      ok: true,
      version: packageJson.version,
      commit: 'abcdef123456',
      environment: 'preview',
      supabase: 'ok',
      errorTracking: 'off',
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://ref.supabase.co/auth/v1/health')
  })

  test('is 503 when Supabase is configured but unreachable', async () => {
    const response = await handleHealthRequest({
      request: healthRequest,
      env: supabaseEnv,
      fetchImpl: vi.fn(async () => new Response(null, { status: 502 })),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, supabase: 'unreachable' })
  })

  test('is healthy without Supabase (local and CI builds)', async () => {
    const response = await handleHealthRequest({ request: healthRequest, env: {} })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, supabase: 'not_configured', commit: 'local' })
  })

  test('answers only GET and HEAD', async () => {
    const response = await handleHealthRequest({ request: new Request(healthRequest, { method: 'POST' }), env: {} })

    expect(response.status).toBe(404)
  })
})
