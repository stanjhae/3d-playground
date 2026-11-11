import type { SupabaseClient } from '@supabase/supabase-js'

import { validateImage } from '../image-validate.ts'
import { resolveTemplate, TEMPLATE_IDS } from '../template-manifest.ts'
import { BASE_PUBLIC_RENDER_KINDS, PUBLIC_RENDER_KINDS } from './render-kinds.mjs'
import {
  type ApiError,
  type PublicationResponse,
  apiError,
  apiErrorFromDatabase,
  parsePublishVersionRequest,
} from './contract.ts'

/**
 * Publication (FLP P01–P05, #179–#183).
 *
 * - Renders: the studio captures the exact saved version (front, three-
 *   quarter, back and both sleeves); the server validates the bytes and
 *   stores them privately under `<owner>/<design>/v<seq>/<kind>.jpg`.
 * - Publish: only a version whose five views are ready; the pointer moves
 *   atomically in `flp_publish_version`, and the slug survives republish.
 * - Public read: anonymous, returns only title, display name and our own
 *   seq-pinned image URLs, and only while published. Never the document,
 *   history or owner (signed storage URLs would leak the owner ID in the
 *   path). Unpublish makes it 404 at once, and nothing public is cached
 *   (#183), so no copy outlives the publication.
 */

// The view lists live in render-kinds.mjs, shared with the backup scripts.
export { BASE_PUBLIC_RENDER_KINDS, PUBLIC_RENDER_KINDS }

export type PublicRenderKind = (typeof PUBLIC_RENDER_KINDS)[number]
export type BasePublicRenderKind = (typeof BASE_PUBLIC_RENDER_KINDS)[number]
export type SleeveRenderKind = Exclude<PublicRenderKind, BasePublicRenderKind>

/** Public views and pages are never cached, so unpublishing is instant (#183). */
export const PUBLIC_CACHE_CONTROL = 'no-store'
/** Public-by-link isn't a directory (PRD section 10). */
export const PUBLIC_ROBOTS = 'noindex'

const BUCKET = 'design-assets'
const SLUG = /^[a-f0-9]{16}$/

export type PublicDesign = {
  slug: string
  title: string
  displayName: string | null
  seq: number
  publishedAt: string
  /** The garment the published version was made on (`garments.ts`). */
  garmentId: string
  /** Our image URLs; the sleeves only when that version has them. */
  renders: Record<BasePublicRenderKind, string> & Partial<Record<SleeveRenderKind, string>>
}

export type OwnerPublication = PublicationResponse & {
  displayName: string | null
  rendersReadyForHead: boolean
}

type Respond = (args: { status: number; body?: unknown }) => Response

function decodeBase64({ value }: { value: string }) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function isRenderKind(value: unknown): value is PublicRenderKind {
  return typeof value === 'string' && (PUBLIC_RENDER_KINDS as readonly string[]).includes(value)
}

/** What drew a set of views (C2): the garment template and the atlas compiler. */
export type RenderBuildStamp = {
  templateId: string | null
  templateVersion: number | null
  compilerVersion: number | null
}

const STAMP_FIELDS = ['templateVersion', 'compilerVersion'] as const
const STAMP_KEYS: readonly string[] = [...STAMP_FIELDS, 'templateId']

function isStampVersion(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 1000
}

/**
 * Parse `{ seq, renders: [{ kind, data }], templateVersion?, compilerVersion? }`
 * strictly. The stamp is optional so a studio tab opened before C2 can still
 * publish; its views are stored unstamped.
 */
