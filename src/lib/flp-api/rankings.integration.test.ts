import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import type { ProfileResponse } from './contract'
import { type Account, acceptTermsFor, createAccount, withImageAsset } from './integration-harness'
import { type BoardEntry, PUBLIC_RENDER_KINDS, type PublicProfile } from './publication'
import { flpServerEnv, handleFlpRequest } from './server'

/**
 * Rankings by window and garment, public profiles and reports against a
 * real local Supabase. Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({
  kind,
  data: btoa(String.fromCharCode(...TINY_JPEG)),
}))

type Method = 'GET' | 'POST' | 'DELETE'

describe.skipIf(!env)('rankings, profiles and reports against local Supabase', () => {
  const serverEnv = env!
  let admin: SupabaseClient
  let owner: Account
  let voter: Account
  let slug = ''
  // Unique per run, so reruns against the same database don't collide.
  const handle = `it-${crypto.randomUUID().slice(0, 8)}`

  function api({ path, method = 'GET', token, body }: { path: string; method?: Method; token?: string; body?: unknown }) {
    return handleFlpRequest({
      env: serverEnv,
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

  async function board(query = '') {
    return (await ok<{ designs: BoardEntry[] }>({ path: `public${query}` })).designs
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    owner = await createAccount({ admin, env: serverEnv, label: 'rank-owner' })
    voter = await createAccount({ admin, env: serverEnv, label: 'rank-voter' })
    await acceptTermsFor({ admin, account: voter })

    const created = await ok<{ designId: string }>({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Ranked tee', content: DOCUMENT },
    })
    await ok({ path: `designs/${created.designId}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders: RENDERS } })
    slug = (await ok<{ slug: string }>({ path: `designs/${created.designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })).slug
    await ok({ path: `public/${slug}/vote`, method: 'POST', token: voter.token })
  })

  afterAll(async () => {
    for (const account of [owner, voter]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('the board ranks by window and garment', async () => {
    for (const query of ['', '?window=week', '?window=month', '?garment=tee', '?window=week&garment=tee']) {
      const entry = (await board(query)).find((design) => design.slug === slug)
      expect(entry, query).toMatchObject({ votes: 1, garmentId: 'tee', ownerHandle: null })
      expect(entry!.rank, query).toBeGreaterThanOrEqual(1)
    }

    expect((await board('?garment=hoodie')).some((design) => design.slug === slug)).toBe(false)
  })

  test('an unknown window or garment is refused', async () => {
    for (const query of ['?window=year', '?garment=cape']) {
      expect((await api({ path: `public${query}` })).status, query).toBe(400)
    }
  })

  test('a profile is private until it is turned on, then the board links to it', async () => {
    const saved = await ok<ProfileResponse>({
      path: 'profile',
      method: 'POST',
      token: owner.token,
      body: { handle: handle.toUpperCase(), profilePublic: false },
    })
    expect(saved).toMatchObject({ handle, profilePublic: false })
    expect((await api({ path: `public/u/${handle}` })).status).toBe(404)

    await ok({ path: 'profile', method: 'POST', token: owner.token, body: { handle, profilePublic: true } })
    const profile = await ok<PublicProfile>({ path: `public/u/${handle}` })
    expect(profile.handle).toBe(handle)
    expect(profile.designs.map((design) => [design.slug, design.votes])).toEqual([[slug, 1]])
    expect((await board()).find((design) => design.slug === slug)?.ownerHandle).toBe(handle)

    // Setting the name alone leaves the profile as it was.
    const named = await ok<ProfileResponse>({ path: 'profile', method: 'POST', token: owner.token, body: { displayName: 'Atelier' } })
    expect(named).toMatchObject({ displayName: 'Atelier', handle, profilePublic: true })
  })

  test('a handle in use, a reserved one, or a public profile without one is refused', async () => {
    const taken = await api({ path: 'profile', method: 'POST', token: voter.token, body: { handle, profilePublic: false } })
    expect(taken.status).toBe(409)
    const reserved = await api({ path: 'profile', method: 'POST', token: voter.token, body: { handle: 'admin', profilePublic: false } })
    expect(reserved.status).toBe(409)
    const noHandle = await api({ path: 'profile', method: 'POST', token: voter.token, body: { handle: null, profilePublic: true } })
    expect(noHandle.status).toBe(422)
    const malformed = await api({ path: 'profile', method: 'POST', token: voter.token, body: { handle: 'no spaces', profilePublic: false } })
    expect(malformed.status).toBe(422)
    const half = await api({ path: 'profile', method: 'POST', token: voter.token, body: { handle: 'only-handle' } })
    expect(half.status).toBe(422)
  })

  test('a report is recorded once while open', async () => {
    expect((await api({ path: `public/${slug}/report`, method: 'POST', body: { reason: 'spam' } })).status).toBe(401)
    expect((await api({ path: `public/${slug}/report`, method: 'POST', token: voter.token, body: { reason: 'rude' } })).status).toBe(422)

    for (const reason of ['spam', 'other']) {
      const response = await api({ path: `public/${slug}/report`, method: 'POST', token: voter.token, body: { reason, note: 'Copied' } })
      expect(response.status, reason).toBe(202)
    }

    const { data } = await admin.from('publication_reports').select('reason, note, status').eq('slug', slug)
    expect(data).toEqual([{ reason: 'spam', note: 'Copied', status: 'open' }])
    expect((await api({ path: '0000000000000000/report'.replace(/^/, 'public/'), method: 'POST', token: voter.token, body: { reason: 'spam' } })).status).toBe(404)
  })
})
