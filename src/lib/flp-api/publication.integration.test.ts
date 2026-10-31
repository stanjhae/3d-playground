import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Publication against a real local Supabase (P01–P05, #179–#183).
 * Opt-in like the other suites: `pnpm test:integration`.
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

describe.skipIf(!env)('publication against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account
  let designId: string

  function api({
    path,
    method = 'GET',
    token,
    body,
  }: {
    path: string
    method?: 'GET' | 'POST' | 'DELETE'
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

  async function save({ baseSeq }: { baseSeq: number }) {
    const response = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: { baseSeq, mutationKey: crypto.randomUUID(), kind: 'autosave', content: DOCUMENT },
    })
    return ((await response.json()) as { seq: number }).seq
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    a = await createAccount({ admin, env: serverEnv, label: 'pub-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'pub-b' })
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: a.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Shared tee', content: DOCUMENT },
    })
    designId = ((await created.json()) as { designId: string }).designId
  })

  afterAll(async () => {
    for (const account of [a, b]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('publishing a version without its views is refused', async () => {
    const response = await api({ path: `designs/${designId}/publication`, method: 'POST', token: a.token, body: { seq: 1 } })

    const body = (await response.json()) as { error: { issues: Array<{ path: string }> } }

    expect(response.status).toBe(422)
    expect(body.error.issues.map((issue) => issue.path)).toEqual(
      PUBLIC_RENDER_KINDS.map((kind) => `$.renders.${kind}`),
    )
  })

  test('renders are validated: a non-image is refused with its kind', async () => {
    const response = await api({
      path: `designs/${designId}/renders`,
      method: 'POST',
      token: a.token,
      body: { seq: 1, renders: [{ kind: 'view_front', data: btoa('<svg/>') }, ...RENDERS.slice(1)] },
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { issues: [{ path: '$.renders.view_front' }] } })
  })

  test('another owner can neither upload renders, publish nor unpublish', async () => {
    const renders = await api({ path: `designs/${designId}/renders`, method: 'POST', token: b.token, body: { seq: 1, renders: RENDERS } })
    const publish = await api({ path: `designs/${designId}/publication`, method: 'POST', token: b.token, body: { seq: 1 } })
    const revoke = await api({ path: `designs/${designId}/publication`, method: 'DELETE', token: b.token })

    expect([renders.status, publish.status, revoke.status]).toEqual([404, 404, 404])
  })

  test('publish → anonymous page shows renders only; edits do not change it; unpublish hides it at once', async () => {
    expect((await api({ path: `designs/${designId}/renders`, method: 'POST', token: a.token, body: { seq: 1, renders: RENDERS } })).status).toBe(201)

    const published = await api({
      path: `designs/${designId}/publication`,
      method: 'POST',
      token: a.token,
      body: { seq: 1, displayName: 'Ada' },
    })
    const publication = (await published.json()) as { slug: string; status: string; seq: number }

    expect(published.status).toBe(200)
    expect(publication).toMatchObject({ status: 'published', seq: 1 })

    const anonymous = await api({ path: `public/${publication.slug}` })
    const page = (await anonymous.json()) as Record<string, unknown> & { renders: Record<string, string> }

    expect(anonymous.status).toBe(200)
    expect(page).toMatchObject({ title: 'Shared tee', displayName: 'Ada', seq: 1 })
    expect(Object.keys(page).sort()).toEqual(['displayName', 'publishedAt', 'renders', 'seq', 'slug', 'title'])
    expect(Object.keys(page.renders).sort()).toEqual([...PUBLIC_RENDER_KINDS].sort())
    expect(JSON.stringify(page)).not.toContain('panels')
    expect(page.renders.view_front).toBe(`/api/flp/public/${publication.slug}/image?seq=1`)

    const front = await handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${page.renders.view_front}`) })
    expect(front.status).toBe(200)
    expect(front.headers.get('Content-Type')).toMatch(/^image\//)
    expect(front.headers.get('Cache-Control')).toBe('no-store')
    expect(anonymous.headers.get('Cache-Control')).toBe('no-store')

    // Saving after publish never moves what the public sees.
    const next = await save({ baseSeq: 1 })
    expect(((await (await api({ path: `public/${publication.slug}` })).json()) as { seq: number }).seq).toBe(1)

    // Republishing a newer version keeps the stable link.
    await api({ path: `designs/${designId}/renders`, method: 'POST', token: a.token, body: { seq: next, renders: RENDERS } })
    const republished = (await (await api({
      path: `designs/${designId}/publication`,
      method: 'POST',
      token: a.token,
      body: { seq: next },
    })).json()) as { slug: string; seq: number }

    expect(republished).toMatchObject({ slug: publication.slug, seq: next })

    const owner = (await (await api({ path: `designs/${designId}/publication`, token: a.token })).json()) as {
      publication: { status: string; seq: number; rendersReadyForHead: boolean }
    }
    expect(owner.publication).toMatchObject({ status: 'published', seq: next, rendersReadyForHead: true })

    expect((await api({ path: `designs/${designId}/publication`, method: 'DELETE', token: a.token })).status).toBe(204)
    expect((await api({ path: `public/${publication.slug}` })).status).toBe(404)
    expect((await api({ path: `public/${publication.slug}/image` })).status).toBe(404)
  })

  test('an unknown or malformed slug is a plain 404', async () => {
    expect((await api({ path: 'public/0123456789abcdef' })).status).toBe(404)
    expect((await api({ path: 'public/..%2Fdesigns' })).status).toBe(404)
  })
})