export function parseRenderUpload({ value }: { value: unknown }):
  | { ok: true; seq: number; renders: Array<{ kind: PublicRenderKind; data: string }>; stamp: RenderBuildStamp }
  | { ok: false; error: ApiError } {
  const invalid = (path: string, message: string) => ({
    ok: false as const,
    error: apiError({ code: 'invalid', message: 'Request is invalid', issues: [{ path, message }] }),
  })

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('$', 'expected an object')
  }

  const record = value as Record<string, unknown>

  for (const key of Object.keys(record)) {
    if (key !== 'seq' && key !== 'renders' && !STAMP_KEYS.includes(key)) {
      return invalid(`$.${key}`, 'unknown field')
    }
  }

  for (const key of STAMP_FIELDS) {
    if (record[key] !== undefined && !isStampVersion(record[key])) {
      return invalid(`$.${key}`, 'expected a version number')
    }
  }

  if (record.templateId !== undefined && !(typeof record.templateId === 'string' && TEMPLATE_IDS.includes(record.templateId))) {
    return invalid('$.templateId', 'expected a known garment template')
  }

  if (!Number.isInteger(record.seq) || (record.seq as number) < 1) {
    return invalid('$.seq', 'expected a version number')
  }

  if (!Array.isArray(record.renders) || record.renders.length !== PUBLIC_RENDER_KINDS.length) {
    return invalid('$.renders', `expected ${PUBLIC_RENDER_KINDS.length} renders`)
  }

  const renders: Array<{ kind: PublicRenderKind; data: string }> = []

  for (const [index, render] of record.renders.entries()) {
    const entry = render as Record<string, unknown> | null

    if (!entry || !isRenderKind(entry.kind) || typeof entry.data !== 'string' || entry.data.length === 0) {
      return invalid(`$.renders[${index}]`, 'expected { kind, data }')
    }

    if (renders.some((existing) => existing.kind === entry.kind)) {
      return invalid(`$.renders[${index}].kind`, 'duplicate kind')
    }

    renders.push({ kind: entry.kind, data: entry.data })
  }

  return {
    ok: true,
    seq: record.seq as number,
    renders,
    stamp: {
      templateId: (record.templateId as string | undefined) ?? null,
      templateVersion: (record.templateVersion as number | undefined) ?? null,
      compilerVersion: (record.compilerVersion as number | undefined) ?? null,
    },
  }
}

async function ownedDesign({ asUser, designId }: { asUser: SupabaseClient; designId: string }) {
  const { data } = await asUser
    .from('designs')
    .select('id, owner_id, head_seq, title')
    .eq('id', designId)
    .maybeSingle()

  return data as { id: string; owner_id: string; head_seq: number | null; title: string } | null
}

async function readyRenderKinds({
  client,
  designId,
  seq,
}: {
  client: SupabaseClient
  designId: string
  seq: number
}) {
  const { data, error } = await client
    .from('render_artifacts')
    .select('kind, storage_path')
    .eq('design_id', designId)
    .eq('version_seq', seq)
    .eq('status', 'ready')

  if (error) {
    throw new Error('render read failed', { cause: error })
  }

  return new Map((data ?? []).map((row) => [row.kind as string, row.storage_path as string]))
}

/** The hash recorded for each ready view when it was uploaded (P02 #180). */
async function renderHashes({ client, designId, seq }: { client: SupabaseClient; designId: string; seq: number }) {
  const { data } = await client
    .from('render_artifacts')
    .select('kind, sha256')
    .eq('design_id', designId)
    .eq('version_seq', seq)
    .eq('status', 'ready')

  return new Map((data ?? []).map((row) => [row.kind as string, row.sha256 as string]))
}

async function sha256Hex({ bytes }: { bytes: ArrayBuffer }) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The ready views of one version whose stored bytes still hash to the hash
 * recorded at upload. A view whose file is missing or changed isn't intact,
 * so an upload repairs it instead of keeping it (docs/backup-restore.md).
 */
async function intactRenderKinds({ admin, designId, seq }: { admin: SupabaseClient; designId: string; seq: number }) {
  const { data, error } = await admin
    .from('render_artifacts')
    .select('kind, storage_path, sha256')
    .eq('design_id', designId)
    .eq('version_seq', seq)
    .eq('status', 'ready')

  if (error) {
    throw new Error('render read failed', { cause: error })
  }

  const intact = new Set<string>()

  for (const row of data ?? []) {
    const stored = await admin.storage.from(BUCKET).download(row.storage_path as string)

    if (!stored.error && stored.data && (await sha256Hex({ bytes: await stored.data.arrayBuffer() })) === row.sha256) {
      intact.add(row.kind as string)
    }
  }

  return intact
}

