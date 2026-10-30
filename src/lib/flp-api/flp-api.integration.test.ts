import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { CanonicalDocument } from '../canonical-document'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Runs against a real local Supabase (`supabase start` + migrations) with
 * real user JWTs. Opt-in so plain `pnpm test` never needs the stack:
 *   pnpm test:integration
 * (sets FLP_INTEGRATION=1; SUPABASE_* come from .env.local via vite.config).
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}
const env =
  processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

type Account = { id: string; token: string; client: SupabaseClient }

function withText({ text }: { text: string }): CanonicalDocument {
  const document = structuredClone(GOLDEN_DOCUMENT)
  const layer = document.panels.back.layers[0]

  if (layer?.kind === 'text') {
    layer.content = text
  }

  return document
}

describe.skipIf(!env)('FLP design API against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  const admin = createClient(serverEnv.url, serverEnv.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const accounts: Account[] = []
  let a: Account
  let b: Account
  let designId: string

  async function account({ label }: { label: string }): Promise<Account> {
    const email = `it-${label}-${crypto.randomUUID()}@example.test`
    const password = `pw-${crypto.randomUUID()}`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })

    if (created.error || !created.data.user) {
      throw created.error ?? new Error('user not created')
    }

    const client = createClient(serverEnv.url, serverEnv.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signedIn = await client.auth.signInWithPassword({ email, password })

    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error('no session')
    }

    const result = { id: created.data.user.id, token: signedIn.data.session.access_token, client }
    accounts.push(result)
    return result
  }

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

  async function headSeq() {
    const { data } = await admin.from('designs').select('head_seq').eq('id', designId).single()
    return data?.head_seq as number
  }

  async function versionCount() {
    const { count } = await admin
      .from('design_versions')
      .select('*', { count: 'exact', head: true })
      .eq('design_id', designId)
    return count
  }

  beforeAll(async () => {
    a = await account({ label: 'a' })
    b = await account({ label: 'b' })

    const created = await api({
      path: 'designs',
      method: 'POST',
      token: a.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Crest tee', content: GOLDEN_DOCUMENT },
    })
    expect(created.status).toBe(201)
    designId = ((await created.json()) as { designId: string }).designId
  })

  afterAll(async () => {
    for (const { id } of accounts) {
      await admin.auth.admin.deleteUser(id)
    }
  })

  test('requires a verified session', async () => {
    expect((await api({ path: 'designs' })).status).toBe(401)
    expect((await api({ path: 'designs', token: 'not-a-jwt' })).status).toBe(401)
  })

  test('new designs are private and listed only for their owner', async () => {
    const mine = (await (await api({ path: 'designs', token: a.token })).json()) as {
      designs: Array<{ id: string; visibility: string; headSeq: number }>
    }
    const theirs = (await (await api({ path: 'designs', token: b.token })).json()) as {
      designs: unknown[]
    }

    expect(mine.designs).toEqual([
      expect.objectContaining({ id: designId, visibility: 'private', headSeq: 1 }),
    ])
    expect(theirs.designs).toEqual([])
  })

  test('another owner gets a neutral 404 for reads and writes on a guessed id', async () => {
    const read = await api({ path: `designs/${designId}`, token: b.token })
    const write = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: b.token,
      body: { baseSeq: 1, mutationKey: crypto.randomUUID(), kind: 'autosave', content: GOLDEN_DOCUMENT },
    })

    expect(read.status).toBe(404)
    expect(write.status).toBe(404)
    expect(await write.json()).toEqual({ error: { code: 'not_found', message: 'Design not found' } })
  })

  test('the owner reads back exactly what was saved', async () => {
    const response = await api({ path: `designs/${designId}`, token: a.token })
    const body = (await response.json()) as { head: { content: unknown; seq: number } }

    expect(body.head.seq).toBe(1)
    expect(body.head.content).toEqual(GOLDEN_DOCUMENT)
  })

  test('invalid content is refused with paths', async () => {
    const response = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: {
        baseSeq: 1,
        mutationKey: crypto.randomUUID(),
        kind: 'autosave',
        content: { ...GOLDEN_DOCUMENT, camera: { azimuth: 1 } },
      },
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: { issues: [{ path: '$.camera' }] } })
  })

  test('two concurrent saves on the same base: one accepted, one conflict', async () => {
    const base = await headSeq()
    const [first, second] = await Promise.all(
      ['first', 'second'].map((text) =>
        api({
          path: `designs/${designId}/versions`,
          method: 'POST',
          token: a.token,
          body: { baseSeq: base, mutationKey: crypto.randomUUID(), kind: 'autosave', content: withText({ text }) },
        }),
      ),
    )

    expect([first?.status, second?.status].sort()).toEqual([201, 409])
    const conflict = first?.status === 409 ? first : second
    expect(await conflict?.json()).toMatchObject({ error: { code: 'conflict', headSeq: base + 1 } })
    expect(await headSeq()).toBe(base + 1)
  })

  test('a retried save creates at most one version; a reused key with new content fails', async () => {
    const base = await headSeq()
    const request = {
      baseSeq: base,
      mutationKey: crypto.randomUUID(),
      kind: 'checkpoint',
      label: 'Named',
      content: withText({ text: 'retry' }),
    }
    const first = await api({ path: `designs/${designId}/versions`, method: 'POST', token: a.token, body: request })
    const countAfterFirst = await versionCount()
    const retry = await api({ path: `designs/${designId}/versions`, method: 'POST', token: a.token, body: request })
    const reused = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: { ...request, baseSeq: base + 1, content: withText({ text: 'different' }) },
    })

    expect(first.status).toBe(201)
    expect(retry.status).toBe(201)
    expect(((await retry.json()) as { seq: number }).seq).toBe(base + 1)
    expect(await versionCount()).toBe(countAfterFirst)
    expect(reused.status).toBe(409)
    expect(await reused.json()).toMatchObject({
      error: { message: 'mutation key reused with different content' },
    })
  })

  test('restore appends a new revision pointing at its source', async () => {
    const base = await headSeq()
    const response = await api({
      path: `designs/${designId}/restore`,
      method: 'POST',
      token: a.token,
      body: { baseSeq: base, mutationKey: crypto.randomUUID(), fromSeq: 1 },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ seq: base + 1, kind: 'restore', restoredFromSeq: 1 })
  })

  test('saving never moves the published pointer', async () => {
    await admin.rpc('flp_publish_version', { p_owner_id: a.id, p_design_id: designId, p_seq: 1 })
    const base = await headSeq()

    await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: { baseSeq: base, mutationKey: crypto.randomUUID(), kind: 'autosave', content: withText({ text: 'after publish' }) },
    })

    const { data } = await admin.from('publications').select('version_seq').eq('design_id', designId).single()
    expect(data?.version_seq).toBe(1)
    expect(await headSeq()).toBe(base + 1)
  })

  test('a failed write leaves no advanced pointer or half version', async () => {
    const base = await headSeq()
    const before = await versionCount()
    const { error } = await admin.rpc('flp_save_version', {
      p_owner_id: a.id,
      p_design_id: designId,
      p_base_seq: base,
      p_mutation_key: crypto.randomUUID(),
      p_content: { schemaVersion: 1 },
      p_content_hash: `sha256:${'0'.repeat(64)}`,
    })

    expect(error?.code).toBe('23514')
    expect(await headSeq()).toBe(base)
    expect(await versionCount()).toBe(before)
  })

  test('the owner cannot bypass the API through Supabase REST', async () => {
    const reassign = await a.client
      .from('designs')
      .update({ owner_id: b.id })
      .eq('id', designId)
      .select()
    const insert = await a.client.from('design_versions').insert({
      design_id: designId,
      seq: 999,
      owner_id: a.id,
      kind: 'autosave',
      schema_version: 2,
      content: GOLDEN_DOCUMENT,
      content_hash: `sha256:${'1'.repeat(64)}`,
      content_bytes: 10,
      mutation_key: crypto.randomUUID(),
    })
    const rpc = await a.client.rpc('flp_save_version', {
      p_owner_id: a.id,
      p_design_id: designId,
      p_base_seq: await headSeq(),
      p_mutation_key: crypto.randomUUID(),
      p_content: GOLDEN_DOCUMENT,
      p_content_hash: `sha256:${'2'.repeat(64)}`,
    })
    const guessed = await b.client.from('design_versions').select('seq').eq('design_id', designId)

    // PostgREST reports a write without privileges as 401/403 with 42501.
    expect(reassign.error?.code).toBe('42501')
    expect(insert.error?.code).toBe('42501')
    expect(rpc.error?.code).toBe('42501')
    expect(guessed.data).toEqual([])
  })
})
