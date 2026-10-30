import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { useSessionStore } from '../auth/session-store'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import {
  TINY_JPEG,
  ascii,
  gpsExifSegment,
  includesBytes,
  pngChunk,
  rgbaPng,
  withJpegSegments,
} from '../image-fixtures'
import { sha256Hex } from '../image-validate'
import { assetReadUrl, uploadAsset } from './assets'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Upload lifecycle (S01 #170, S02 #171) against local Supabase: the browser
 * helper reserves, PUTs to the real signed URL and finalizes through the
 * real handler. Run with `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {}
const env =
  processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const IMAGE_PATH = '$.panels.front.layers[1].assetId'

describe.skipIf(!env)('FLP asset uploads against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account

  /** Routes `/api/flp/*` to the handler; signed storage URLs go to Supabase. */
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input)

    return url.startsWith('/api/flp/')
      ? handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${url}`, init) })
      : fetch(input, init)
  }

  function signIn({ account }: { account: Account }) {
    useSessionStore.setState({
      status: 'signed-in',
      account: { userId: account.id, email: null },
      accessToken: account.token,
      accountEpoch: useSessionStore.getState().accountEpoch + 1,
    })
  }

  function api({
    path,
    method = 'GET',
    token,
    body,
  }: {
    path: string
    method?: 'GET' | 'POST'
    token: string
    body?: unknown
  }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  function createDesign({ token, assetId }: { token: string; assetId: string }) {
    return api({
      path: 'designs',
      method: 'POST',
      token,
      body: {
        mutationKey: crypto.randomUUID(),
        content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId }),
      },
    })
  }

  async function upload({ bytes, type }: { bytes: Uint8Array; type: string }) {
    return uploadAsset({ file: new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), fetchImpl })
  }

  async function storedNames({ account }: { account: Account }) {
    const { data } = await admin.storage.from('design-assets').list(account.id, { limit: 100 })
    const names: string[] = []

    for (const folder of data ?? []) {
      const { data: files } = await admin.storage
        .from('design-assets')
        .list(`${account.id}/${folder.name}`)
      names.push(...(files ?? []).map((file) => `${folder.name}/${file.name}`))
    }

    return names.sort()
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    a = await createAccount({ admin, env: serverEnv, label: 'asset-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'asset-b' })
    signIn({ account: a })
  })

  afterAll(async () => {
    for (const account of [a, b]) {
      if (account) {
        const names = await storedNames({ account })
        await admin.storage.from('design-assets').remove(names.map((name) => `${account.id}/${name}`))
        await admin.auth.admin.deleteUser(account.id)
      }
    }
  })

  test('reserve → upload → finalize → save, with metadata stripped and only normalized bytes kept', async () => {
    const png = await rgbaPng({
      width: 3,
      height: 2,
      alpha: 0,
      extra: [pngChunk({ type: 'tEXt', data: ascii('Location\0Home 51.5074N') })],
    })
    const uploaded = await upload({ bytes: png, type: 'image/png' })

    if (!uploaded.ok) {
      throw new Error(`upload failed: ${uploaded.code} ${uploaded.message}`)
    }

    expect(uploaded.data).toMatchObject({ mimeType: 'image/png', width: 3, height: 2 })
    const served = new Uint8Array(await (await fetch(uploaded.data.readUrl)).arrayBuffer())
    expect(includesBytes({ haystack: served, needle: ascii('51.5074') })).toBe(false)

    const { data: row } = await admin
      .from('assets')
      .select('owner_id, status, byte_size, sha256, storage_path')
      .eq('id', uploaded.data.assetId)
      .single()
    expect(row).toMatchObject({
      owner_id: a.id,
      status: 'ready',
      byte_size: served.length,
      sha256: await sha256Hex({ bytes: served }),
      storage_path: `${a.id}/${uploaded.data.assetId}/normalized`,
    })
    expect(await storedNames({ account: a })).toContain(`${uploaded.data.assetId}/normalized`)
    expect(await storedNames({ account: a })).not.toContain(`${uploaded.data.assetId}/original`)

    const created = await createDesign({ token: a.token, assetId: uploaded.data.assetId })
    expect(created.status).toBe(201)
    const { designId } = (await created.json()) as { designId: string }
    const saved = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: {
        baseSeq: 1,
        mutationKey: crypto.randomUUID(),
        kind: 'autosave',
        content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId: uploaded.data.assetId }),
      },
    })
    expect(saved.status).toBe(201)

    // Finalize is idempotent; status reads hand back a fresh signed URL.
    const again = await api({ path: `assets/${uploaded.data.assetId}/finalize`, method: 'POST', token: a.token })
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ status: 'ready', sha256: row?.sha256 })
    const status = await assetReadUrl({ assetId: uploaded.data.assetId, fetchImpl })
    expect(status).toMatchObject({ ok: true, data: { assetId: uploaded.data.assetId, width: 3 } })
  })

  test('a JPEG with GPS EXIF is stored without it', async () => {
    const jpeg = withJpegSegments({ jpeg: TINY_JPEG, segments: [gpsExifSegment()] })
    const uploaded = await upload({ bytes: jpeg, type: 'image/jpeg' })

    if (!uploaded.ok) {
      throw new Error(`upload failed: ${uploaded.code} ${uploaded.message}`)
    }

    const served = new Uint8Array(await (await fetch(uploaded.data.readUrl)).arrayBuffer())
    expect(includesBytes({ haystack: served, needle: ascii('51.5074') })).toBe(false)
    expect(uploaded.data).toMatchObject({ mimeType: 'image/jpeg', width: 4, height: 6 })
  })

  test('another owner cannot read, finalize or save with an asset', async () => {
    const uploaded = await upload({ bytes: await rgbaPng({ width: 1, height: 1 }), type: 'image/png' })

    if (!uploaded.ok) {
      throw new Error('upload failed')
    }

    const { assetId } = uploaded.data
    const read = await api({ path: `assets/${assetId}`, token: b.token })
    const finalize = await api({ path: `assets/${assetId}/finalize`, method: 'POST', token: b.token })
    const missing = await api({ path: 'assets/asset_doesnotexist0000', token: b.token })
    const save = await createDesign({ token: b.token, assetId })

    expect(read.status).toBe(404)
    expect(await read.json()).toEqual(await missing.json())
    expect(finalize.status).toBe(404)
    expect(save.status).toBe(422)
    expect(await save.json()).toMatchObject({ error: { code: 'invalid', issues: [{ path: IMAGE_PATH }] } })

    const signed = await b.client.storage
      .from('design-assets')
      .createSignedUrl(`${a.id}/${assetId}/normalized`, 60)
    expect(signed.data).toBeNull()
  })

  test('an unfinalized asset blocks save until it is ready', async () => {
    const reserved = await api({ path: 'assets', method: 'POST', token: a.token })
    expect(reserved.status).toBe(201)
    const { assetId, upload: target } = (await reserved.json()) as {
      assetId: string
      upload: { url: string }
    }

    const blocked = await createDesign({ token: a.token, assetId })
    expect(blocked.status).toBe(422)
    expect(await blocked.json()).toMatchObject({ error: { issues: [{ path: IMAGE_PATH }] } })

    const early = await api({ path: `assets/${assetId}/finalize`, method: 'POST', token: a.token })
    expect(early.status).toBe(409)
    expect(await (await api({ path: `assets/${assetId}`, token: a.token })).json()).toEqual({
      assetId,
      status: 'staged',
    })

    // Retrying after the interrupted upload completes the same asset.
    const put = await fetch(target.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Blob([(await rgbaPng({ width: 2, height: 2 })) as Uint8Array<ArrayBuffer>]),
    })
    expect(put.ok).toBe(true)
    expect((await api({ path: `assets/${assetId}/finalize`, method: 'POST', token: a.token })).status).toBe(200)
    expect((await createDesign({ token: a.token, assetId })).status).toBe(201)
  })

  test('a spoofed upload is rejected with a reason, its original removed, and it cannot be saved', async () => {
    const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const uploaded = await upload({ bytes: svg, type: 'image/png' })

    expect(uploaded).toMatchObject({ ok: false, code: 'invalid', reason: 'unsupported_type' })

    const { data: rows } = await admin
      .from('assets')
      .select('id, status, rejection_reason')
      .eq('owner_id', a.id)
      .eq('status', 'rejected')
    expect(rows).toHaveLength(1)
    const rejectedId = rows?.[0]?.id as string
    expect(await storedNames({ account: a })).not.toContain(`${rejectedId}/original`)

    const retry = await api({ path: `assets/${rejectedId}/finalize`, method: 'POST', token: a.token })
    expect(retry.status).toBe(422)
    expect(await retry.json()).toMatchObject({ error: { reason: 'unsupported_type' } })
    expect((await createDesign({ token: a.token, assetId: rejectedId })).status).toBe(422)
  })

  test('library graphics need no asset row; their ids are not asset routes', async () => {
    expect((await createDesign({ token: a.token, assetId: 'asset_lib_crest' })).status).toBe(201)
    expect((await api({ path: 'assets/asset_lib_crest', token: a.token })).status).toBe(404)
  })

  test('owners cannot settle or plant assets through Supabase directly', async () => {
    const insert = await a.client.from('assets').insert({ id: 'asset_planted_by_owner', owner_id: a.id, status: 'ready' })
    const upload = await a.client.storage
      .from('design-assets')
      .upload(`${a.id}/asset_planted_by_owner/normalized`, new Blob([new Uint8Array([1])]), { contentType: 'image/png' })

    expect(insert.error?.code).toBe('42501')
    expect(upload.error).not.toBeNull()
  })
})
