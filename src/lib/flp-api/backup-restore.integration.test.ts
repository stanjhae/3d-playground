import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  type BackupManifest,
  type RestoreIssue,
  type RestoreResult,
  findDbContainer,
  makeBackupDir,
  readManifest,
  removeBackupDir,
  runBackup,
  runRestoreCheck,
  writeBackupObject,
  writeManifest,
} from '../../../scripts/backup-lib.mjs'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG, rgbaPng } from '../image-fixtures'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Backup → restore round trip (Q09 #194) against local Supabase: one
 * published design with a private upload, one revoked, one deleted before
 * the backup. Other suites may write while this runs, so assertions are
 * scoped to the fixture. Run with `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const ROUND_TRIP_TIMEOUT = 180_000

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

describe.skipIf(!env)('backup and restore against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let account: Account
  let container: string
  let backupDir: string
  let manifest: BackupManifest
  let result: RestoreResult
  const fixture = { published: '', revoked: '', deleted: '', publishedSlug: '', revokedSlug: '', assetId: '' }

  async function api({ path, method = 'GET', body }: { path: string; method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }) {
    const response = await handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${account.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
    return response.status === 204 ? null : ((await response.json()) as Record<string, unknown>)
  }

  async function createDesign({ title, assetId }: { title: string; assetId: string }) {
    const created = await api({
      path: 'designs',
      method: 'POST',
      body: { mutationKey: crypto.randomUUID(), title, content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId }) },
    })
    return created!.designId as string
  }

  async function publish({ designId }: { designId: string }) {
    await api({ path: `designs/${designId}/renders`, method: 'POST', body: { seq: 1, renders: RENDERS } })
    const published = await api({ path: `designs/${designId}/publication`, method: 'POST', body: { seq: 1 } })
    return published!.slug as string
  }

  const fixtureIssues = (issues: RestoreIssue[]) =>
    issues.filter(
      (found) =>
        [fixture.published, fixture.revoked, fixture.deleted].includes(found.designId ?? '') ||
        [fixture.publishedSlug, fixture.revokedSlug].includes(found.slug ?? ''),
    )

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    container = await findDbContainer()
    account = await createAccount({ admin, env: serverEnv, label: 'backup' })

    // A private upload: reserve, PUT to the signed URL, finalize.
    const reserved = await api({ path: 'assets', method: 'POST' })
    fixture.assetId = reserved!.assetId as string
    const put = await fetch((reserved!.upload as { url: string }).url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Blob([(await rgbaPng({ width: 2, height: 2 })) as Uint8Array<ArrayBuffer>]),
    })
    expect(put.ok).toBe(true)
    await api({ path: `assets/${fixture.assetId}/finalize`, method: 'POST' })

    fixture.published = await createDesign({ title: 'Backed-up tee', assetId: fixture.assetId })
    fixture.publishedSlug = await publish({ designId: fixture.published })

    fixture.revoked = await createDesign({ title: 'Revoked tee', assetId: 'asset_lib_cross-simple' })
    fixture.revokedSlug = await publish({ designId: fixture.revoked })
    await api({ path: `designs/${fixture.revoked}/publication`, method: 'DELETE' })

    fixture.deleted = await createDesign({ title: 'Deleted tee', assetId: 'asset_lib_cross-simple' })
    await publish({ designId: fixture.deleted })
    await api({ path: `designs/${fixture.deleted}`, method: 'DELETE' })

    backupDir = await makeBackupDir()
    manifest = await runBackup({ admin, container, outDir: backupDir })
    result = await runRestoreCheck({ admin, container, backupDir })
  }, ROUND_TRIP_TIMEOUT)

  afterAll(async () => {
    if (backupDir) await removeBackupDir(backupDir)
    if (account) await admin.auth.admin.deleteUser(account.id)
  })

  test('the backup holds the private upload and published renders, with their hashes', () => {
    const paths = new Map(manifest.storage.objects.map((object) => [object.path, object]))

    expect(paths.get(`${account.id}/${fixture.assetId}/normalized`)?.size).toBeGreaterThan(0)
    for (const kind of PUBLIC_RENDER_KINDS) {
      expect(paths.get(`${account.id}/${fixture.published}/v1/${kind}.jpg`)?.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(manifest.expected.designIds).not.toContain(fixture.deleted)
  })

  test('restored: content and renders verified, revoked stays revoked, the deleted design stays gone', () => {
    expect(fixtureIssues(result.issues)).toEqual([])
    expect(result.restored.designIds.has(fixture.published)).toBe(true)
    expect(result.restored.designIds.has(fixture.revoked)).toBe(true)
    expect(result.restored.designIds.has(fixture.deleted)).toBe(false)
    expect(result.restored.publications.get(fixture.publishedSlug)).toMatchObject({ status: 'published', seq: 1 })
    expect(result.restored.publications.get(fixture.revokedSlug)).toMatchObject({ status: 'revoked', seq: null })
    expect(
      result.verified.renders.filter((render) => render.slug === fixture.publishedSlug).map((render) => render.kind).sort(),
    ).toEqual([...PUBLIC_RENDER_KINDS].sort())
    expect(result.restoreBucket).toMatch(/^flp-restore-/)
    expect(result.phases.map((phase) => phase.name)).toEqual([
      'backup integrity',
      'create database',
      'restore database',
      'restore storage',
      'verify',
      'cleanup',
    ])
  })

  test('the restore copy is dropped: no flp_restore database, no restore bucket', async () => {
    const { data: buckets } = await admin.storage.listBuckets()

    expect((buckets ?? []).map((bucket) => bucket.id)).not.toContain(result.restoreBucket)
    const { data: live } = await admin.from('designs').select('id').eq('id', fixture.published)
    expect(live).toHaveLength(1)
  })

  test(
    'a render whose bytes no longer match, and a design not in the backup, are both reported',
    async () => {
      const tampered = await readManifest(backupDir)
      const front = tampered.storage.objects.find(
        (object) => object.path === `${account.id}/${fixture.published}/v1/view_front.jpg`,
      )!
      Object.assign(
        front,
        await writeBackupObject({ dir: backupDir, bucket: front.bucket, name: front.path, bytes: new Uint8Array([1, 2, 3]) }),
      )
      tampered.expected.designIds = tampered.expected.designIds.filter((id) => id !== fixture.revoked)
      await writeManifest(backupDir, tampered)

      const checked = await runRestoreCheck({ admin, container, backupDir, upload: false })

      expect(fixtureIssues(checked.issues)).toEqual([
        expect.objectContaining({ check: 'b', slug: fixture.publishedSlug, message: expect.stringContaining('view_front') }),
        expect.objectContaining({ check: 'd', designId: fixture.revoked }),
      ])
    },
    ROUND_TRIP_TIMEOUT,
  )
})
