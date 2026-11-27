import { describe, expect, test } from 'vitest'

import { bearerToken, isAdmin, serviceEnv, userFromRequest } from './index.js'

const request = (authorization) =>
  new Request('http://localhost/api/me', authorization ? { headers: { authorization } } : undefined)

describe('serviceEnv', () => {
  test('needs both the URL and the secret key', () => {
    expect(serviceEnv({ SUPABASE_URL: 'http://x' })).toBeNull()
    expect(serviceEnv({ SUPABASE_URL: 'http://x', SUPABASE_SECRET_KEY: 's' })).toEqual({ url: 'http://x', secretKey: 's' })
  })
})

describe('bearerToken', () => {
  test('reads a bearer token and nothing else', () => {
    expect(bearerToken(request('Bearer abc.def'))).toBe('abc.def')
    expect(bearerToken(request('bearer abc'))).toBe('abc')
    expect(bearerToken(request('Basic abc'))).toBeNull()
    expect(bearerToken(request('Bearer'))).toBeNull()
    expect(bearerToken(request())).toBeNull()
  })
})

describe('userFromRequest', () => {
  const client = (result) => ({ auth: { getUser: async () => result } })

  test('is null without a token, without asking Supabase', async () => {
    const never = { auth: { getUser: async () => { throw new Error('asked') } } }
    expect(await userFromRequest({ client: never, request: request() })).toBeNull()
  })

  test('is null for a token Supabase rejects', async () => {
    const rejected = client({ data: { user: null }, error: { message: 'bad jwt' } })
    expect(await userFromRequest({ client: rejected, request: request('Bearer t') })).toBeNull()
  })

  test('is the account for a valid token', async () => {
    const valid = client({ data: { user: { id: 'u1', email: 'a@example.com' } }, error: null })
    expect(await userFromRequest({ client: valid, request: request('Bearer t') })).toEqual({ id: 'u1', email: 'a@example.com' })
  })
})

describe('isAdmin', () => {
  const client = (result) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
  })

  test('is true only with a row in admins', async () => {
    expect(await isAdmin({ client: client({ data: { user_id: 'u1' }, error: null }), userId: 'u1' })).toBe(true)
    expect(await isAdmin({ client: client({ data: null, error: null }), userId: 'u1' })).toBe(false)
  })

  test('throws when the check itself fails, so callers refuse', async () => {
    await expect(isAdmin({ client: client({ data: null, error: { code: '500' } }), userId: 'u1' })).rejects.toThrow('admin check failed')
  })
})