const notFound = () => apiError({ code: 'not_found', message: 'Design not found' })

/**
 * POST /designs/:id/renders — store validated views of one saved version.
 *
 * A version's views are write-once (C2): a view that is already ready is
 * kept as it is, bytes, hash and stamp, and never replaced by a later
 * upload. Republishing a version (a new display name, or after unpublishing)
 * re-sends its views; overwriting them would swap what an earlier publish
 * showed, and the swap itself left a moment where the stored file and its
 * recorded hash disagreed, so the public view 404'd. Missing views (the
 * sleeves of a version published before #179) are still added, and a view
 * whose stored file no longer matches its hash is replaced, so republishing
 * still repairs a broken view.
 */
export async function uploadRenders({
  value,
  admin,
  asUser,
  designId,
  respond,
}: {
  value: unknown
  admin: SupabaseClient
  asUser: SupabaseClient
  designId: string
  respond: Respond
}) {
  const parsed = parseRenderUpload({ value })

  if (!parsed.ok) {
    return respond({ status: parsed.error.status, body: parsed.error.body })
  }

  const design = await ownedDesign({ asUser, designId })
  const { data: version } = design
    ? await asUser
        .from('design_versions')
        .select('seq, template_id:content->template->>id')
        .eq('design_id', designId)
        .eq('seq', parsed.seq)
        .maybeSingle()
    : { data: null }

  if (!design || !version) {
    const error = notFound()
    return respond({ status: error.status, body: error.body })
  }

  // Views drawn on another garment than the version's would mislabel it.
  const versionTemplate = (version as { template_id?: string | null }).template_id ?? null

  if (parsed.stamp.templateId !== null && parsed.stamp.templateId !== versionTemplate) {
    const error = apiError({
      code: 'invalid',
      message: 'These views were drawn on a different garment than this version',
      issues: [{ path: '$.templateId', message: `expected ${versionTemplate ?? 'the version template'}` }],
    })
    return respond({ status: error.status, body: error.body })
  }

  let kept: Set<string>

  try {
    kept = await intactRenderKinds({ admin, designId, seq: parsed.seq })
  } catch {
    console.error('flp render read failed')
    return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
  }

  for (const render of parsed.renders) {
    const checked = await validateImage({ bytes: decodeBase64({ value: render.data }) })

    if (!checked.ok) {
      const error = apiError({
        code: 'invalid',
        message: checked.message,
        issues: [{ path: `$.renders.${render.kind}`, message: checked.reason }],
      })
      return respond({ status: error.status, body: error.body })
    }

    if (kept.has(render.kind)) {
      continue
    }

    const extension = checked.image.mimeType === 'image/png' ? 'png' : 'jpg'
    const storagePath = `${design.owner_id}/${designId}/v${parsed.seq}/${render.kind}.${extension}`
    const stored = await admin.storage.from(BUCKET).upload(storagePath, checked.image.bytes, {
      contentType: checked.image.mimeType,
      upsert: true,
    })

    if (stored.error) {
      console.error('flp render upload failed', { kind: render.kind })
      return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
    }

    const { error } = await admin.from('render_artifacts').upsert(
      {
        design_id: designId,
        version_seq: parsed.seq,
        owner_id: design.owner_id,
        kind: render.kind,
        status: 'ready',
        storage_path: storagePath,
        sha256: checked.image.sha256,
        template_id: parsed.stamp.templateId,
        template_version: parsed.stamp.templateVersion,
        compiler_version: parsed.stamp.compilerVersion,
      },
      { onConflict: 'design_id,version_seq,kind' },
    )

    if (error) {
      console.error('flp render row failed', { code: error.code })
      return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
    }
  }

  return respond({
    status: 201,
    body: {
      seq: parsed.seq,
      kinds: parsed.renders.map((render) => render.kind),
      // Views this version already had, left untouched.
      kept: parsed.renders.map((render) => render.kind).filter((kind) => kept.has(kind)),
    },
  })
}

