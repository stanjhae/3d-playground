import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { CanonicalDocument } from '../canonical-document'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import type { VersionDetail, VersionPage, VersionResponse } from './contract'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Cloud history and restore (S07 #176, S08 #177) against local Supabase:
 *   pnpm test:integration
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}
const env =
  processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })

function withText({ text }: { text: string }): CanonicalDocument {
  const document = structuredClone(DOCUMENT)
  const layer = document.panels.back.layers[0]

  if (layer?.kind === 'text') {
    layer.content = text
  }

  return document
}

describe.skipIf(!env)('FLP history and restore against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account
  let designId: string
  /** Content hash of each seq, as saved. */
  const hashes = new Map<number, string>()

  function api({
    path,
    method = 'GET',
    token,
    body,
  }: {
    path: string
    method?: 'GET' | 'POST'
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

  async function save({ text, kind = 'autosave', label }: { text: string; kind?: string; label?: string }) {
    const { data } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    const response = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: {
        baseSeq: data?.head_seq,
        mutationKey: crypto.randomUUID(),
        kind,
        ...(label ? { label } : {}),
        content: withText({ text }),
      },
    })
    expect(response.status).toBe(201)
    const version = (await response.json()) as VersionResponse
    hashes.set(version.seq, version.contentHash)
    return version
  }

  async function page({ query = '', token = a.token }: { query?: string; token?: string } = {}) {
    return api({ path: `designs/${designId}/versions${query}`, token })
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    a = await createAccount({ admin, env: serverEnv, label: 'history-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'history-b' })

    const created = await api({
      path: 'designs',
      method: 'POST',
      token: a.token,
      body: { mutationKey: crypto.randomUUID(), title: 'History tee', content: withText({ text: 'A' }) },
    })
    const first = (await created.json()) as VersionResponse
    designId = first.designId
    hashes.set(1, first.contentHash)

    // v2–v6 autosaves, v7 a named checkpoint.
    for (const text of ['B', 'C', 'D', 'E', 'F']) {
      await save({ text })
    }

    await save({ text: 'G', kind: 'checkpoint', label: 'Before sleeves' })
  })

  afterAll(async () => {
    for (const account of [a, b]) {
      if (!account) {
        continue
      }

      const { data } = await admin.from('designs').select('id').eq('owner_id', account.id)

      for (const { id } of data ?? []) {
        await admin.rpc('flp_delete_design', { p_owner_id: account.id, p_design_id: id })
      }

      await admin.auth.admin.deleteUser(account.id)
    }
  })

  test('pages newest first in a stable order until version 1', async () => {
    const seen: number[] = []
    let before: number | null = null
    let pages = 0

    do {
      const response = await page({ query: `?limit=3${before === null ? '' : `&before=${before}`}` })
      expect(response.status).toBe(200)
      const body = (await response.json()) as VersionPage
      expect(body.headSeq).toBe(7)
      seen.push(...body.versions.map((version) => version.seq))
      before = body.nextBefore
      pages += 1
    } while (before !== null && pages < 10)

    expect(pages).toBe(3)
    expect(seen).toEqual([7, 6, 5, 4, 3, 2, 1])
  })

  test('rows carry kind, label, time, hash and no content', async () => {
    const body = (await (await page({ query: '?limit=2' })).json()) as VersionPage

    expect(body.versions[0]).toEqual({
      seq: 7,
      kind: 'checkpoint',
      label: 'Before sleeves',
      contentHash: hashes.get(7),
      restoredFromSeq: null,
      createdAt: expect.any(String),
    })
    expect(body.versions[1]).toMatchObject({ seq: 6, kind: 'autosave', label: null })
    expect(body.nextBefore).toBe(6)
  })

  test('reads one version for preview', async () => {
    const response = await api({ path: `designs/${designId}/versions/2`, token: a.token })
    expect(response.status).toBe(200)
    const body = (await response.json()) as VersionDetail

    expect(body).toMatchObject({ designId, seq: 2, kind: 'autosave', contentHash: hashes.get(2) })
    expect(body.content).toEqual(withText({ text: 'B' }))
  })

  test('another owner, a missing version and bad cursors are refused', async () => {
    const other = [
      await page({ token: b.token }),
      await api({ path: `designs/${designId}/versions/1`, token: b.token }),
      await api({ path: `designs/${crypto.randomUUID()}/versions`, token: a.token }),
    ]

    for (const response of other) {
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Design not found' } })
    }

    expect((await api({ path: `designs/${designId}/versions/99`, token: a.token })).status).toBe(404)
    expect((await api({ path: `designs/${designId}/versions/head`, token: a.token })).status).toBe(404)
    expect((await api({ path: `designs/${designId}/versions/1/extra`, token: a.token })).status).toBe(404)
    expect((await page({ query: '?limit=500' })).status).toBe(422)
    expect((await page({ query: '?before=0' })).status).toBe(422)
    expect((await api({ path: `designs/${designId}/versions` })).status).toBe(401)
  })

  test('a checkpoint name is validated', async () => {
    const { data } = await admin.from('designs').select('head_seq').eq('id', designId).single()

    for (const label of [' ', 'x'.repeat(61), 'two\nlines']) {
      const response = await api({
        path: `designs/${designId}/versions`,
        method: 'POST',
        token: a.token,
        body: { baseSeq: data?.head_seq, mutationKey: crypto.randomUUID(), kind: 'checkpoint', label, content: DOCUMENT },
      })
      expect(response.status).toBe(422)
    }
  })

  test('restore appends a copy with restoredFromSeq, keeps history and leaves the publication alone', async () => {
    await admin.rpc('flp_publish_version', { p_owner_id: a.id, p_design_id: designId, p_seq: 3 })
    const { data: design } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    const head = design?.head_seq as number
    const before = (await (await page({ query: '?limit=50' })).json()) as VersionPage

    expect(before.publishedSeq).toBe(3)

    const response = await api({
      path: `designs/${designId}/restore`,
      method: 'POST',
      token: a.token,
      body: { baseSeq: head, mutationKey: crypto.randomUUID(), fromSeq: 2 },
    })
    expect(response.status).toBe(201)
    const restored = (await response.json()) as VersionResponse

    expect(restored).toMatchObject({ seq: head + 1, kind: 'restore', restoredFromSeq: 2, contentHash: hashes.get(2) })

    const after = (await (await page({ query: '?limit=50' })).json()) as VersionPage
    expect(after.headSeq).toBe(head + 1)
    expect(after.publishedSeq).toBe(3)
    expect(after.versions[0]).toMatchObject({ seq: head + 1, kind: 'restore', restoredFromSeq: 2 })
    // A, B and everything after stay intact.
    expect(after.versions.slice(1)).toEqual(before.versions)

    const content = (await (await api({ path: `designs/${designId}/versions/${head + 1}`, token: a.token })).json()) as VersionDetail
    expect(content.content).toEqual(withText({ text: 'B' }))

    const { data: publication } = await admin
      .from('publications')
      .select('version_seq, status')
      .eq('design_id', designId)
      .single()
    expect(publication).toEqual({ version_seq: 3, status: 'published' })
  })

  test('concurrent restores from one base: one wins, the other conflicts', async () => {
    const { data } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    const head = data?.head_seq as number
    const restore = (fromSeq: number) =>
      api({
        path: `designs/${designId}/restore`,
        method: 'POST',
        token: a.token,
        body: { baseSeq: head, mutationKey: crypto.randomUUID(), fromSeq },
      })

    const statuses = (await Promise.all([restore(1), restore(4)])).map((response) => response.status).sort()

    expect(statuses).toEqual([201, 409])
    const { data: after } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    expect(after?.head_seq).toBe(head + 1)
  })

  test("another owner cannot restore or read this design's versions", async () => {
    const { data } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    const response = await api({
      path: `designs/${designId}/restore`,
      method: 'POST',
      token: b.token,
      body: { baseSeq: data?.head_seq, mutationKey: crypto.randomUUID(), fromSeq: 1 },
    })

    expect(response.status).toBe(404)
    const { data: after } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    expect(after?.head_seq).toBe(data?.head_seq)
  })
})
