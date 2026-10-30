import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import type { CanonicalDocument } from '../canonical-document.ts'
import type { ContentHash } from '../canonical-hash.ts'
import {
  IMAGE_LIMITS,
  type ImageMimeType,
  type ImageRejectReason,
  validateImage,
} from '../image-validate.ts'
import {
  type ApiError,
  type AssetReservation,
  type AssetResponse,
  LIBRARY_ASSET_PREFIX,
  MAX_CONTENT_BYTES,
  type VersionDetail,
  type VersionPage,
  type VersionResponse,
  type VersionSummary,
  apiError,
  apiErrorFromDatabase,
  parseCreateDesignRequest,
  parseRestoreVersionRequest,
  parseSaveVersionRequest,
  parseVersionListQuery,
  parseVersionSeq,
  prepareContent,
  unknownLibraryReferences,
  uploadedAssetReferences,
} from './contract.ts'

/**
 * FLP design API (S03 #172) behind `/api/flp/*`. The server is the trust
 * boundary (docs/data-model.md):
 * - the owner comes from a JWT verified with Supabase Auth, never the body;
 * - reads run as that user, so RLS applies even if a filter is wrong;
 * - writes call the service-role `flp_*` functions with re-validated,
 *   re-hashed content;
 * - uploaded images (S01 #170, S02 #171) are validated and normalized here
 *   before a document may reference them.
 */

export type FlpServerEnv = {
  url: string
  publishableKey: string
  secretKey: string
}

type DesignVersionRow = {
  design_id: string
  seq: number
  kind: VersionResponse['kind']
  content_hash: ContentHash
  restored_from_seq: number | null
  created_at: string
}

type VersionSummaryRow = {
  seq: number
  kind: VersionResponse['kind']
  label: string | null
  content_hash: ContentHash
  restored_from_seq: number | null
  created_at: string
}

type AssetRow = {
  id: string
  owner_id: string
  status: 'staged' | 'ready' | 'rejected'
  rejection_reason: ImageRejectReason | null
  mime_type: ImageMimeType | null
  byte_size: number | null
  width: number | null
  height: number | null
  sha256: string | null
  storage_path: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ASSET_ID = /^asset_[A-Za-z0-9_-]{8,64}$/
const MAX_BODY_BYTES = MAX_CONTENT_BYTES * 2
const ASSET_BUCKET = 'design-assets'
const ASSET_COLUMNS =
  'id, owner_id, status, rejection_reason, mime_type, byte_size, width, height, sha256, storage_path'
const READ_URL_SECONDS = 600
const VERSION_SUMMARY_COLUMNS = 'seq, kind, label, content_hash, restored_from_seq, created_at'

export function flpServerEnv(
  source: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
): FlpServerEnv | null {
  const url = source.SUPABASE_URL
  const publishableKey = source.SUPABASE_PUBLISHABLE_KEY
  const secretKey = source.SUPABASE_SECRET_KEY

  return url && publishableKey && secretKey
    ? { url, publishableKey, secretKey }
    : null
}

function json({ status, body }: { status: number; body: unknown }) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function fromError({ error }: { error: ApiError }) {
  return json({ status: error.status, body: error.body })
}

function internalError() {
  return json({
    status: 500,
    body: { error: { code: 'internal', message: 'Something went wrong' } },
  })
}

function versionResponse({ row }: { row: DesignVersionRow }): VersionResponse {
  return {
    designId: row.design_id,
    seq: row.seq,
    kind: row.kind,
    contentHash: row.content_hash,
    restoredFromSeq: row.restored_from_seq,
    createdAt: row.created_at,
  }
}

/** Splits `/api/flp/designs/:id/versions` (or a rewritten `?path=`). */
export function flpRoute({ request }: { request: Request }) {
  const url = new URL(request.url)
  const rewritten = url.searchParams.get('path')
  const path = rewritten ?? url.pathname.replace(/^\/api\/flp\/?/, '')
  return path.split('/').filter(Boolean)
}

async function readJson({ request }: { request: Request }) {
  const length = Number(request.headers.get('content-length') ?? '0')

  if (length > MAX_BODY_BYTES) {
    return { ok: false as const, error: apiError({ code: 'too_large', message: 'Request is too large' }) }
  }

  const text = await request.text()

  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false as const, error: apiError({ code: 'too_large', message: 'Request is too large' }) }
  }

  try {
    return { ok: true as const, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false as const, error: apiError({ code: 'invalid', message: 'Request body is not JSON' }) }
  }
}

