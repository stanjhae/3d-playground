import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import type { DesignComment, FollowState } from './contract'
import { type Account, acceptTermsFor, createAccount, withImageAsset } from './integration-harness'
import { type BoardEntry, PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Comments and follows (`FLP_COMMUNITY`) against a real local Supabase.
 * Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: btoa(String.fromCharCode(...TINY_JPEG)) }))

type Method = 'GET' | 'POST' | 'DELETE'

describe.skipIf(!env)('comments and follows against local Supabase', () => {
  const on: FlpServerEnv = { ...env!, community: true }
  let admin: SupabaseClient
  let owner: Account
  let fan: Account
  let slug = ''
  const handle = `cf-${crypto.randomUUID().slice(0, 8)}`

  function api({
    path,
    method = 'GET',
    token,
    body,
    serverEnv = on,
  }: {
    path: string
    method?: Method
    token?: string
    body?: unknown
    serverEnv?: FlpServerEnv
  }) {
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

  async function ok<T>(args: Parameters<typeof api>[0]) {
    const response = await api(args)
    expect(response.status, `${args.method ?? 'GET'} ${args.path}`).toBeLessThan(300)
    return (await response.json()) as T
  }

  beforeAll(async () => {
    admin = createClient(on.url, on.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    owner = await createAccount({ admin, env: on, label: 'cf-owner' })
    fan = await createAccount({ admin, env: on, label: 'cf-fan' })
    await acceptTermsFor({ admin, account: owner })
    await acceptTermsFor({ admin, account: fan })

    const created = await ok<{ designId: string }>({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Talked-about tee', content: DOCUMENT },
    })
    await ok({ path: `designs/${created.designId}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders: RENDERS } })
    slug = (await ok<{ slug: string }>({ path: `designs/${created.designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })).slug
    await ok({ path: 'profile', method: 'POST', token: owner.token, body: { handle, profilePublic: true } })
  })

  afterAll(async () => {
    for (const account of [owner, fan]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('off, the community routes do not exist', async () => {
    const off: FlpServerEnv = { ...env!, community: false }

    for (const [path, method] of [
      [`public/${slug}/comments`, 'GET'],
      [`public/${slug}/comments`, 'POST'],
      [`public/u/${handle}/follow`, 'GET'],
      ['public/following', 'GET'],
    ] as const) {
      expect((await api({ path, method, token: fan.token, body: method === 'POST' ? { body: 'Hi' } : undefined, serverEnv: off })).status, `${method} ${path}`).toBe(404)
    }
  })

  test('comments: read signed out, write signed in, hide by author or owner', async () => {
    expect((await ok<{ comments: DesignComment[] }>({ path: `public/${slug}/comments` })).comments).toEqual([])
    expect((await api({ path: `public/${slug}/comments`, method: 'POST', body: { body: 'Hi' } })).status).toBe(401)
    expect((await api({ path: `public/${slug}/comments`, method: 'POST', token: fan.token, body: { body: '   ' } })).status).toBe(422)

    const posted = await api({ path: `public/${slug}/comments`, method: 'POST', token: fan.token, body: { body: 'Love the cuffs' } })
    expect(posted.status).toBe(201)
    const [comment] = ((await posted.json()) as { comments: DesignComment[] }).comments
    expect(comment).toMatchObject({ body: 'Love the cuffs', mine: true, canHide: true, authorHandle: null })

    const asOwner = (await ok<{ comments: DesignComment[] }>({ path: `public/${slug}/comments`, token: owner.token })).comments
    expect(asOwner[0]).toMatchObject({ mine: false, canHide: true })
    const anonymous = (await ok<{ comments: DesignComment[] }>({ path: `public/${slug}/comments` })).comments
    expect(anonymous[0]).toMatchObject({ mine: false, canHide: false })
    expect(JSON.stringify(anonymous)).not.toContain(fan.id)

    expect((await api({ path: `public/${slug}/report`, method: 'POST', token: owner.token, body: { reason: 'spam', commentId: comment!.id } })).status).toBe(202)

    const hidden = await ok<{ comments: DesignComment[] }>({ path: `public/${slug}/comments/${comment!.id}`, method: 'DELETE', token: owner.token })
    expect(hidden.comments).toEqual([])
    expect((await api({ path: `public/${slug}/comments/${comment!.id}`, method: 'DELETE', token: fan.token })).status).toBe(200)
  })

  test('comments take the terms', async () => {
    const newcomer = await createAccount({ admin, env: on, label: 'cf-terms' })

    try {
      const refused = await api({ path: `public/${slug}/comments`, method: 'POST', token: newcomer.token, body: { body: 'Hello' } })
      expect(refused.status).toBe(403)
    } finally {
      await admin.auth.admin.deleteUser(newcomer.id)
    }
  })

  test('follows: public profiles only, never yourself, shown under Following', async () => {
    expect(await ok<FollowState>({ path: `public/u/${handle}/follow` })).toEqual({ followers: 0, following: false, own: false })
    expect(await ok<FollowState>({ path: `public/u/${handle}/follow`, token: owner.token })).toMatchObject({ own: true })
    expect((await api({ path: `public/u/${handle}/follow`, method: 'POST', token: owner.token })).status).toBe(409)
    expect((await api({ path: `public/u/${handle}/follow`, method: 'POST' })).status).toBe(401)
    expect((await api({ path: 'public/u/nobody-here/follow', method: 'POST', token: fan.token })).status).toBe(404)

    expect(await ok<FollowState>({ path: `public/u/${handle}/follow`, method: 'POST', token: fan.token })).toEqual({ followers: 1, following: true, own: false })
    const following = await ok<{ designs: BoardEntry[] }>({ path: 'public/following', token: fan.token })
    expect(following.designs.map((design) => design.slug)).toEqual([slug])
    expect((await api({ path: 'public/following' })).status).toBe(401)

    expect(await ok<FollowState>({ path: `public/u/${handle}/follow`, method: 'DELETE', token: fan.token })).toMatchObject({ followers: 0, following: false })
  })
})
