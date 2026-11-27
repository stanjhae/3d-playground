import type { SupabaseClient } from '@supabase/supabase-js'

import { sha256Hex } from '../canonical-hash.ts'
import { MESH_MAX_BYTES, readMeshHeader } from '../pattern/mesh-codec.ts'
import { apiError, apiErrorFromDatabase } from './contract.ts'

/**
 * Draped pattern meshes (Workflow 1), one per owner, pattern hash and
 * solver version (`pattern_meshes`):
 *
 * - `GET /pattern-meshes?hash=&solver=`: a signed read URL once ready.
 * - `POST /pattern-meshes` `{ patternHash, solverVersion }`: the ready mesh
 *   if one exists, else a pending row and a signed upload URL.
 * - `POST /pattern-meshes/finalize` (same body): the upload is checked (an
 *   FLPM file naming this pattern and solver, within size) and turns ready,
 *   or is removed.
 *
 * Rows are read as the user (RLS) and written with the service role.
 */
const BUCKET = 'design-assets'
const READ_URL_SECONDS = 600
const HASH = /^sha256:[0-9a-f]{64}$/

export type PatternMeshResponse =
  | { status: 'ready'; url: string }
  | { status: 'pending'; upload: { url: string; method: 'PUT'; maxBytes: number } }

type Respond = (response: { status: number; body?: unknown }) => Response

type MeshKey = { patternHash: string; solverVersion: number }

export function parseMeshKey(value: unknown): MeshKey | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const { patternHash, solverVersion } = value as Record<string, unknown>

  if (typeof patternHash !== 'string' || !HASH.test(patternHash)) {
    return null
  }

  if (typeof solverVersion !== 'number' || !Number.isInteger(solverVersion) || solverVersion < 1 || solverVersion > 999) {
    return null
  }

  return { patternHash, solverVersion }
}

export function meshPath({ userId, key }: { userId: string; key: MeshKey }) {
  return `${userId}/meshes/${key.patternHash.slice('sha256:'.length)}-s${key.solverVersion}.flpm`
}

function refusal(respond: Respond, message: string, status: 'invalid' | 'not_found' = 'invalid') {
  const error = apiError({ code: status, message })
  return respond({ status: error.status, body: error.body })
}

async function readUrl({ admin, path }: { admin: SupabaseClient; path: string }) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, READ_URL_SECONDS)
  return error || !data ? null : data.signedUrl
}

type Row = { status: 'pending' | 'ready'; storage_path: string }

async function findRow({ client, userId, key }: { client: SupabaseClient; userId: string; key: MeshKey }) {
  const { data, error } = await client
    .from('pattern_meshes')
    .select('status, storage_path')
    .eq('owner_id', userId)
    .eq('pattern_hash', key.patternHash)
    .eq('solver_version', key.solverVersion)
    .maybeSingle<Row>()
  return { row: data, error }
}

export async function handlePatternMeshes({
  request,
  body,
  admin,
  asUser,
  userId,
  action,
  respond,
}: {
  request: Request
  /** The parsed JSON body for a POST. */
  body?: unknown
  admin: SupabaseClient
  asUser: SupabaseClient
  userId: string
  action: string | undefined
  respond: Respond
}): Promise<Response> {
  const internal = () => respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })

  if (request.method === 'GET' && !action) {
    const search = new URL(request.url).searchParams
    const key = parseMeshKey({ patternHash: search.get('hash'), solverVersion: Number(search.get('solver')) })

    if (!key) {
      return refusal(respond, 'Name a pattern hash and solver version')
    }

    const { row, error } = await findRow({ client: asUser, userId, key })

    if (error) {
      return internal()
    }

    if (row?.status !== 'ready') {
      return refusal(respond, 'No draped mesh for this pattern yet', 'not_found')
    }

    const url = await readUrl({ admin, path: row.storage_path })
    return url ? respond({ status: 200, body: { status: 'ready', url } satisfies PatternMeshResponse }) : internal()
  }

  if (request.method !== 'POST' || (action && action !== 'finalize')) {
    return respond({ status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' } } })
  }

  const key = parseMeshKey(body)

  if (!key) {
    return refusal(respond, 'Name a pattern hash and solver version')
  }

  const path = meshPath({ userId, key })
  const found = await findRow({ client: asUser, userId, key })

  if (found.error) {
    return internal()
  }

  // POST /pattern-meshes: reuse a ready mesh, else reserve an upload.
  if (!action) {
    if (found.row?.status === 'ready') {
      const url = await readUrl({ admin, path: found.row.storage_path })
      return url ? respond({ status: 200, body: { status: 'ready', url } satisfies PatternMeshResponse }) : internal()
    }

    if (!found.row) {
      const { error } = await admin
        .from('pattern_meshes')
        .insert({ owner_id: userId, pattern_hash: key.patternHash, solver_version: key.solverVersion, storage_path: path })

      // A second tab reserving the same mesh at once is fine.
      if (error && error.code !== '23505') {
        const mapped = apiErrorFromDatabase({ code: error.code, message: error.message, details: error.details })
        return mapped ? respond({ status: mapped.status, body: mapped.body }) : internal()
      }
    }

    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })

    if (error || !data) {
      console.error('flp mesh upload sign failed', { message: error?.message })
      return internal()
    }

    const reserved: PatternMeshResponse = { status: 'pending', upload: { url: data.signedUrl, method: 'PUT', maxBytes: MESH_MAX_BYTES } }
    return respond({ status: 201, body: reserved })
  }

  // POST /pattern-meshes/finalize: check the upload before it counts.
  if (!found.row) {
    return refusal(respond, 'No mesh upload was reserved for this pattern', 'not_found')
  }

  if (found.row.status === 'ready') {
    const url = await readUrl({ admin, path: found.row.storage_path })
    return url ? respond({ status: 200, body: { status: 'ready', url } satisfies PatternMeshResponse }) : internal()
  }

  const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(path)

  if (downloadError || !file) {
    return refusal(respond, 'The mesh hasn’t been uploaded yet')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = readMeshHeader(bytes)
  const matches = header.ok && header.header.patternHash === key.patternHash && header.header.solverVersion === key.solverVersion

  if (!matches || bytes.length > MESH_MAX_BYTES) {
    await admin.storage.from(BUCKET).remove([path])
    return refusal(respond, 'That file isn’t a draped mesh of this pattern')
  }

  const sha256 = await sha256Hex({ bytes })
  const { error: updateError } = await admin
    .from('pattern_meshes')
    .update({ status: 'ready', sha256, byte_size: bytes.length })
    .eq('owner_id', userId)
    .eq('pattern_hash', key.patternHash)
    .eq('solver_version', key.solverVersion)

  if (updateError) {
    console.error('flp mesh finalize failed', { code: updateError.code })
    return internal()
  }

  const url = await readUrl({ admin, path })
  return url ? respond({ status: 200, body: { status: 'ready', url } satisfies PatternMeshResponse }) : internal()
}

/** Whether `owner` has a ready mesh for this pattern (the publish gate). */
export async function hasReadyMesh({ client, userId, key }: { client: SupabaseClient; userId: string; key: MeshKey }) {
  const { row, error } = await findRow({ client, userId, key })

  if (error) {
    throw new Error('Mesh lookup failed')
  }

  return row?.status === 'ready'
}
