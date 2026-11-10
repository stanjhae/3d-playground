import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import type { VoteState } from './contract'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Account votes on published designs (V1) against a real local Supabase.
 * Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

type Method = 'GET' | 'POST' | 'DELETE'

describe.skipIf(!env)('votes on published designs against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let owner: Account
  let a: Account
  let b: Account
  let designId = ''
  let slug = ''

  function api({
    path,
    method = 'GET',
    token,
    body,
    limits,
  }: {
    path: string
    method?: Method
    token?: string
    body?: unknown
    limits?: FlpServerEnv['rateLimits']
  }) {
    return handleFlpRequest({
      env: { ...serverEnv, ...(limits ? { rateLimits: limits } : {}) },
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  async function ok<T>({ path, method, token, body }: { path: string; method?: Method; token?: string; body?: unknown }) {
    const response = await api({ path, method, token, body })
    expect(response.status, `${method ?? 'GET'} ${path}`).toBeLessThan(300)
    return (response.status === 204 ? null : await response.json()) as T
  }

  async function vote({ method = 'GET', token }: { method?: Method; token?: string }) {
    const response = await api({ path: `public/${slug}/vote`, method, token })
    return { status: response.status, cache: response.headers.get('Cache-Control'), body: (await response.json()) as VoteState }
  }

  async function publish({ seq }: { seq: number }) {
    await ok({ path: `designs/${designId}/renders`, method: 'POST', token: owner.token, body: { seq, renders: RENDERS } })
    return ok<{ slug: string }>({ path: `designs/${designId}/publication`, method: 'POST', token: owner.token, body: { seq } })
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    owner = await createAccount({ admin, env: serverEnv, label: 'vote-owner' })
    a = await createAccount({ admin, env: serverEnv, label: 'vote-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'vote-b' })

    const created = await ok<{ designId: string }>({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Voted tee', content: DOCUMENT },
    })
    designId = created.designId
    slug = (await publish({ seq: 1 })).slug
  })

  afterAll(async () => {
    for (const account of [owner, a, b]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('signed out sees the count, uncached, and cannot vote', async () => {
    expect(await vote({})).toEqual({ status: 200, cache: 'no-store', body: { count: 0, voted: false } })
    expect((await vote({ method: 'POST' })).status).toBe(401)
  })

  test('one vote per account, cast and retracted idempotently', async () => {
    expect((await vote({ method: 'POST', token: a.token })).body).toEqual({ count: 1, voted: true })
    expect((await vote({ method: 'POST', token: a.token })).body).toEqual({ count: 1, voted: true })
    expect((await vote({ method: 'POST', token: b.token })).body).toEqual({ count: 2, voted: true })

    expect((await vote({ token: a.token })).body).toEqual({ count: 2, voted: true })
    expect((await vote({ token: owner.token })).body).toEqual({ count: 2, voted: false })
    expect((await vote({})).body).toEqual({ count: 2, voted: false })

    expect((await vote({ method: 'DELETE', token: b.token })).body).toEqual({ count: 1, voted: false })
    expect((await vote({ method: 'DELETE', token: b.token })).body).toEqual({ count: 1, voted: false })
  })

  test('a stale token reads as signed out', async () => {
    expect((await vote({ token: 'not-a-token' })).body).toEqual({ count: 1, voted: false })
  })

  test('votes carry over a republish, and an unpublished design takes none', async () => {
    await ok({ path: `designs/${designId}/publication`, method: 'DELETE', token: owner.token })

    for (const [method, token] of [['GET', undefined], ['POST', b.token], ['DELETE', a.token]] as const) {
      const response = await vote({ method, token })
      expect(response.status, method).toBe(404)
      expect(response.cache).toBe('no-store')
    }

    const saved = await ok<{ seq: number }>({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: owner.token,
      body: { baseSeq: 1, mutationKey: crypto.randomUUID(), kind: 'checkpoint', content: DOCUMENT },
    })
    expect((await publish({ seq: saved.seq })).slug).toBe(slug)

    expect((await vote({ token: a.token })).body).toEqual({ count: 1, voted: true })
  })

  test('an unknown or malformed slug is not available', async () => {
    for (const path of ['public/0000000000000000/vote', 'public/not-a-slug/vote']) {
      const response = await api({ path, method: 'POST', token: a.token })
      expect(response.status, path).toBe(404)
    }
  })

  test('casting and retracting count against the vote bucket', async () => {
    const limits = { vote: 1 }
    // A fresh account, so earlier tests' requests are not in its window.
    const voter = await createAccount({ admin, env: serverEnv, label: 'vote-limit' })

    try {
      const first = await api({ path: `public/${slug}/vote`, method: 'POST', token: voter.token, limits })
      const second = await api({ path: `public/${slug}/vote`, method: 'DELETE', token: voter.token, limits })
      const read = await api({ path: `public/${slug}/vote`, token: voter.token, limits })

      expect(first.status).toBe(200)
      expect(second.status).toBe(429)
      expect(Number(second.headers.get('Retry-After'))).toBeGreaterThan(0)
      // Reads are not limited, and the refused retraction changed nothing.
      expect(((await read.json()) as VoteState).voted).toBe(true)
    } finally {
      await admin.auth.admin.deleteUser(voter.id)
    }
  })

  test("deleting the voter's account removes their vote", async () => {
    const before = (await vote({})).body.count
    const voter = await createAccount({ admin, env: serverEnv, label: 'vote-leaver' })
    expect((await vote({ method: 'POST', token: voter.token })).body.count).toBe(before + 1)

    await admin.auth.admin.deleteUser(voter.id)

    expect((await vote({})).body.count).toBe(before)
  })
})