/** GET /designs/:id/publication — the owner's view of publication state. */
export async function readOwnerPublication({
  asUser,
  designId,
  respond,
}: {
  asUser: SupabaseClient
  designId: string
  respond: Respond
}) {
  const design = await ownedDesign({ asUser, designId })

  if (!design) {
    const error = notFound()
    return respond({ status: error.status, body: error.body })
  }

  const { data } = await asUser
    .from('publications')
    .select('slug, status, version_seq, display_name')
    .eq('design_id', designId)
    .maybeSingle()
  const ready = design.head_seq
    ? await readyRenderKinds({ client: asUser, designId, seq: design.head_seq }).catch(() => new Map<string, string>())
    : new Map()

  const body: OwnerPublication | null = data
    ? {
        slug: data.slug as string,
        status: data.status as OwnerPublication['status'],
        seq: (data.version_seq as number | null) ?? null,
        displayName: (data.display_name as string | null) ?? null,
        rendersReadyForHead: PUBLIC_RENDER_KINDS.every((kind) => ready.has(kind)),
      }
    : null

  return respond({ status: 200, body: { publication: body } })
}

/** POST /designs/:id/publication — publish one saved version. */
export async function publishVersion({
  value,
  admin,
  asUser,
  userId,
  designId,
  respond,
}: {
  value: unknown
  admin: SupabaseClient
  asUser: SupabaseClient
  userId: string
  designId: string
  respond: Respond
}) {
  const parsed = parsePublishVersionRequest({ value })

  if (!parsed.ok) {
    return respond({ status: parsed.error.status, body: parsed.error.body })
  }

  const design = await ownedDesign({ asUser, designId })

  if (!design) {
    const error = notFound()
    return respond({ status: error.status, body: error.body })
  }

  const ready = await readyRenderKinds({ client: asUser, designId, seq: parsed.request.seq })
  const missing = PUBLIC_RENDER_KINDS.filter((kind) => !ready.has(kind))

  if (missing.length > 0) {
    const error = apiError({
      code: 'invalid',
      message: 'This version has no published views yet',
      issues: missing.map((kind) => ({ path: `$.renders.${kind}`, message: 'not ready' })),
    })
    return respond({ status: error.status, body: error.body })
  }

  const { data, error } = await admin
    .rpc('flp_publish_version', {
      p_owner_id: userId,
      p_design_id: designId,
      p_seq: parsed.request.seq,
      p_display_name: parsed.request.displayName ?? null,
    })
    .single<{ slug: string; status: 'published' | 'revoked'; version_seq: number | null }>()

  if (error) {
    const mapped = apiErrorFromDatabase({ code: error.code, message: error.message, details: error.details })
    return mapped
      ? respond({ status: mapped.status, body: mapped.body })
      : respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
  }

  const body: PublicationResponse = { slug: data.slug, status: data.status, seq: data.version_seq }
  return respond({ status: 200, body })
}

/** DELETE /designs/:id/publication — withdraw public access now. */
export async function unpublish({
  admin,
  userId,
  designId,
  respond,
}: {
  admin: SupabaseClient
  userId: string
  designId: string
  respond: Respond
}) {
  const { error } = await admin.rpc('flp_revoke_publication', {
    p_owner_id: userId,
    p_design_id: designId,
  })

  if (error) {
    const mapped = apiErrorFromDatabase({ code: error.code, message: error.message, details: error.details })
    return mapped
      ? respond({ status: mapped.status, body: mapped.body })
      : respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
  }

  return respond({ status: 204 })
}

/** A live publication, as the image route needs it: no garment. */
export type Publication = {
  designId: string
  slug: string
  title: string
  displayName: string | null
  seq: number
  publishedAt: string
  renderPaths: Map<string, string>
}

