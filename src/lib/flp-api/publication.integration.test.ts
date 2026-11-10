import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { listFilesUnder } from './delete-account-runner.mjs'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { BASE_PUBLIC_RENDER_KINDS, PUBLIC_RENDER_KINDS } from './publication'
import { handleSharePage } from './share-page'
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
  const owners: Account[] = []

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
    for (const account of [a, b, ...owners]) {
      if (account) {
        const files = await listFilesUnder({ admin, prefix: account.id })
        if (files.length > 0) await admin.storage.from('design-assets').remove(files)
        await admin.auth.admin.deleteUser(account.id)
      }
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

    // Every view, sleeves included, is served through the same hash check (#179).
    for (const kind of PUBLIC_RENDER_KINDS) {
      const view = await handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${page.renders[kind]}`) })
      expect(view.status, kind).toBe(200)
    }

    const front = await handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${page.renders.view_front}`) })
    expect(front.status).toBe(200)
    expect(front.headers.get('Content-Type')).toMatch(/^image\//)
    expect(front.headers.get('Cache-Control')).toBe('no-store')
    expect(front.headers.get('X-Robots-Tag')).toBe('noindex')
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

  test('a view replaced in storage after upload is never served (#180)', async () => {
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: a.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Tamper check', content: DOCUMENT },
    })
    const tamperId = ((await created.json()) as { designId: string }).designId
    expect((await api({ path: `designs/${tamperId}/renders`, method: 'POST', token: a.token, body: { seq: 1, renders: RENDERS } })).status).toBe(201)
    const { slug } = (await (
      await api({ path: `designs/${tamperId}/publication`, method: 'POST', token: a.token, body: { seq: 1 } })
    ).json()) as { slug: string }
    const image = () =>
      handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost/api/flp/public/${slug}/image?seq=1`) })

    expect((await image()).status).toBe(200)

    // Someone with storage access swaps the stored front view.
    const { data: rows } = await admin
      .from('render_artifacts')
      .select('storage_path')
      .eq('design_id', tamperId)
      .eq('kind', 'view_front')
      .single()
    const swapped = new Uint8Array(TINY_JPEG)
    swapped[swapped.length - 3] ^= 0xff
    await admin.storage.from('design-assets').upload(rows!.storage_path as string, swapped, { contentType: 'image/jpeg', upsert: true })

    expect((await image()).status).toBe(404)
  })

  test('views record what drew them, and republishing a version never replaces them (C2)', async () => {
    // Its own account: the publish rate limit is per account.
    const owner = await createAccount({ admin, env: serverEnv, label: 'pub-stamp' })
    owners.push(owner)
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Stamp check', content: DOCUMENT },
    })
    const stampId = ((await created.json()) as { designId: string }).designId
    const upload = (stamp: { templateVersion: number; compilerVersion: number }) =>
      api({ path: `designs/${stampId}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders: RENDERS, ...stamp } })
    const stored = async () =>
      (
        await admin
          .from('render_artifacts')
          .select('kind, storage_path, sha256, template_version, compiler_version, created_at')
          .eq('design_id', stampId)
          .order('kind')
      ).data

    const first = await upload({ templateVersion: 2, compilerVersion: 1 })
    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({ kept: [] })
    const before = await stored()
    expect(before?.map((row) => [row.template_version, row.compiler_version])).toEqual(
      PUBLIC_RENDER_KINDS.map(() => [2, 1]),
    )

    const { slug } = (await (
      await api({ path: `designs/${stampId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
    ).json()) as { slug: string }

    // Unpublish, then publish the same version again with a new stamp.
    await api({ path: `designs/${stampId}/publication`, method: 'DELETE', token: owner.token })
    const again = await upload({ templateVersion: 3, compilerVersion: 2 })
    expect(again.status).toBe(201)
    expect(await again.json()).toMatchObject({ kept: [...PUBLIC_RENDER_KINDS] })
    expect(await stored()).toEqual(before)

    await api({ path: `designs/${stampId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
    const front = await handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/public/${slug}/image?seq=1`),
    })
    expect(front.status).toBe(200)
  })

  describe('sleeve views (#179)', () => {
    // Its own account: the publish rate limit is per account.
    let c: Account
    let legacyId: string
    let slug: string

    beforeAll(async () => {
      c = await createAccount({ admin, env: serverEnv, label: 'pub-c' })
      const created = await api({
        path: 'designs',
        method: 'POST',
        token: c.token,
        body: { mutationKey: crypto.randomUUID(), title: 'Three-view tee', content: DOCUMENT },
      })
      legacyId = ((await created.json()) as { designId: string }).designId
      expect((await api({ path: `designs/${legacyId}/renders`, method: 'POST', token: c.token, body: { seq: 1, renders: RENDERS } })).status).toBe(201)

      // Back to what a version uploaded before #179 has: the three base
      // views, each with the hash recorded at upload, and no sleeves.
      const { data: sleeves } = await admin
        .from('render_artifacts')
        .select('storage_path')
        .eq('design_id', legacyId)
        .in('kind', ['view_left', 'view_right'])
      await admin.storage.from('design-assets').remove((sleeves ?? []).map((row) => row.storage_path as string))
      await admin.from('render_artifacts').delete().eq('design_id', legacyId).in('kind', ['view_left', 'view_right'])
    })

    afterAll(async () => {
      if (c) await admin.auth.admin.deleteUser(c.id)
    })

    test('an upload of only the three original views is refused', async () => {
      const response = await api({
        path: `designs/${legacyId}/renders`,
        method: 'POST',
        token: c.token,
        body: { seq: 1, renders: RENDERS.slice(0, 3) },
      })

      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ error: { issues: [{ path: '$.renders' }] } })
    })

    test('a new publication needs all five views', async () => {
      const response = await api({ path: `designs/${legacyId}/publication`, method: 'POST', token: c.token, body: { seq: 1 } })
      const body = (await response.json()) as { error: { issues: Array<{ path: string }> } }

      expect(response.status).toBe(422)
      expect(body.error.issues.map((issue) => issue.path)).toEqual(['$.renders.view_left', '$.renders.view_right'])

      const owner = (await (await api({ path: `designs/${legacyId}/publication`, token: c.token })).json()) as {
        publication: { rendersReadyForHead: boolean } | null
      }
      expect(owner.publication?.rendersReadyForHead ?? false).toBe(false)
    })

    test('a publication made with three views stays public and serves them', async () => {
      // Published before #179, when three views were enough.
      const { data, error } = await admin
        .rpc('flp_publish_version', { p_owner_id: c.id, p_design_id: legacyId, p_seq: 1, p_display_name: null })
        .single<{ slug: string }>()
      expect(error).toBeNull()
      slug = data!.slug

      const anonymous = await api({ path: `public/${slug}` })
      const page = (await anonymous.json()) as { renders: Record<string, string> }

      expect(anonymous.status).toBe(200)
      expect(Object.keys(page.renders)).toEqual([...BASE_PUBLIC_RENDER_KINDS])

      for (const kind of BASE_PUBLIC_RENDER_KINDS) {
        const view = await handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${page.renders[kind]}`) })
        expect(view.status, kind).toBe(200)
        expect(view.headers.get('Content-Type')).toMatch(/^image\//)
      }

      // There is no sleeve view to serve, so asking for one is a plain 404.
      for (const kind of ['view_left', 'view_right']) {
        expect((await api({ path: `public/${slug}/image?view=${kind}&seq=1` })).status, kind).toBe(404)
      }
    })

    test('its share page embeds the three views and no sleeve row', async () => {
      const response = await handleSharePage({
        env: serverEnv,
        request: new Request(`http://localhost/s/${slug}`),
        loadShell: async () => '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>',
      })
      const html = await response.text()
      const overlay = html.slice(html.indexOf('id="flp-static-share"'), html.indexOf('<div id="root">'))

      expect(response.status).toBe(200)
      expect(overlay.match(/<img /g)).toHaveLength(3)
      expect(html).not.toContain('view=view_left')
      expect(html).toContain(`<link rel="preload" as="image" href="/api/flp/public/${slug}/image?seq=1"`)
    })
  })

  /** A new design, published at v1 with its five views. */
  async function publishedDesign({ owner, title }: { owner: Account; title: string }) {
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title, content: DOCUMENT },
    })
    const id = ((await created.json()) as { designId: string }).designId
    expect((await api({ path: `designs/${id}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders: RENDERS } })).status).toBe(201)
    const published = await api({ path: `designs/${id}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
    expect(published.status).toBe(200)
    return { id, slug: ((await published.json()) as { slug: string }).slug }
  }

  /** Publishing is rate limited per account, so these tests each get their own. */
  async function freshOwner({ label }: { label: string }) {
    const owner = await createAccount({ admin, env: serverEnv, label })
    owners.push(owner)
    return owner
  }

  const image = ({ slug, query = '' }: { slug: string; query?: string }) => api({ path: `public/${slug}/image${query}` })

  test('earlier image URLs stop at a republish, every one stops at an unpublish, and all of it is no-store', async () => {
    const owner = await freshOwner({ label: 'pub-versions' })
    const { id, slug } = await publishedDesign({ owner, title: 'Versions' })

    for (const kind of PUBLIC_RENDER_KINDS) {
      expect((await image({ slug, query: `?view=${kind}&seq=1` })).status, kind).toBe(200)
    }

    const saved = await api({
      path: `designs/${id}/versions`,
      method: 'POST',
      token: owner.token,
      body: { baseSeq: 1, mutationKey: crypto.randomUUID(), kind: 'autosave', content: DOCUMENT },
    })
    expect(saved.status).toBe(201)
    await api({ path: `designs/${id}/renders`, method: 'POST', token: owner.token, body: { seq: 2, renders: RENDERS } })
    expect((await api({ path: `designs/${id}/publication`, method: 'POST', token: owner.token, body: { seq: 2 } })).status).toBe(200)

    for (const kind of PUBLIC_RENDER_KINDS) {
      const old = await image({ slug, query: `?view=${kind}&seq=1` })
      expect(old.status, `${kind} v1`).toBe(404)
      expect(old.headers.get('Cache-Control'), `${kind} v1`).toBe('no-store')
      const current = await image({ slug, query: `?view=${kind}&seq=2` })
      expect(current.status, `${kind} v2`).toBe(200)
      expect(current.headers.get('Cache-Control'), `${kind} v2`).toBe('no-store')
    }

    const live = await handleSharePage({ env: serverEnv, request: new Request(`http://localhost/s/${slug}`), loadShell: async () => null })
    expect(live.headers.get('Cache-Control')).toBe('no-store')
    expect((await api({ path: `public/${slug}` })).headers.get('Cache-Control')).toBe('no-store')

    expect((await api({ path: `designs/${id}/publication`, method: 'DELETE', token: owner.token })).status).toBe(204)

    for (const kind of PUBLIC_RENDER_KINDS) {
      for (const query of [`?view=${kind}`, `?view=${kind}&seq=1`, `?view=${kind}&seq=2`]) {
        const denied = await image({ slug, query })
        expect(denied.status, query).toBe(404)
        expect(denied.headers.get('Cache-Control'), query).toBe('no-store')
      }
    }

    const payload = await api({ path: `public/${slug}` })
    expect(payload.status).toBe(404)
    expect(payload.headers.get('Cache-Control')).toBe('no-store')
    const page = await handleSharePage({ env: serverEnv, request: new Request(`http://localhost/s/${slug}`), loadShell: async () => null })
    expect(page.headers.get('Cache-Control')).toBe('no-store')
  })

  test('unpublished, deleted, private and unknown links answer exactly the same', async () => {
    const owner = await freshOwner({ label: 'pub-neutral' })
    const unpublished = await publishedDesign({ owner, title: 'Secret unpublished title' })
    expect((await api({ path: `designs/${unpublished.id}/publication`, method: 'DELETE', token: owner.token })).status).toBe(204)
    const deleted = await publishedDesign({ owner, title: 'Secret deleted title' })
    expect((await api({ path: `designs/${deleted.id}`, method: 'DELETE', token: owner.token })).status).toBe(204)
    // A design that was never published has no slug; its id is the nearest guess.
    const links = [unpublished.slug, deleted.slug, designId, '0123456789abcdef']

    const answers = await Promise.all(
      links.map(async (slug) => {
        const masked = (text: string) => text.replaceAll(slug, 'SLUG')
        const payload = await api({ path: `public/${slug}` })
        const picture = await image({ slug })
        const page = await handleSharePage({
          env: serverEnv,
          request: new Request(`http://localhost/s/${slug}`),
          loadShell: async () => '<html><head></head><body><div id="root"></div></body></html>',
        })
        return {
          payload: [payload.status, payload.headers.get('Cache-Control'), masked(await payload.text())],
          picture: [picture.status, picture.headers.get('Cache-Control'), masked(await picture.text())],
          page: [page.status, page.headers.get('Cache-Control'), masked(await page.text())],
        }
      }),
    )

    for (const answer of answers.slice(1)) {
      expect(answer).toEqual(answers[0])
    }

    expect(answers[0]!.payload[0]).toBe(404)
    expect(answers[0]!.picture[0]).toBe(404)
    expect(String(answers[0]!.page[2])).not.toContain('Secret')
  })

  test('an unknown or malformed slug is a plain 404', async () => {
    expect((await api({ path: 'public/0123456789abcdef' })).status).toBe(404)
    expect((await api({ path: 'public/..%2Fdesigns' })).status).toBe(404)
  })
})
