import { beforeEach, describe, expect, test, vi } from 'vitest'

const auth = {
  refreshSession: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
}

vi.mock('../auth/supabase-client.ts', () => ({
  getSupabaseClient: () => ({ auth }),
  authConfigured: () => true,
  AUTH_REQUIRED: true,
}))

const { applySession, useSessionStore } = await import('../auth/session-store.ts')
const { listOwnedDesigns } = await import('./client.ts')

function signedInAs({ token }: { token: string }) {
  applySession({ session: { access_token: token, user: { id: 'user-a', email: 'a@example.test' } } as never })
}

function respond(status: number, body: unknown = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status })
}

describe('API client and an unaccepted session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({ status: 'loading', account: null, accessToken: null, accountEpoch: 0 })
    signedInAs({ token: 'old' })
  })

  test('a 401 renews the session once and retries with the new token', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'new', user: { id: 'user-a', email: 'a@example.test' } } },
      error: null,
    })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(401, { error: { code: 'unauthenticated' } }))
      .mockResolvedValueOnce(respond(200, { designs: [] }))

    const result = await listOwnedDesigns({ fetchImpl })

    expect(result).toEqual({ ok: true, data: { designs: [] } })
    expect(fetchImpl.mock.calls[1]?.[1]?.headers?.Authorization).toBe('Bearer new')
    expect(useSessionStore.getState()).toMatchObject({ status: 'signed-in', accessToken: 'new' })
  })

  test('when renewal fails (deleted or revoked account) the session ends', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'User not found' } })
    const fetchImpl = vi.fn().mockResolvedValue(respond(401, { error: { code: 'unauthenticated' } }))

    const result = await listOwnedDesigns({ fetchImpl })

    expect(result).toMatchObject({ ok: false, code: 'unauthenticated' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(useSessionStore.getState()).toMatchObject({ status: 'signed-out', account: null })
  })

  test('other errors do not touch the session', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(404, { error: { code: 'not_found', message: 'Design not found' } }))

    await listOwnedDesigns({ fetchImpl })

    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(useSessionStore.getState().status).toBe('signed-in')
  })
})
