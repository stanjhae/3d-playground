import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Origin policy against a real local Supabase (Q02 #187): a valid bearer
 * token is not enough when the request comes from another origin.
 * Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
const SITE = 'http://localhost'

describe.skipIf(!env)('origin policy against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let owner: Account
  let designId: string

  function api({
    path,
    method,
    origin,
    body,
  }: {
    path: string
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    origin?: string
    body?: unknown
  }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`${SITE}/api/flp/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${owner.token}`,
          ...(origin ? { Origin: origin } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  async function designCount() {
    const { count } = await admin
      .from('designs')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', owner.id)
    return count
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    owner = await createAccount({ admin, env: serverEnv, label: 'origin' })
  })

  afterAll(async () => {
    await admin.auth.admin.deleteUser(owner.id)
  })

  test('same-origin and Origin-less creates succeed', async () => {
    const sameOrigin = await api({
      path: 'designs',
      method: 'POST',
      origin: SITE,
      body: { mutationKey: crypto.randomUUID(), title: 'Same origin', content: DOCUMENT },
    })
    expect(sameOrigin.status).toBe(201)
    designId = ((await sameOrigin.json()) as { designId: string }).designId

    const noOrigin = await api({
      path: 'designs',
      method: 'POST',
      body: { mutationKey: crypto.randomUUID(), title: 'No origin', content: DOCUMENT },
    })
    expect(noOrigin.status).toBe(201)
    expect(await designCount()).toBe(2)
  })

  test('a cross-origin create with a valid token writes nothing', async () => {
    const response = await api({
      path: 'designs',
      method: 'POST',
      origin: 'https://evil.example',
      body: { mutationKey: crypto.randomUUID(), title: 'Forged', content: DOCUMENT },
    })

    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('cross_origin')
    expect(await designCount()).toBe(2)
  })

  test('cross-origin rename, unpublish and delete leave the design alone', async () => {
    const rename = await api({
      path: `designs/${designId}`,
      method: 'PATCH',
      origin: 'https://evil.example',
      body: { title: 'Renamed by someone else' },
    })
    const unpublish = await api({ path: `designs/${designId}/publication`, method: 'DELETE', origin: 'null' })
    const remove = await api({ path: `designs/${designId}`, method: 'DELETE', origin: 'http://localhost:9999' })

    expect([rename.status, unpublish.status, remove.status]).toEqual([403, 403, 403])
    const { data } = await admin.from('designs').select('title').eq('id', designId).single()
    expect(data?.title).toBe('Same origin')
  })

  test('cross-origin reads are not refused by the origin check', async () => {
    const response = await api({ path: `designs/${designId}`, method: 'GET', origin: 'https://evil.example' })
    expect(response.status).toBe(200)
  })
})
