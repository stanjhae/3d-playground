import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../auth/supabase-client.ts', () => ({
  getSupabaseClient: () => null,
  authConfigured: () => true,
  AUTH_REQUIRED: true,
}))

const { useSessionStore } = await import('../auth/session-store.ts')
const { castVote, getVoteState, optimisticVote, retractVote, voteCountLabel } = await import('./votes.ts')
const { handleFlpRequest } = await import('./server.ts')

/** Account votes on a published design (V1). */

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status })
}

const SLUG = 'abcdef0123456789'

describe('vote state', () => {
  beforeEach(() => {
    useSessionStore.setState({ status: 'signed-out', account: null, accessToken: null, accountEpoch: 0 })
  })

  test('signed out reads the count without a token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { count: 3, voted: false }))

    expect(await getVoteState({ slug: SLUG, fetchImpl })).toEqual({ ok: true, data: { count: 3, voted: false } })
    expect(fetchImpl).toHaveBeenCalledWith(`/api/flp/public/${SLUG}/vote`)
  })

  test('signed out, an unpublished design and an outage read differently', async () => {
    const missing = await getVoteState({ slug: SLUG, fetchImpl: vi.fn().mockResolvedValue(respond(404)) })
    const outage = await getVoteState({ slug: SLUG, fetchImpl: vi.fn().mockResolvedValue(respond(500)) })
    const offline = await getVoteState({ slug: SLUG, fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) })

    expect([missing, outage, offline].map((result) => (result.ok ? 'ok' : result.code))).toEqual([
      'not_found',
      'internal',
      'network',
    ])
  })

  test('signed in reads, casts and retracts with the session token', async () => {
    useSessionStore.setState({
      status: 'signed-in',
      account: { userId: 'voter', email: null },
      accessToken: 'token-a',
    })
    const fetchImpl = vi.fn().mockImplementation(async () => respond(200, { count: 1, voted: true }))

    await getVoteState({ slug: SLUG, fetchImpl })
    await castVote({ slug: SLUG, fetchImpl })
    await retractVote({ slug: SLUG, fetchImpl })

    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, init.headers.Authorization])).toEqual([
      [`/api/flp/public/${SLUG}/vote`, 'GET', 'Bearer token-a'],
      [`/api/flp/public/${SLUG}/vote`, 'POST', 'Bearer token-a'],
      [`/api/flp/public/${SLUG}/vote`, 'DELETE', 'Bearer token-a'],
    ])
  })

  test('casting signed out never reaches the server', async () => {
    const fetchImpl = vi.fn()

    expect(await castVote({ slug: SLUG, fetchImpl })).toMatchObject({ ok: false, code: 'unauthenticated' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('the vote button', () => {
  test('flips voted and moves the count by one, never below zero', () => {
    expect(optimisticVote({ state: { count: 4, voted: false } })).toEqual({ count: 5, voted: true })
    expect(optimisticVote({ state: { count: 5, voted: true } })).toEqual({ count: 4, voted: false })
    expect(optimisticVote({ state: { count: 0, voted: true } })).toEqual({ count: 0, voted: false })
  })

  test('names the count', () => {
    expect([0, 1, 2].map((count) => voteCountLabel({ count }))).toEqual(['0 votes', '1 vote', '2 votes'])
  })
})

describe('vote routes before the database', () => {
  const env = { url: 'http://127.0.0.1:1', publishableKey: 'p', secretKey: 's' }

  test('casting from another origin is refused', async () => {
    const response = await handleFlpRequest({
      env,
      request: new Request(`https://flp.example/api/flp/public/${SLUG}/vote`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
    })

    expect(response.status).toBe(403)
  })

  test.each(['POST', 'DELETE'])('%s without a session is 401', async (method) => {
    const response = await handleFlpRequest({
      env,
      request: new Request(`https://flp.example/api/flp/public/${SLUG}/vote`, { method }),
    })

    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('unauthenticated')
  })

  test('other methods are not allowed', async () => {
    const response = await handleFlpRequest({
      env,
      request: new Request(`https://flp.example/api/flp/public/${SLUG}/vote`, { method: 'PATCH' }),
    })

    expect(response.status).toBe(405)
  })
})
