import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../auth/supabase-client.ts', () => ({
  getSupabaseClient: () => null,
  authConfigured: () => true,
  AUTH_REQUIRED: true,
}))

const { useSessionStore } = await import('../auth/session-store.ts')
const { getVoteFeed } = await import('./votes.ts')
const { decodeFeedCursor, encodeFeedCursor } = await import('./publication.ts')

/** The Vote feed's client and page cursor. */

const SLUG = 'abcdef0123456789'

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status })
}

describe('feed cursor', () => {
  test('round-trips the database time to the microsecond', () => {
    const cursor = { group: 1, publishedAt: '2026-11-17T10:20:30.123456+00:00', slug: SLUG }
    const encoded = encodeFeedCursor(cursor)

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeFeedCursor({ cursor: encoded })).toEqual(cursor)
  })

  test('refuses anything it did not make', () => {
    const forged = [
      'nonsense',
      btoa(JSON.stringify([2, '2026-11-17T10:20:30Z', SLUG])),
      btoa(JSON.stringify([0, 'yesterday', SLUG])),
      btoa(JSON.stringify([0, '2026-11-17T10:20:30Z', 'not-a-slug'])),
      btoa(JSON.stringify({ group: 0 })),
      'a'.repeat(201),
    ]

    for (const cursor of forged) {
      expect(decodeFeedCursor({ cursor }), cursor).toBeNull()
    }
  })
})

describe('getVoteFeed', () => {
  beforeEach(() => {
    useSessionStore.setState({ status: 'signed-out', account: null, accessToken: null, accountEpoch: 0 })
  })

  test('signed out reads without a token, with the garment and page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { designs: [], next: null }))

    expect(await getVoteFeed({ fetchImpl })).toEqual({ ok: true, data: { designs: [], next: null } })
    await getVoteFeed({ garmentId: 'hoodie', cursor: 'abc', fetchImpl })

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/flp/public/feed', '/api/flp/public/feed?garment=hoodie&cursor=abc'])
  })

  test('signed in sends the session, so own designs are left out and votes are known', async () => {
    useSessionStore.setState({ status: 'signed-in', account: { userId: 'voter', email: null }, accessToken: 'token-a' })
    const fetchImpl = vi.fn().mockResolvedValue(respond(200, { designs: [], next: null }))

    await getVoteFeed({ fetchImpl })

    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a')
  })
})
