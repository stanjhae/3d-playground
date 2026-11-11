import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'

import { RATE_OUTAGE_POLICY } from './flp-api/server'
import {
  PUBLIC_LIMITS,
  callerSubject,
  clientAddress,
  decisionFromWait,
  limiterCall,
  requestLimitsApply,
  takePublicToken,
} from './rate-limit'

/** The shared request limiter (P2) without a database. */

const DEPLOYED = { VERCEL_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }

function request(ip = '203.0.113.9') {
  return new Request('https://flp.example/api/waitlist', { method: 'POST', headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } })
}

/** A client whose `rpc(...).abortSignal(...)` resolves to `result`. */
function fakeClient(result: { data?: unknown; error?: { code: string } | null } | Error) {
  const rpc = vi.fn(() => ({
    abortSignal: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve({ data: null, error: null, ...result })),
  }))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('who is counted', () => {
  test('the first forwarded address is the client', () => {
    expect(clientAddress({ request: request() })).toBe('203.0.113.9')
    expect(clientAddress({ request: new Request('http://x/', { headers: { 'x-real-ip': '198.51.100.2' } }) })).toBe('198.51.100.2')
    expect(clientAddress({ request: new Request('http://x/') })).toBe('local')
  })

  test('the address is stored only as a keyed hash', async () => {
    const one = await callerSubject({ address: '203.0.113.9', secret: 'a' })

    expect(one).toMatch(/^[0-9a-f]{32}$/)
    expect(one).not.toContain('203')
    expect(await callerSubject({ address: '203.0.113.9', secret: 'a' })).toBe(one)
    expect(await callerSubject({ address: '203.0.113.9', secret: 'b' })).not.toBe(one)
    expect(await callerSubject({ address: '203.0.113.10', secret: 'a' })).not.toBe(one)
  })
})

describe('takePublicToken', () => {
  test('asks Postgres with the bucket rule and the hashed caller', async () => {
    const { client, rpc } = fakeClient({ data: 0 })
    const decision = await takePublicToken({ request: request(), bucket: 'waitlist', env: DEPLOYED, client })

    expect(decision).toEqual({ allowed: true })
    expect(rpc).toHaveBeenCalledWith('flp_take_request_token', {
      p_subject: await callerSubject({ address: '203.0.113.9', secret: DEPLOYED.SUPABASE_SECRET_KEY }),
      p_bucket: 'waitlist',
      p_limit: PUBLIC_LIMITS.waitlist.limit,
      p_window_seconds: PUBLIC_LIMITS.waitlist.windowSeconds,
    })
  })

  test('a wait from Postgres is a 429 with that wait', async () => {
    const { client } = fakeClient({ data: 42 })

    expect(await takePublicToken({ request: request(), bucket: 'events', env: DEPLOYED, client })).toEqual({
      allowed: false,
      reason: 'limited',
      retryAfter: 42,
    })
  })

  test.each([
    ['an error', { error: { code: 'PGRST301' } }],
    ['a timeout or network failure', new Error('aborted')],
  ] as const)('on %s, write buckets refuse and read buckets allow', async (_, failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    for (const bucket of Object.keys(PUBLIC_LIMITS) as Array<keyof typeof PUBLIC_LIMITS>) {
      const { client } = fakeClient(failure as never)
      const decision = await takePublicToken({ request: request(), bucket, env: DEPLOYED, client })

      expect(decision, bucket).toEqual(
        PUBLIC_LIMITS[bucket].onOutage === 'allow' ? { allowed: true } : { allowed: false, reason: 'unavailable' },
      )
    }
  })

  test('a deployment without Supabase settings applies the outage policy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await takePublicToken({ request: request(), bucket: 'waitlist', env: { VERCEL_ENV: 'preview' } })).toEqual({
      allowed: false,
      reason: 'unavailable',
    })
    expect(await takePublicToken({ request: request(), bucket: 'share_page', env: { VERCEL_ENV: 'preview' } })).toEqual({
      allowed: true,
    })
  })

  test('locally nothing is counted unless switched on', async () => {
    const { client, rpc } = fakeClient({ data: 99 })

    expect(requestLimitsApply({})).toBe(false)
    expect(requestLimitsApply({ FLP_REQUEST_LIMITS: 'on' })).toBe(true)
    expect(await takePublicToken({ request: request(), bucket: 'waitlist', env: { SUPABASE_URL: 'u', SUPABASE_SECRET_KEY: 'k' }, client })).toEqual({
      allowed: true,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('nonsense from Postgres does not block', () => {
    expect(decisionFromWait({ wait: null })).toEqual({ allowed: true })
    expect(decisionFromWait({ wait: 'x' })).toEqual({ allowed: true })
    expect(decisionFromWait({ wait: 1.2 })).toEqual({ allowed: false, reason: 'limited', retryAfter: 2 })
  })
})

/** A client whose RPC answers each call with the next of `results`. */
function sequencedClient(results: Array<{ data?: unknown; error?: { code: string } | null } | Error>) {
  let call = 0
  const rpc = vi.fn(() => ({
    abortSignal: () => {
      const result = results[Math.min(call, results.length - 1)]!
      call += 1
      return result instanceof Error ? Promise.reject(result) : Promise.resolve({ data: null, error: null, ...result })
    },
  }))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('one slow answer is retried before the outage policy', () => {
  // The CI failure on #357: a limiter call cut off at 1.5 s came back with an
  // empty code, and publish refused with a 503 though Postgres was up.
  test.each([
    ['a timeout (no error code)', { error: { code: '' } }],
    ['a dropped connection (a throw)', new Error('fetch failed')],
  ] as const)('after %s, the second answer decides', async (_, first) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, rpc } = sequencedClient([first as never, { data: 0 }])

    expect(await takePublicToken({ request: request(), bucket: 'waitlist', env: DEPLOYED, client })).toEqual({
      allowed: true,
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  test('two misses in a row still apply the outage policy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, rpc } = sequencedClient([{ error: { code: '' } }])

    expect(await takePublicToken({ request: request(), bucket: 'waitlist', env: DEPLOYED, client })).toEqual({
      allowed: false,
      reason: 'unavailable',
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  test('an error Postgres answered with is not retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, rpc } = sequencedClient([{ error: { code: 'PGRST301' } }, { data: 0 }])

    expect(await takePublicToken({ request: request(), bucket: 'waitlist', env: DEPLOYED, client })).toEqual({
      allowed: false,
      reason: 'unavailable',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('limiterCall returns the first real answer', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('aborted'))
      .mockResolvedValueOnce({ data: 7, error: null })

    expect(await limiterCall({ run })).toEqual({ data: 7, error: null })
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('outage policies', () => {
  // Changing one of these is a decision: update docs/abuse.md with it.
  test('every bucket has chosen', () => {
    expect(Object.fromEntries(Object.entries(PUBLIC_LIMITS).map(([bucket, rule]) => [bucket, rule.onOutage]))).toEqual({
      waitlist: 'refuse',
      events: 'refuse',
      errors: 'allow',
      share_page: 'allow',
      public_read: 'allow',
    })
    expect(RATE_OUTAGE_POLICY).toEqual({ save: 'allow', upload: 'allow', publish: 'refuse', details: 'allow', vote: 'allow' })
  })
})