/** A live publication with its garment, for the pages that show it. */
export type PublishedDesign = Publication & { garmentId: string }

/**
 * The live publication behind `slug`, or null when it is unknown, revoked
 * or missing a base view. The one place public reads decide what is
 * published. Sleeve views are optional here, so a version published with
 * three views stays public (#179); `renderPaths` holds whichever exist.
 * Throws when the database can't answer: that isn't "not published".
 */
export async function findPublication({
  admin,
  slug,
}: {
  admin: SupabaseClient
  slug: string | undefined
}): Promise<Publication | null> {
  if (!slug || !SLUG.test(slug)) {
    return null
  }

  const { data: publication, error } = await admin
    .from('publications')
    .select('slug, design_id, version_seq, display_name, title, published_at, status')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    throw new Error('publication read failed', { cause: error })
  }

  if (!publication || publication.status !== 'published' || !publication.design_id || !publication.version_seq) {
    return null
  }

  // The title the owner published with; a later rename shows only after
  // publishing again (#150).
  const renderPaths = await readyRenderKinds({
    client: admin,
    designId: publication.design_id as string,
    seq: publication.version_seq as number,
  })

  if (!publication.title || BASE_PUBLIC_RENDER_KINDS.some((kind) => !renderPaths.has(kind))) {
    return null
  }

  return {
    designId: publication.design_id as string,
    slug,
    title: publication.title as string,
    displayName: (publication.display_name as string | null) ?? null,
    seq: publication.version_seq as number,
    publishedAt: publication.published_at as string,
    renderPaths,
  }
}

/**
 * The live publication behind `slug` with its garment, which comes from the
 * published version's own template. Only the pages that show the garment pay
 * for the extra read; the image route uses `findPublication`.
 */
export async function findPublishedDesign({
  admin,
  slug,
}: {
  admin: SupabaseClient
  slug: string | undefined
}): Promise<PublishedDesign | null> {
  const publication = await findPublication({ admin, slug })

  if (!publication) {
    return null
  }

  const { data: version, error } = await admin
    .from('design_versions')
    .select('template_id:content->template->>id, template_version:content->template->>version')
    .eq('design_id', publication.designId)
    .eq('seq', publication.seq)
    .maybeSingle()

  if (error) {
    throw new Error('version read failed', { cause: error })
  }

  const pinned = version as { template_id?: string | null; template_version?: string | null } | null
  const resolved = pinned?.template_id
    ? resolveTemplate({ id: pinned.template_id, version: Number(pinned.template_version) })
    : null

  return { ...publication, garmentId: resolved?.ok ? resolved.manifest.garmentId : 'tee' }
}

/**
 * Our own stable URL for one published view. Storage paths (and so signed
 * URLs) carry the owner ID, so public pages never see them; `seq` pins the
 * version so a page never mixes views across a republish.
 */
export function publicImagePath({
  slug,
  kind = 'view_front',
  seq,
}: {
  slug: string
  kind?: PublicRenderKind
  seq?: number
}) {
  const query = new URLSearchParams()

  if (kind !== 'view_front') query.set('view', kind)
  if (seq !== undefined) query.set('seq', String(seq))

  const search = query.toString()
  return `/api/flp/public/${slug}/image${search ? `?${search}` : ''}`
}

/** GET /public/:slug — anonymous; only what the owner chose to publish. */
export async function readPublicDesign({
  admin,
  slug,
  respond,
}: {
  admin: SupabaseClient
  slug: string | undefined
  respond: Respond
}) {
  let published: PublishedDesign | null

  try {
    published = await findPublishedDesign({ admin, slug })
  } catch (error) {
    console.error('flp public read failed', { error })
    return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
  }

  if (!published) {
    return respond({ status: 404, body: { error: { code: 'not_found', message: 'This design is not available' } } })
  }

  return respond({ status: 200, body: publicDesignPayload({ published }) })
}

