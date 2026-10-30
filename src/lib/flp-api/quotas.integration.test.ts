import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Quotas and rate limits against a real local Supabase (S09 #178, Q02
 * #187). Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })

describe.skipIf(!env)('quotas and rate limits against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account

  function api({
    path,
    method = 'GET',
    token,
    body,
    limits,
  }: {
    path: string
    method?: 'GET' | 'POST' | 'PATCH'
    token: string
    body?: unknown
    limits?: FlpServerEnv['rateLimits']
  }) {
    return handleFlpRequest({
      env: { ...serverEnv, ...(limits ? { rateLimits: limits } : {}) },
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  function create({ owner, title }: { owner: Account; title: string }) {
    return api({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title, content: DOCUMENT },
    })
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    a = await createAccount({ admin, env: serverEnv, label: 'quota-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'quota-b' })
  })

  afterAll(async () => {
    for (const account of [a, b]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('the 21st design is refused with a clear quota error', async () => {
    for (let n = 1; n <= 20; n += 1) {
      expect((await create({ owner: a, title: `Design ${n}` })).status).toBe(201)
    }

    const refused = await create({ owner: a, title: 'One too many' })

    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({
      error: { code: 'quota_exceeded', message: expect.stringContaining('20 designs') },
    })
    const listed = (await (await api({ path: 'designs', token: a.token })).json()) as { designs: unknown[] }
    expect(listed.designs).toHaveLength(20)
  })

  test('past the limit a mutation gets 429 with Retry-After; reads, other buckets and accounts are unaffected', async () => {
    const limits = { details: 2 }
    const designId = (
      (await (await create({ owner: b, title: 'Limited' })).json()) as { designId: string }
    ).designId
    const rename = (title: string, owner = b) =>
      api({ path: `designs/${designId}`, method: 'PATCH', token: owner.token, body: { title }, limits })

    expect((await rename('One')).status).toBe(200)
    expect((await rename('Two')).status).toBe(200)

    const limited = await rename('Three')

    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } })

    // Reads and saves are not counted against `details`.
    expect((await api({ path: `designs/${designId}`, token: b.token })).status).toBe(200)
    expect(
      (
        await api({
          path: `designs/${designId}/versions`,
          method: 'POST',
          token: b.token,
          body: { baseSeq: 1, mutationKey: crypto.randomUUID(), kind: 'autosave', content: DOCUMENT },
          limits,
        })
      ).status,
    ).toBe(201)

    // Another account has its own budget.
    expect((await api({ path: 'profile', method: 'POST', token: a.token, body: { displayName: 'A' }, limits })).status).toBe(200)

    // The refused rename did not apply.
    expect(((await (await api({ path: `designs/${designId}`, token: b.token })).json()) as { title: string }).title).toBe('Two')
  })
})
