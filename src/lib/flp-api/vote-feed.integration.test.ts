import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { type Account, acceptTermsFor, createAccount, withImageAsset } from './integration-harness'
import { type FeedEntry, PUBLIC_RENDER_KINDS, type VoteFeedPage } from './publication'
import { flpServerEnv, handleFlpRequest } from './server'

/**
 * The Vote feed (`GET /public/feed`) against a real local Supabase.
 * Opt-in: `pnpm test:integration`.
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

describe.skipIf(!env)('the Vote feed against local Supabase', () => {
  const serverEnv = env!
  let admin: SupabaseClient
  let owner: Account
  let voter: Account
  let slug = ''

  function api({ path, method = 'GET', token }: { path: string; method?: Method; token?: string }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    })
  }

  async function ok<T>({ path, method, token, body }: { path: string; method?: Method; token?: string; body?: unknown }) {
    const response = await handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method: method ?? 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
    expect(response.status, `${method ?? 'GET'} ${path}`).toBeLessThan(300)
    return (response.status === 204 ? null : await response.json()) as T
  }

  /** Every page of the feed, as the viewer sees it. */
  async function walk({ token, garment }: { token?: string; garment?: string } = {}) {
    const seen: FeedEntry[] = []
    let cursor: string | null = null

    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams()
      if (garment) query.set('garment', garment)
      if (cursor) query.set('cursor', cursor)
      const body: VoteFeedPage = await ok<VoteFeedPage>({ path: `public/feed${query.size ? `?${query}` : ''}`, token })
      seen.push(...body.designs)
      cursor = body.next
      if (!cursor) break
    }

    return seen
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    owner = await createAccount({ admin, env: serverEnv, label: 'feed-owner' })
    voter = await createAccount({ admin, env: serverEnv, label: 'feed-voter' })
    await acceptTermsFor({ admin, account: voter })

    const created = await ok<{ designId: string }>({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Feed tee', content: DOCUMENT },
    })
    await ok({ path: `designs/${created.designId}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders: RENDERS } })
    slug = (await ok<{ slug: string }>({ path: `designs/${created.designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })).slug
  })

  afterAll(async () => {
    for (const account of [owner, voter]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('a new design is in the feed, needing votes, signed out and for others', async () => {
    for (const token of [undefined, voter.token]) {
      const all = await walk({ token })
      const entry = all.find((design) => design.slug === slug)

      expect(entry).toMatchObject({ title: 'Feed tee', garmentId: 'tee', votes: 0, needsVotes: true, voted: false })
      expect(new Set(all.map((design) => design.slug)).size, 'no design twice').toBe(all.length)
    }
  })

  test('the owner never sees their own design', async () => {
    expect((await walk({ token: owner.token })).some((design) => design.slug === slug)).toBe(false)
  })

  test('a vote shows on the viewer’s card and the count, and on the board', async () => {
    await ok({ path: `public/${slug}/vote`, method: 'POST', token: voter.token })

    expect((await walk({ token: voter.token })).find((design) => design.slug === slug)).toMatchObject({ votes: 1, voted: true })
    expect((await walk()).find((design) => design.slug === slug)).toMatchObject({ votes: 1, voted: false })

    const board = (await ok<{ designs: Array<{ slug: string; votes: number }> }>({ path: 'public' })).designs
    expect(board.find((design) => design.slug === slug)?.votes).toBe(1)
  })

  test('the garment filter keeps one garment', async () => {
    expect((await walk({ garment: 'tee' })).some((design) => design.slug === slug)).toBe(true)
    expect((await walk({ garment: 'hoodie' })).some((design) => design.slug === slug)).toBe(false)
  })

  test('an unknown garment or a forged page is refused', async () => {
    for (const query of ['?garment=cape', '?cursor=nonsense', `?cursor=${btoa(JSON.stringify([2, 'x', 'y']))}`]) {
      expect((await api({ path: `public/feed${query}` })).status, query).toBe(400)
    }
  })
})