async function verifiedUser({
  request,
  admin,
}: {
  request: Request
  admin: SupabaseClient
}) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''

  if (!token) {
    return null
  }

  const { data, error } = await admin.auth.getUser(token)
  return error || !data.user ? null : { userId: data.user.id, token }
}

async function callWrite({
  admin,
  fn,
  args,
  status,
}: {
  admin: SupabaseClient
  fn: string
  args: Record<string, unknown>
  status: number
}) {
  const { data, error } = await admin.rpc(fn, args).single<DesignVersionRow>()

  if (error) {
    const mapped = apiErrorFromDatabase({
      code: error.code,
      message: error.message,
      details: error.details,
    })

    if (mapped) {
      return fromError({ error: mapped })
    }

    console.error('flp write failed', { fn, code: error.code })
    return internalError()
  }

  return json({ status, body: versionResponse({ row: data }) })
}

function assetNotFound() {
  return apiError({ code: 'not_found', message: 'Asset not found' })
}

/**
 * A document may only reference library graphics or the caller's own
 * ready uploads. Read as the user, so another owner's id looks missing.
 */
async function unusableAssets({
  asUser,
  document,
}: {
  asUser: SupabaseClient
  document: CanonicalDocument
}) {
  const unknownLibrary = unknownLibraryReferences({ document }).map(({ path }) => ({
    path,
    message: 'not a library graphic',
  }))
  const references = uploadedAssetReferences({ document })

  if (references.length === 0) {
    return unknownLibrary.length > 0
      ? fromError({
          error: apiError({ code: 'invalid', message: 'Design references unavailable images', issues: unknownLibrary }),
        })
      : null
  }

  const { data, error } = await asUser
    .from('assets')
    .select('id')
    .eq('status', 'ready')
    .in('id', [...new Set(references.map(({ assetId }) => assetId))])

  if (error) {
    console.error('flp asset check failed', { code: error.code })
    return internalError()
  }

  const ready = new Set(data.map((row) => row.id as string))
  const issues = [
    ...unknownLibrary,
    ...references
      .filter(({ assetId }) => !ready.has(assetId))
      .map(({ path }) => ({ path, message: 'asset is not uploaded and ready' })),
  ]

  return issues.length > 0
    ? fromError({ error: apiError({ code: 'invalid', message: 'Design references unavailable images', issues }) })
    : null
}

