import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from '../canonical-document'
import { type DrapeMessage, runDrapeJob } from '../cloth/drape-job'
import { SOLVER_VERSION } from '../cloth/solver'
import { TINY_JPEG } from '../image-fixtures'
import { encodeMesh } from '../pattern/mesh-codec'
import { hashPattern } from '../pattern/pattern-hash'
import { patternTemplateFor } from '../pattern/templates'
import { listFilesUnder } from './delete-account-runner.mjs'
import { type Account, createAccount } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Draped pattern meshes against a real local Supabase (Workflow 1):
 * reserve, upload, check and read; strangers; a forged file; and the
 * publish gate. Opt-in like the other suites: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

describe.skipIf(!env)('pattern meshes against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account
  const pattern = patternTemplateFor({ templateId: 'tee-crew-short', templateVersion: 4 })!.pattern
  let patternHash = ''
  let meshBytes: Uint8Array = new Uint8Array()

  function api({ path, method = 'GET', token, body }: { path: string; method?: 'GET' | 'POST'; token?: string; body?: unknown }) {
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

  async function reserveAndUpload({ token, bytes }: { token: string; bytes: Uint8Array }) {
    const reserved = await api({ path: 'pattern-meshes', method: 'POST', token, body: { patternHash, solverVersion: SOLVER_VERSION } })
    const body = (await reserved.json()) as { status: string; upload?: { url: string } }

    if (body.upload) {
      const put = await fetch(body.upload.url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes as BodyInit })
      expect(put.ok).toBe(true)
    }

    return { status: reserved.status, body }
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    a = await createAccount({ admin, env: serverEnv, label: 'mesh-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'mesh-b' })
    patternHash = await hashPattern({ pattern })
    const messages: DrapeMessage[] = []
    runDrapeJob({ type: 'drape', job: 1, pattern }, (message) => messages.push(message))
    const done = messages.at(-1)!

    if (done.type !== 'done') {
      throw new Error('drape failed')
    }

    meshBytes = encodeMesh({ mesh: done.mesh, patternHash })
  }, 30_000)

  afterAll(async () => {
    for (const account of [a, b]) {
      if (account) {
        const files = await listFilesUnder({ admin, prefix: account.id })
        if (files.length > 0) await admin.storage.from('design-assets').remove(files)
        await admin.auth.admin.deleteUser(account.id)
      }
    }
  })

  test('nothing is stored until a mesh is uploaded and checked', async () => {
    const missing = await api({ path: `pattern-meshes?hash=${patternHash}&solver=${SOLVER_VERSION}`, token: a.token })
    expect(missing.status).toBe(404)

    const early = await api({ path: 'pattern-meshes/finalize', method: 'POST', token: a.token, body: { patternHash, solverVersion: SOLVER_VERSION } })
    expect(early.status).toBe(404)
  })

  test('a forged file is refused and removed', async () => {
    const { status } = await reserveAndUpload({ token: a.token, bytes: TINY_JPEG })
    expect(status).toBe(201)

    const finalized = await api({ path: 'pattern-meshes/finalize', method: 'POST', token: a.token, body: { patternHash, solverVersion: SOLVER_VERSION } })
    expect(finalized.status).toBe(422)
    expect(await listFilesUnder({ admin, prefix: `${a.id}/meshes` })).toEqual([])
  })

  test('a real drape is stored, read back, and reused rather than uploaded again', async () => {
    const reserved = await reserveAndUpload({ token: a.token, bytes: meshBytes })
    expect(reserved.status).toBe(201)

    const finalized = await api({ path: 'pattern-meshes/finalize', method: 'POST', token: a.token, body: { patternHash, solverVersion: SOLVER_VERSION } })
    expect(finalized.status).toBe(200)
    const ready = (await finalized.json()) as { status: string; url: string }
    expect(ready.status).toBe('ready')

    const download = await fetch(ready.url)
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(meshBytes)

    const again = await api({ path: 'pattern-meshes', method: 'POST', token: a.token, body: { patternHash, solverVersion: SOLVER_VERSION } })
    expect(again.status).toBe(200)
    expect(((await again.json()) as { status: string }).status).toBe('ready')

    const read = await api({ path: `pattern-meshes?hash=${patternHash}&solver=${SOLVER_VERSION}`, token: a.token })
    expect(read.status).toBe(200)
  })

  test("another account can't read someone's mesh", async () => {
    const read = await api({ path: `pattern-meshes?hash=${patternHash}&solver=${SOLVER_VERSION}`, token: b.token })
    expect(read.status).toBe(404)
  })

  test('bad keys are refused', async () => {
    const bad = await api({ path: 'pattern-meshes', method: 'POST', token: a.token, body: { patternHash: 'nope', solverVersion: 1 } })
    expect(bad.status).toBe(422)
    const unknown = await api({ path: 'pattern-meshes/other', method: 'POST', token: a.token, body: {} })
    expect(unknown.status).toBe(404)
  })

  test('a design with a pattern publishes only once its mesh is stored', async () => {
    const document = { ...createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 4 }), pattern }
    const created = await api({ path: 'designs', method: 'POST', token: b.token, body: { mutationKey: crypto.randomUUID(), title: 'Draped', content: document } })
    expect(created.status).toBe(201)
    const { designId } = (await created.json()) as { designId: string }
    const renders = await api({ path: `designs/${designId}/renders`, method: 'POST', token: b.token, body: { seq: 1, renders: RENDERS } })
    expect(renders.ok).toBe(true)

    const refused = await api({ path: `designs/${designId}/publication`, method: 'POST', token: b.token, body: { seq: 1 } })
    expect(refused.status).toBe(422)
    expect(((await refused.json()) as { error: { issues: Array<{ path: string }> } }).error.issues).toEqual([{ path: '$.pattern', message: 'no draped mesh' }])

    await reserveAndUpload({ token: b.token, bytes: meshBytes })
    const finalized = await api({ path: 'pattern-meshes/finalize', method: 'POST', token: b.token, body: { patternHash, solverVersion: SOLVER_VERSION } })
    expect(finalized.status).toBe(200)

    const published = await api({ path: `designs/${designId}/publication`, method: 'POST', token: b.token, body: { seq: 1 } })
    expect(published.status).toBe(200)
  }, 30_000)
})