/** The only fields a public reader ever gets (P04 #182); only views that exist. */
export function publicDesignPayload({ published }: { published: PublishedDesign }): PublicDesign {
  const renders = Object.fromEntries(
    PUBLIC_RENDER_KINDS.filter((kind) => published.renderPaths.has(kind)).map((kind) => [
      kind,
      publicImagePath({ slug: published.slug, kind, seq: published.seq }),
    ]),
  ) as PublicDesign['renders']

  return {
    slug: published.slug,
    title: published.title,
    displayName: published.displayName,
    seq: published.seq,
    publishedAt: published.publishedAt,
    garmentId: published.garmentId,
    renders,
  }
}

/**
 * GET /public/:slug/image[?view=&seq=] — streams one view of the published
 * version (the front by default, for link previews). 404 once unpublished,
 * or when `seq` is no longer the published version.
 */
export async function readPublicImage({
  admin,
  slug,
  search,
}: {
  admin: SupabaseClient
  slug: string | undefined
  search: URLSearchParams
}) {
  const gone = () =>
    Response.json(
      { error: { code: 'not_found', message: 'This design is not available' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  const view = search.get('view') ?? 'view_front'
  const seq = search.get('seq')

  if (!isRenderKind(view) || (seq !== null && !/^[1-9][0-9]{0,9}$/.test(seq))) {
    return gone()
  }

  let published: Publication | null

  try {
    published = await findPublication({ admin, slug })
  } catch (error) {
    console.error('flp public image read failed', { error })
    return Response.json(
      { error: { code: 'internal', message: 'Something went wrong' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // A sleeve view of a version published before #179 does not exist.
  const path = published?.renderPaths.get(view)

  if (!published || !path || (seq !== null && Number(seq) !== published.seq)) {
    return gone()
  }

  const { data, error } = await admin.storage.from(BUCKET).download(path)

  if (error || !data) {
    return gone()
  }

  // Only the exact bytes validated at upload are ever served (P02 #180):
  // a file replaced or corrupted in storage is refused, not shown.
  const bytes = await data.arrayBuffer()
  const expected = (await renderHashes({ client: admin, designId: published.designId, seq: published.seq })).get(view)

  if (!expected || (await sha256Hex({ bytes })) !== expected) {
    console.error('flp public render hash mismatch', { slug: published.slug, view })
    return gone()
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      'Cache-Control': PUBLIC_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': PUBLIC_ROBOTS,
    },
  })
}

/** One published design on the board (V2): only what its share page shows. */
export type BoardEntry = {
  slug: string
  title: string
  displayName: string | null
  garmentId: string
  votes: number
  publishedAt: string
  /** Our stable URL for its front view. */
  image: string
}

/** How many designs the board shows: the most voted, over every publication. */
export const BOARD_LIMIT = 200

/**
 * GET /public — the board: every published design with its three base views,
 * its garment (from the version's own template) and its votes, most voted
 * first. Anonymous, like the share pages. One query (`flp_board`), which
 * ranks and counts in the database, so no row cap or URL length bounds it.
 */
export async function readBoard({ admin, respond }: { admin: SupabaseClient; respond: Respond }) {
  try {
    const { data, error } = await admin.rpc('flp_board', { p_limit: BOARD_LIMIT })

    if (error) {
      throw error
    }

    const rows = (data ?? []) as Array<{
      slug: string
      title: string
      display_name: string | null
      version_seq: number
      published_at: string
      template_id: string | null
      template_version: string | null
      vote_count: number
    }>
    const designs: BoardEntry[] = rows.map((row) => {
      const resolved = row.template_id
        ? resolveTemplate({ id: row.template_id, version: Number(row.template_version) })
        : null
      return {
        slug: row.slug,
        title: row.title,
        displayName: row.display_name,
        garmentId: resolved?.ok ? resolved.manifest.garmentId : 'tee',
        votes: row.vote_count,
        publishedAt: row.published_at,
        image: publicImagePath({ slug: row.slug, seq: row.version_seq }),
      }
    })

    return respond({ status: 200, body: { designs } })
  } catch (error) {
    console.error('flp board read failed', { error })
    return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
  }
}
