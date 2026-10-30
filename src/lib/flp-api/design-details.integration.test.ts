import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Rename, delete and public identity against a real local Supabase
 * (A06 #150, A07 #151). Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({
  kind,
  data: btoa(String.fromCharCode(...TINY_JPEG)),
}))

describe.skipIf(!env)('design details against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account

  function api({
    path,
    method = 'GET',
    token,
    body,
  }: {
    path: string
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    token?: string
    body?: unknown
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

  async function createDesign({ owner, title }: { owner: Account; title: string }) {
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title, content: DOCUMENT },
    })
    return ((await created.json()) as { designId: string }).designId
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    a = await createAccount({ admin, env: serverEnv, label: 'details-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'details-b' })
  })

  afterAll(async () => {
    for (const account of [a, b]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('rename and describe without adding a version', async () => {
    const designId = await createDesign({ owner: a, title: 'Before' })

    const renamed = await api({
      path: `designs/${designId}`,
      method: 'PATCH',
      token: a.token,
      body: { title: '  After  ', description: 'Crest on the back' },
    })

    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ id: designId, title: 'After', description: 'Crest on the back' })

    const read = (await (await api({ path: `designs/${designId}`, token: a.token })).json()) as {
      title: string
      headSeq: number
    }
    expect(read).toMatchObject({ title: 'After', headSeq: 1 })
  })

  test('invalid details and another owner are refused', async () => {
    const designId = await createDesign({ owner: a, title: 'Mine' })

    const blank = await api({ path: `designs/${designId}`, method: 'PATCH', token: a.token, body: { title: '   ' } })
    const empty = await api({ path: `designs/${designId}`, method: 'PATCH', token: a.token, body: {} })
    const other = await api({ path: `designs/${designId}`, method: 'PATCH', token: b.token, body: { title: 'Theirs' } })
    const otherDelete = await api({ path: `designs/${designId}`, method: 'DELETE', token: b.token })

    expect([blank.status, empty.status, other.status, otherDelete.status]).toEqual([422, 422, 404, 404])
    expect(((await (await api({ path: `designs/${designId}`, token: a.token })).json()) as { title: string }).title).toBe('Mine')
  })

  test('deleting a published design ends its link and removes its renders', async () => {
    const designId = await createDesign({ owner: a, title: 'Short-lived' })
    await api({ path: `designs/${designId}/renders`, method: 'POST', token: a.token, body: { seq: 1, renders: RENDERS } })
    const published = (await (
      await api({ path: `designs/${designId}/publication`, method: 'POST', token: a.token, body: { seq: 1 } })
    ).json()) as { slug: string }
    expect((await api({ path: `public/${published.slug}` })).status).toBe(200)

    const deleted = await api({ path: `designs/${designId}`, method: 'DELETE', token: a.token })

    expect(deleted.status).toBe(204)
    expect((await api({ path: `public/${published.slug}` })).status).toBe(404)
    expect((await api({ path: `designs/${designId}`, token: a.token })).status).toBe(404)
    const listed = (await (await api({ path: 'designs', token: a.token })).json()) as { designs: Array<{ id: string }> }
    expect(listed.designs.map((design) => design.id)).not.toContain(designId)
    const { data: files } = await admin.storage.from('design-assets').list(`${a.id}/${designId}/v1`)
    expect(files ?? []).toEqual([])
    expect((await api({ path: `designs/${designId}`, method: 'DELETE', token: a.token })).status).toBe(404)
  })

  test('the public display name is per account and can be cleared', async () => {
    expect(await (await api({ path: 'profile', token: a.token })).json()).toEqual({ displayName: null })

    const set = await api({ path: 'profile', method: 'POST', token: a.token, body: { displayName: ' Ada ' } })
    expect(await set.json()).toEqual({ displayName: 'Ada' })
    expect(await (await api({ path: 'profile', token: b.token })).json()).toEqual({ displayName: null })

    const tooLong = await api({ path: 'profile', method: 'POST', token: a.token, body: { displayName: 'x'.repeat(41) } })
    expect(tooLong.status).toBe(422)

    const cleared = await api({ path: 'profile', method: 'POST', token: a.token, body: { displayName: null } })
    expect(await cleared.json()).toEqual({ displayName: null })
    expect((await api({ path: 'profile' })).status).toBe(401)
  })
})
