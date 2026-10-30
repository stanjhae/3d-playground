import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG, rgbaPng } from '../image-fixtures'
import { sha256Hex } from '../image-validate'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'
import { handleSharePage } from './share-page'

/**
 * Publication races and public-surface privacy (#185), against a real local
 * Supabase. Opt-in like the other suites: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const baseEnv = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null
// Races publish far more often than a person can; rate limits have their
// own suite (quotas.integration.test.ts).
const env = baseEnv ? { ...baseEnv, rateLimits: { publish: 1000, save: 1000 } } : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

describe.skipIf(!env)('publication races against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let owner: Account
  let jpegRenders: Array<{ kind: string; data: string }>
  let pngRenders: Array<{ kind: string; data: string }>

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

  /** Fetches one of the public payload's own image links. */
  function publicImage({ href }: { href: string }) {
    return handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${href}`) })
  }

  function sharePage({ slug }: { slug: string }) {
    return handleSharePage({
      env: serverEnv,
      request: new Request(`http://localhost/api/og-share?slug=${slug}`, { headers: { 'User-Agent': 'Slackbot' } }),
    })
  }

  async function createDesign({ title }: { title: string }) {
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title, content: DOCUMENT },
    })
    expect(created.status).toBe(201)
    return ((await created.json()) as { designId: string }).designId
  }

  async function save({ designId, baseSeq }: { designId: string; baseSeq: number }) {
    return api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: owner.token,
      body: { baseSeq, mutationKey: crypto.randomUUID(), kind: 'autosave', content: DOCUMENT },
    })
  }

  async function uploadRenders({
    designId,
    seq,
    renders = jpegRenders,
  }: {
    designId: string
    seq: number
    renders?: Array<{ kind: string; data: string }>
  }) {
    const response = await api({
      path: `designs/${designId}/renders`,
      method: 'POST',
      token: owner.token,
      body: { seq, renders },
    })
    expect(response.status).toBe(201)
  }

  function publish({ designId, seq, displayName }: { designId: string; seq: number; displayName?: string }) {
    return api({
      path: `designs/${designId}/publication`,
      method: 'POST',
      token: owner.token,
      body: { seq, ...(displayName ? { displayName } : {}) },
    })
  }

  function unpublish({ designId }: { designId: string }) {
    return api({ path: `designs/${designId}/publication`, method: 'DELETE', token: owner.token })
  }

  async function ownerPublication({ designId }: { designId: string }) {
    const response = await api({ path: `designs/${designId}/publication`, token: owner.token })
    return ((await response.json()) as { publication: { slug: string; status: string; seq: number | null } | null })
      .publication
  }

  async function frontSha({ designId, seq }: { designId: string; seq: number }) {
    const { data } = await admin
      .from('render_artifacts')
      .select('sha256')
      .eq('design_id', designId)
      .eq('version_seq', seq)
      .eq('kind', 'view_front')
      .single()
    return data?.sha256 as string
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    owner = await createAccount({ admin, env: serverEnv, label: 'pub-race' })
    const png = await rgbaPng({ width: 8, height: 8 })
    jpegRenders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))
    pngRenders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: png }) }))
  })

  afterAll(async () => {
    if (owner) await admin.auth.admin.deleteUser(owner.id)
  })

  test('publishing while a save is in flight pins the requested seq', async () => {
    const designId = await createDesign({ title: 'Racing save' })
    let head = 1

    for (let round = 0; round < 5; round += 1) {
      await uploadRenders({ designId, seq: head })

      const [saved, published] = await Promise.all([save({ designId, baseSeq: head }), publish({ designId, seq: head })])
      const savedSeq = ((await saved.json()) as { seq: number }).seq
      const publication = (await published.json()) as { slug: string; seq: number }

      expect(saved.status).toBe(201)
      expect(savedSeq).toBe(head + 1)
      expect(published.status).toBe(200)
      expect(publication.seq).toBe(head)
      expect((await ownerPublication({ designId }))?.seq).toBe(head)

      const page = (await (await api({ path: `public/${publication.slug}` })).json()) as { seq: number }
      expect(page.seq).toBe(head)

      head = savedSeq
    }

    const { data } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    expect(data?.head_seq).toBe(head)
  })

  test('concurrent publish and unpublish end in a consistent state', async () => {
    const designId = await createDesign({ title: 'Flip flop' })
    await uploadRenders({ designId, seq: 1 })
    const first = (await (await publish({ designId, seq: 1 })).json()) as { slug: string }

    for (let round = 0; round < 12; round += 1) {
      const racers = [publish({ designId, seq: 1 }), unpublish({ designId })]
      const [published, revoked] = await Promise.all(round % 2 ? racers : racers.reverse())

      expect([published.status, revoked.status].sort()).toEqual([200, 204])

      const state = await ownerPublication({ designId })
      const page = await api({ path: `public/${first.slug}` })
      const image = await api({ path: `public/${first.slug}/image` })
      const card = await (await sharePage({ slug: first.slug })).text()

      // The slug survives every flip; only the status moves.
      expect(state?.slug).toBe(first.slug)

      if (state?.status === 'published') {
        expect(state.seq).toBe(1)
        expect(page.status).toBe(200)
        expect(image.status).toBe(200)
        expect(card).toContain('og:title" content="Flip flop"')
        expect(card).toContain(`/api/flp/public/${first.slug}/image`)
      } else {
        expect(state).toMatchObject({ status: 'revoked', seq: null })
        expect(page.status).toBe(404)
        expect(image.status).toBe(404)
        expect(image.headers.get('Cache-Control')).toBe('no-store')
        expect(card).not.toContain('Flip flop')
        expect(card).not.toContain('/api/flp/public/')
      }
    }
  })

  test('republishing while anonymous reads are happening never mixes versions', async () => {
    const designId = await createDesign({ title: 'Two takes' })
    const second = await save({ designId, baseSeq: 1 })
    const seqs = [1, ((await second.json()) as { seq: number }).seq]

    await uploadRenders({ designId, seq: seqs[0]!, renders: jpegRenders })
    await uploadRenders({ designId, seq: seqs[1]!, renders: pngRenders })

    const sha = new Map([
      [seqs[0]!, await frontSha({ designId, seq: seqs[0]! })],
      [seqs[1]!, await frontSha({ designId, seq: seqs[1]! })],
    ])
    expect(sha.get(seqs[0]!)).not.toBe(sha.get(seqs[1]!))

    const { slug } = (await (await publish({ designId, seq: seqs[0]! })).json()) as { slug: string }
    let republishing = true
    let reads = 0

    async function reader() {
      while (republishing) {
        const response = await api({ path: `public/${slug}` })
        expect(response.status).toBe(200)

        const page = (await response.json()) as { seq: number; renders: Record<string, string> }
        expect(seqs).toContain(page.seq)

        // Every view link is pinned to the version the payload describes.
        for (const href of Object.values(page.renders)) {
          expect(new URL(href, 'http://localhost').searchParams.get('seq')).toBe(String(page.seq))
        }

        // A pinned image is that version's bytes, or a 404 once republished.
        const pinned = await publicImage({ href: page.renders.view_front! })
        if (pinned.status === 200) {
          expect(await sha256Hex({ bytes: new Uint8Array(await pinned.arrayBuffer()) })).toBe(sha.get(page.seq))
        } else {
          expect(pinned.status).toBe(404)
        }

        // The unpinned preview image is always one whole published version.
        const preview = await api({ path: `public/${slug}/image` })
        expect(preview.status).toBe(200)
        expect([...sha.values()]).toContain(await sha256Hex({ bytes: new Uint8Array(await preview.arrayBuffer()) }))

        reads += 1
      }
    }

    async function republisher() {
      try {
        for (let round = 1; round <= 8; round += 1) {
          const response = await publish({ designId, seq: seqs[round % 2]! })
          expect(response.status).toBe(200)
          expect(((await response.json()) as { slug: string }).slug).toBe(slug)
        }
      } finally {
        republishing = false
      }
    }

    await Promise.all([republisher(), reader(), reader(), reader()])

    expect(reads).toBeGreaterThan(0)
    expect((await ownerPublication({ designId }))?.seq).toBe(seqs[0])
  })

  test('the public payload, images and OG page never include content, history or the owner', async () => {
    const title = 'Tee & "co" <b>bold</b>'
    const designId = await createDesign({ title })
    const saved = await save({ designId, baseSeq: 1 })
    const seq = ((await saved.json()) as { seq: number }).seq
    await uploadRenders({ designId, seq })
    const { slug } = (await (await publish({ designId, seq, displayName: 'Ada' })).json()) as { slug: string }

    const { data: version } = await admin
      .from('design_versions')
      .select('content_hash')
      .eq('design_id', designId)
      .eq('seq', seq)
      .single()
    const { data: artifact } = await admin
      .from('render_artifacts')
      .select('storage_path')
      .eq('design_id', designId)
      .eq('version_seq', seq)
      .eq('kind', 'view_front')
      .single()

    const payload = await (await api({ path: `public/${slug}` })).text()
    const page = JSON.parse(payload) as { renders: Record<string, string> }
    const image = await publicImage({ href: page.renders.view_front! })
    const card = await (await sharePage({ slug })).text()

    expect(image.status).toBe(200)
    expect(image.headers.get('Content-Type')).toMatch(/^image\//)
    expect(card).toContain('og:title" content="Tee &amp; &quot;co&quot; &lt;b&gt;bold&lt;/b&gt;"')
    expect(card).toContain('By Ada on Fashion Leader Vote.')
    expect(card).toContain(`og:image" content="http://localhost/api/flp/public/${slug}/image"`)
    expect(card).toContain(`twitter:image" content="http://localhost/api/flp/public/${slug}/image"`)

    const forbidden = [
      owner.id,
      designId,
      artifact?.storage_path as string,
      version?.content_hash as string,
      'panels',
      'layers',
      'versions',
      'mutationKey',
      'baseSeq',
      'storage/v1',
      'token=',
    ]

    for (const surface of [payload, card, [...image.headers.entries()].join('\n')]) {
      for (const secret of forbidden) {
        expect(surface).not.toContain(secret)
      }
    }

    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(['displayName', 'publishedAt', 'renders', 'seq', 'slug', 'title'])

    // History stays private too: the first version is never served.
    expect((await api({ path: `public/${slug}/image?seq=1` })).status).toBe(404)
    expect((await api({ path: `public/${slug}/image?view=atlas` })).status).toBe(404)
    expect((await api({ path: `public/${slug}/image/extra` })).status).toBe(404)

    // Unpublished, the card falls back to the site card with no title.
    expect((await unpublish({ designId })).status).toBe(204)
    const generic = await (await sharePage({ slug })).text()
    expect(generic).toContain('og:title" content="Fashion Leader Vote"')
    expect(generic).not.toContain('Tee')
    expect(generic).not.toContain('Ada')
  })
})
