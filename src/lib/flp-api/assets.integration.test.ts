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
import { listFilesUnder } from './delete-account-runner.mjs'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'
import { handleSharePage } from './share-page'

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

  test('a published design with a real upload exposes no source file', async () => {
    // Uploads are rate limited per account, so this one has its own.
    const owner = await createAccount({ admin, env: serverEnv, label: 'asset-publish' })
    signIn({ account: owner })
    const uploaded = await upload({ bytes: await rgbaPng({ width: 4, height: 4, alpha: 255 }), type: 'image/png' })

    if (!uploaded.ok) {
      throw new Error(`upload failed: ${uploaded.code} ${uploaded.message}`)
    }

    const { assetId } = uploaded.data
    const { designId } = (await (await createDesign({ token: owner.token, assetId })).json()) as { designId: string }
    const data = btoa(String.fromCharCode(...TINY_JPEG))
    const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data }))
    expect((await api({ path: `designs/${designId}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders } })).status).toBe(201)
    const published = await api({ path: `designs/${designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
    const { slug } = (await published.json()) as { slug: string }
    const { data: row } = await admin.from('assets').select('storage_path, sha256').eq('id', assetId).single()
    const signedOut = (path: string) => handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost/api/flp/${path}`) })

    const payload = await (await signedOut(`public/${slug}`)).text()
    const page = await (
      await handleSharePage({
        env: serverEnv,
        request: new Request(`http://localhost/s/${slug}`),
        loadShell: async () => '<html><head></head><body><div id="root"></div></body></html>',
      })
    ).text()

    for (const [name, text] of [['payload', payload], ['page', page]] as const) {
      for (const secret of [assetId, row!.storage_path as string, owner.id, designId, 'normalized', 'token=', serverEnv.url]) {
        expect(text, `${name} has ${secret}`).not.toContain(secret)
      }
    }

    // What's served is the published picture, never the upload.
    for (const kind of PUBLIC_RENDER_KINDS) {
      const served = await signedOut(`public/${slug}/image?view=${kind}`)
      expect(served.status, kind).toBe(200)
      const bytes = new Uint8Array(await served.arrayBuffer())
      expect(await sha256Hex({ bytes }), kind).not.toBe(row!.sha256)
      expect(served.headers.get('Content-Type'), kind).toBe('image/jpeg')
    }

    for (const view of ['normalized', 'original', assetId, row!.storage_path as string]) {
      expect((await signedOut(`public/${slug}/image?view=${encodeURIComponent(view)}`)).status, view).toBe(404)
    }

    // Nor can a visitor go round the API.
    const visitor = createClient(serverEnv.url, serverEnv.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const bucket = visitor.storage.from('design-assets')
    expect((await bucket.download(row!.storage_path as string)).error).not.toBeNull()
    expect((await bucket.createSignedUrl(row!.storage_path as string, 60)).error).not.toBeNull()
    expect((await fetch(bucket.getPublicUrl(row!.storage_path as string).data.publicUrl)).ok).toBe(false)
    expect((await visitor.from('assets').select('id').eq('id', assetId)).data ?? []).toEqual([])

    signIn({ account: a })
    const files = await listFilesUnder({ admin, prefix: owner.id })
    await admin.storage.from('design-assets').remove(files)
    await admin.auth.admin.deleteUser(owner.id)
  })

  test('an upload only an old version references is not collected; one nothing references is', async () => {
    signIn({ account: a })
    const stored = async () => {
      const uploaded = await upload({ bytes: await rgbaPng({ width: 2, height: 3, alpha: 255 }), type: 'image/png' })

      if (!uploaded.ok) {
        throw new Error(`upload failed: ${uploaded.code} ${uploaded.message}`)
      }

      return uploaded.data.assetId
    }
    // No grace window, as if the 24 hours the cleanup script allows had passed.
    const orphans = async ({ grace = '0 seconds' }: { grace?: string } = {}) => {
      const { data, error } = await admin.rpc('flp_orphan_assets', { p_grace: grace })
      expect(error).toBeNull()
      return (data as Array<{ id: string }>).map((row) => row.id)
    }

    const inHistory = await stored()
    const unplaced = await stored()
    const created = await createDesign({ token: a.token, assetId: inHistory })
    const { designId } = (await created.json()) as { designId: string }
    const replaced = await api({
      path: `designs/${designId}/versions`,
      method: 'POST',
      token: a.token,
      body: {
        baseSeq: 1,
        mutationKey: crypto.randomUUID(),
        kind: 'autosave',
        content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' }),
      },
    })
    expect(replaced.status).toBe(201)

    const listed = await orphans()
    expect(listed).toContain(unplaced)
    expect(listed).not.toContain(inHistory)
    // Within the grace window, a staged upload is left alone.
    expect(await orphans({ grace: '24 hours' })).not.toContain(unplaced)

    // Once no version refers to it, the same upload is collectable.
    const deleted = await handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/designs/${designId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${a.token}` },
      }),
    })
    expect(deleted.status).toBe(204)
    expect(await orphans()).toContain(inHistory)
  })

  test("B's real token can't change or delete A's rows or files directly", async () => {
    signIn({ account: a })
    const uploaded = await upload({ bytes: await rgbaPng({ width: 2, height: 2, alpha: 255 }), type: 'image/png' })

    if (!uploaded.ok) {
      throw new Error(`upload failed: ${uploaded.code} ${uploaded.message}`)
    }

    const created = await createDesign({ token: a.token, assetId: uploaded.data.assetId })
    const { designId } = (await created.json()) as { designId: string }
    const data = btoa(String.fromCharCode(...TINY_JPEG))
    const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data }))
    expect((await api({ path: `designs/${designId}/renders`, method: 'POST', token: a.token, body: { seq: 1, renders } })).status).toBe(201)
    expect((await api({ path: `designs/${designId}/publication`, method: 'POST', token: a.token, body: { seq: 1, displayName: 'Owner' } })).status).toBe(200)
    expect((await api({ path: 'profile', method: 'POST', token: a.token, body: { displayName: 'Owner' } })).status).toBeLessThan(300)

    const { data: assetRow } = await admin.from('assets').select('storage_path').eq('id', uploaded.data.assetId).single()
    const { data: renderRow } = await admin.from('render_artifacts').select('storage_path').eq('design_id', designId).limit(1).single()
    const paths = [assetRow!.storage_path as string, renderRow!.storage_path as string]

    const TABLES = {
      designs: { filter: ['id', designId], change: { title: 'Taken' } },
      design_versions: { filter: ['design_id', designId], change: { label: 'Taken' } },
      publications: { filter: ['design_id', designId], change: { status: 'revoked' } },
      render_artifacts: { filter: ['design_id', designId], change: { status: 'failed' } },
      assets: { filter: ['id', uploaded.data.assetId], change: { status: 'rejected' } },
      profiles: { filter: ['owner_id', a.id], change: { display_name: 'Taken' } },
    } as const
    const rows = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.entries(TABLES).map(async ([table, { filter }]) => {
            const { data: found } = await admin.from(table).select('*').eq(filter[0], filter[1])
            return [table, found] as const
          }),
        ),
      )
    const bytes = async () =>
      Promise.all(
        paths.map(async (path) => {
          const { data: file } = await admin.storage.from('design-assets').download(path)
          return btoa(String.fromCharCode(...new Uint8Array(await file!.arrayBuffer())))
        }),
      )
    const rowsBefore = await rows()
    const bytesBefore = await bytes()

    for (const [table, value] of Object.entries(rowsBefore)) {
      expect(value, table).toHaveLength(table === 'design_versions' ? 1 : table === 'render_artifacts' ? PUBLIC_RENDER_KINDS.length : 1)
    }

    for (const [table, { filter, change }] of Object.entries(TABLES)) {
      const updated = await b.client.from(table).update(change).eq(filter[0], filter[1]).select()
      expect(updated.error?.code, `update ${table}`).toBe('42501')
      const deleted = await b.client.from(table).delete().eq(filter[0], filter[1]).select()
      expect(deleted.error?.code, `delete ${table}`).toBe('42501')
    }

    const inserted = await b.client.from('designs').insert({ owner_id: a.id, title: 'Planted' })
    expect(inserted.error?.code).toBe('42501')
    const revoked = await b.client.rpc('flp_revoke_publication', { p_owner_id: a.id, p_design_id: designId })
    expect(revoked.error?.code).toBe('42501')

    const bucket = b.client.storage.from('design-assets')
    const replacement = new Blob([TINY_JPEG as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })

    for (const path of paths) {
      // Storage answers a delete it may not do with an empty list.
      expect((await bucket.remove([path])).data ?? [], `remove ${path}`).toEqual([])
      expect((await bucket.update(path, replacement)).error, `update ${path}`).not.toBeNull()
      expect((await bucket.upload(path, replacement, { upsert: true })).error, `upsert ${path}`).not.toBeNull()
      expect((await bucket.move(path, `${b.id}/taken/${crypto.randomUUID()}`)).error, `move ${path}`).not.toBeNull()
      expect((await bucket.copy(path, `${b.id}/taken/${crypto.randomUUID()}`)).error, `copy ${path}`).not.toBeNull()
      expect((await bucket.download(path)).error, `download ${path}`).not.toBeNull()
      expect((await bucket.createSignedUrl(path, 60)).error, `sign ${path}`).not.toBeNull()
    }

    expect((await bucket.upload(`${a.id}/planted/${crypto.randomUUID()}`, replacement)).error).not.toBeNull()

    expect(await rows()).toEqual(rowsBefore)
    expect(await bytes()).toEqual(bytesBefore)
    expect(await storedNames({ account: b })).toEqual([])
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
    expect((await createDesign({ token: a.token, assetId: 'asset_lib_cross-simple' })).status).toBe(201)
    expect((await api({ path: 'assets/asset_lib_cross-simple', token: a.token })).status).toBe(404)
  })

  test('a library id that names no shipped graphic is refused with its path', async () => {
    const response = await createDesign({ token: a.token, assetId: 'asset_lib_not-a-graphic' })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { issues: [{ path: '$.panels.front.layers[1].assetId', message: 'not a library graphic' }] },
    })
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