function newAssetId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  // Hex never spells the `asset_lib_` library prefix.
  return `asset_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

async function assetResponse({
  asUser,
  row,
}: {
  asUser: SupabaseClient
  row: AssetRow
}): Promise<AssetResponse | null> {
  if (row.status === 'staged') {
    return { assetId: row.id, status: 'staged' }
  }

  if (row.status === 'rejected') {
    return { assetId: row.id, status: 'rejected', reason: row.rejection_reason ?? 'corrupt' }
  }

  // Signed as the user, so the bucket's owner-prefix policy applies too.
  const { data, error } = await asUser.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(row.storage_path ?? '', READ_URL_SECONDS)

  if (error || !data) {
    console.error('flp asset sign failed', { message: error?.message })
    return null
  }

  return {
    assetId: row.id,
    status: 'ready',
    mimeType: row.mime_type ?? 'image/png',
    width: row.width ?? 0,
    height: row.height ?? 0,
    byteSize: row.byte_size ?? 0,
    sha256: row.sha256 ?? '',
    readUrl: data.signedUrl,
    readUrlExpiresIn: READ_URL_SECONDS,
  }
}

async function readAsset({ asUser, assetId }: { asUser: SupabaseClient; assetId: string }) {
  const { data, error } = await asUser
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('id', assetId)
    .maybeSingle<AssetRow>()

  if (error) {
    console.error('flp asset read failed', { code: error.code })
    return { ok: false as const }
  }

  return { ok: true as const, row: data }
}

async function settledResponse({
  asUser,
  row,
}: {
  asUser: SupabaseClient
  row: AssetRow
}) {
  if (row.status === 'rejected') {
    const reason = row.rejection_reason ?? 'corrupt'
    return fromError({
      error: apiError({ code: 'invalid', message: 'This image cannot be used', reason }),
    })
  }

  const body = await assetResponse({ asUser, row })
  return body ? json({ status: 200, body }) : internalError()
}

/**
 * Downloads the staged original, validates and normalizes it, stores the
 * normalized bytes and settles the row. Safe to repeat or race: settled
 * rows never change, the normalized object is deterministic, and the
 * transition only applies while the row is still staged.
 */
async function finalizeAsset({
  admin,
  asUser,
  row,
}: {
  admin: SupabaseClient
  asUser: SupabaseClient
  row: AssetRow
}) {
  const bucket = admin.storage.from(ASSET_BUCKET)
  const originalPath = `${row.owner_id}/${row.id}/original`
  const { data: blob, error: downloadError } = await bucket.download(originalPath)

  if (downloadError || !blob) {
    // A racing finalize may have settled the row and removed the original.
    const again = await readAsset({ asUser, assetId: row.id })

    if (again.ok && again.row && again.row.status !== 'staged') {
      return settledResponse({ asUser, row: again.row })
    }

    return fromError({
      error: apiError({ code: 'conflict', message: 'The upload has not been received yet' }),
    })
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const result = await validateImage({ bytes })
  const settle = result.ok
    ? {
        status: 'ready',
        mime_type: result.image.mimeType,
        byte_size: result.image.byteSize,
        width: result.image.width,
        height: result.image.height,
        sha256: result.image.sha256,
        storage_path: `${row.owner_id}/${row.id}/normalized`,
      }
    : { status: 'rejected', rejection_reason: result.reason }

  if (result.ok) {
    const { error } = await bucket.upload(settle.storage_path as string, result.image.bytes, {
      contentType: result.image.mimeType,
      upsert: true,
    })

    if (error) {
      console.error('flp asset store failed', { message: error.message })
      return internalError()
    }
  }

  const { error: updateError } = await admin
    .from('assets')
    .update(settle)
    .eq('id', row.id)
    .eq('owner_id', row.owner_id)
    .eq('status', 'staged')

  if (updateError) {
    console.error('flp asset settle failed', { code: updateError.code })
    return internalError()
  }

  // The original may hold private metadata; only normalized bytes are kept.
  await bucket.remove([originalPath])

  const settled = await readAsset({ asUser, assetId: row.id })

  if (!settled.ok || !settled.row) {
    return internalError()
  }

  return settledResponse({ asUser, row: settled.row })
}

async function handleAssetRequest({
  request,
  admin,
  asUser,
  userId,
  assetId,
  action,
}: {
  request: Request
  admin: SupabaseClient
  asUser: SupabaseClient
  userId: string
  assetId: string | undefined
  action: string | undefined
}) {
  // POST /assets — reserve a staged asset and a signed upload URL.
  if (request.method === 'POST' && !assetId) {
    const id = newAssetId()
    const { error } = await admin.from('assets').insert({ id, owner_id: userId })

    if (error) {
      console.error('flp asset reserve failed', { code: error.code })
      return internalError()
    }

    const { data, error: signError } = await admin.storage
      .from(ASSET_BUCKET)
      .createSignedUploadUrl(`${userId}/${id}/original`)

    if (signError || !data) {
      console.error('flp asset upload sign failed', { message: signError?.message })
      return internalError()
    }

    const body: AssetReservation = {
      assetId: id,
      status: 'staged',
      upload: { url: data.signedUrl, method: 'PUT', maxBytes: IMAGE_LIMITS.maxBytes },
    }
    return json({ status: 201, body })
  }

  const isStatus = request.method === 'GET' && !action
  const isFinalize = request.method === 'POST' && action === 'finalize'

  if (!assetId || (!isStatus && !isFinalize)) {
    return json({ status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' } } })
  }

  const found = await readAsset({ asUser, assetId })

  if (!found.ok) {
    return internalError()
  }

  if (!found.row) {
    return fromError({ error: assetNotFound() })
  }

  // GET /assets/:id — status, and a signed read URL once ready.
  if (isStatus) {
    const body = await assetResponse({ asUser, row: found.row })
    return body ? json({ status: 200, body }) : internalError()
  }

  // POST /assets/:id/finalize — validate, normalize and settle.
  return found.row.status === 'staged'
    ? finalizeAsset({ admin, asUser, row: found.row })
    : settledResponse({ asUser, row: found.row })
}

function designNotFound() {
  return fromError({ error: apiError({ code: 'not_found', message: 'Design not found' }) })
}

function versionSummary({ row }: { row: VersionSummaryRow }): VersionSummary {
  return {
    seq: row.seq,
    kind: row.kind,
    label: row.label,
    contentHash: row.content_hash,
    restoredFromSeq: row.restored_from_seq,
    createdAt: row.created_at,
  }
}

/**
 * History reads (S07 #176), all as the user so RLS applies: another
 * owner's design, a missing one and a missing version are the same 404.
 * - `GET /designs/:id/versions?before=<seq>&limit=<n>`: newest first.
 * - `GET /designs/:id/versions/:seq`: one version's content, for preview.
 */
async function handleVersionHistory({
  request,
  asUser,
  designId,
  seqSegment,
}: {
  request: Request
  asUser: SupabaseClient
  designId: string
  seqSegment: string | undefined
}) {
  const seq = seqSegment === undefined ? null : parseVersionSeq({ segment: seqSegment })

  if (seqSegment !== undefined && seq === null) {
    return designNotFound()
  }

  const { data: design, error: designError } = await asUser
    .from('designs')
    .select('id, head_seq')
    .eq('id', designId)
    .maybeSingle<{ id: string; head_seq: number | null }>()

  if (designError) {
    console.error('flp history design read failed', { code: designError.code })
    return internalError()
  }

  if (!design) {
    return designNotFound()
  }

  if (seq !== null) {
    const { data, error } = await asUser
      .from('design_versions')
      .select(`${VERSION_SUMMARY_COLUMNS}, content`)
      .eq('design_id', designId)
      .eq('seq', seq)
      .maybeSingle<VersionSummaryRow & { content: VersionDetail['content'] }>()

    if (error) {
      console.error('flp version read failed', { code: error.code })
      return internalError()
    }

    if (!data) {
      return fromError({ error: apiError({ code: 'not_found', message: 'Version not found' }) })
    }

    const body: VersionDetail = { ...versionSummary({ row: data }), designId, content: data.content }
    return json({ status: 200, body })
  }

  const parsed = parseVersionListQuery({ params: new URL(request.url).searchParams })

  if (!parsed.ok) {
    return fromError({ error: parsed.error })
  }

  const { before, limit } = parsed.query
  let query = asUser
    .from('design_versions')
    .select(VERSION_SUMMARY_COLUMNS)
    .eq('design_id', designId)
    .order('seq', { ascending: false })
    // One extra row says whether an older page exists.
    .limit(limit + 1)

  if (before !== null) {
    query = query.lt('seq', before)
  }

  const [{ data: rows, error }, { data: publication, error: publicationError }] = await Promise.all([
    query.returns<VersionSummaryRow[]>(),
    asUser
      .from('publications')
      .select('version_seq')
      .eq('design_id', designId)
      .eq('status', 'published')
      .maybeSingle<{ version_seq: number | null }>(),
  ])

  if (error || publicationError) {
    console.error('flp history read failed', { code: error?.code ?? publicationError?.code })
    return internalError()
  }

  const page = rows.slice(0, limit)
  const body: VersionPage = {
    headSeq: design.head_seq,
    publishedSeq: publication?.version_seq ?? null,
    versions: page.map((row) => versionSummary({ row })),
    nextBefore: rows.length > limit ? (page.at(-1)?.seq ?? null) : null,
  }
  return json({ status: 200, body })
}

export async function handleFlpRequest({
  request,
  env = flpServerEnv(),
}: {
  request: Request
  env?: FlpServerEnv | null
}): Promise<Response> {
  if (!env) {
    return json({
      status: 503,
      body: { error: { code: 'unavailable', message: 'Cloud saving is not configured' } },
    })
  }

  const [collection, designId, action, ...rest] = flpRoute({ request })

  if (collection === 'assets') {
    if (
      rest.length > 0 ||
      (designId && (!ASSET_ID.test(designId) || designId.startsWith(LIBRARY_ASSET_PREFIX))) ||
      (action && action !== 'finalize')
    ) {
      return fromError({ error: assetNotFound() })
    }
  } else if (
    collection !== 'designs' ||
    // Only `/designs/:id/versions/:seq` has a fourth segment.
    rest.length > (action === 'versions' ? 1 : 0) ||
    (designId && !UUID.test(designId))
  ) {
    return fromError({ error: apiError({ code: 'not_found', message: 'Design not found' }) })
  }

  const admin = createClient(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const user = await verifiedUser({ request, admin })

  if (!user) {
    return fromError({ error: apiError({ code: 'unauthenticated', message: 'Sign in required' }) })
  }

  const asUser = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  })

  if (collection === 'assets') {
    return handleAssetRequest({ request, admin, asUser, userId: user.userId, assetId: designId, action })
  }

  if (request.method === 'GET' && designId && action === 'versions') {
    return handleVersionHistory({ request, asUser, designId, seqSegment: rest[0] })
  }

  // Only POST /designs/:id/versions takes no `:seq`.
  if (rest.length > 0) {
    return designNotFound()
  }

  // GET /designs — the signed-in owner's designs, newest first.
  if (request.method === 'GET' && !designId) {
    const { data, error } = await asUser
      .from('designs')
      .select('id, title, visibility, head_seq, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('flp list failed', { code: error.code })
      return internalError()
    }

    return json({
      status: 200,
      body: {
        designs: data.map((row) => ({
          id: row.id,
          title: row.title,
          visibility: row.visibility,
          headSeq: row.head_seq,
          updatedAt: row.updated_at,
        })),
      },
    })
  }

  // GET /designs/:id — the design and its head version.
  if (request.method === 'GET' && designId && !action) {
    const { data: design } = await asUser
      .from('designs')
      .select('id, title, visibility, head_seq, updated_at')
      .eq('id', designId)
      .maybeSingle()

    if (!design) {
      return fromError({ error: apiError({ code: 'not_found', message: 'Design not found' }) })
    }

    const { data: head } = await asUser
      .from('design_versions')
      .select('seq, kind, content, content_hash, created_at')
      .eq('design_id', designId)
      .eq('seq', design.head_seq)
      .maybeSingle()

    return json({
      status: 200,
      body: {
        id: design.id,
        title: design.title,
        visibility: design.visibility,
        headSeq: design.head_seq,
        updatedAt: design.updated_at,
        head: head
          ? {
              seq: head.seq,
              kind: head.kind,
              content: head.content,
              contentHash: head.content_hash,
              createdAt: head.created_at,
            }
          : null,
      },
    })
  }

  if (request.method !== 'POST') {
    return json({ status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' } } })
  }

  const body = await readJson({ request })

  if (!body.ok) {
    return fromError({ error: body.error })
  }

  // POST /designs — create a private design with version 1.
  if (!designId) {
    const parsed = parseCreateDesignRequest({ value: body.value })

    if (!parsed.ok) {
      return fromError({ error: parsed.error })
    }

    const prepared = await prepareContent({ value: parsed.request.content })

    if (!prepared.ok) {
      return fromError({ error: prepared.error })
    }

    const unusable = await unusableAssets({ asUser, document: prepared.prepared.content })

    if (unusable) {
      return unusable
    }

    return callWrite({
      admin,
      fn: 'flp_create_design',
      args: {
        p_owner_id: user.userId,
        p_mutation_key: parsed.request.mutationKey,
        p_content: prepared.prepared.content,
        p_content_hash: prepared.prepared.contentHash,
        p_title: parsed.request.title ?? null,
      },
      status: 201,
    })
  }

  // POST /designs/:id/versions — compare-and-swap save.
  if (action === 'versions') {
    const parsed = parseSaveVersionRequest({ value: body.value })

    if (!parsed.ok) {
      return fromError({ error: parsed.error })
    }

    const prepared = await prepareContent({ value: parsed.request.content })

    if (!prepared.ok) {
      return fromError({ error: prepared.error })
    }

    const unusable = await unusableAssets({ asUser, document: prepared.prepared.content })

    if (unusable) {
      return unusable
    }

    return callWrite({
      admin,
      fn: 'flp_save_version',
      args: {
        p_owner_id: user.userId,
        p_design_id: designId,
        p_base_seq: parsed.request.baseSeq,
        p_mutation_key: parsed.request.mutationKey,
        p_content: prepared.prepared.content,
        p_content_hash: prepared.prepared.contentHash,
        p_kind: parsed.request.kind,
        p_label: parsed.request.label ?? null,
      },
      status: 201,
    })
  }

  // POST /designs/:id/restore — append a copy of an earlier version.
  if (action === 'restore') {
    const parsed = parseRestoreVersionRequest({ value: body.value })

    if (!parsed.ok) {
      return fromError({ error: parsed.error })
    }

    return callWrite({
      admin,
      fn: 'flp_restore_version',
      args: {
        p_owner_id: user.userId,
        p_design_id: designId,
        p_base_seq: parsed.request.baseSeq,
        p_mutation_key: parsed.request.mutationKey,
        p_from_seq: parsed.request.fromSeq,
      },
      status: 201,
    })
  }

  return fromError({ error: apiError({ code: 'not_found', message: 'Design not found' }) })
}
