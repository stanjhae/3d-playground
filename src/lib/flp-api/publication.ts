import type { SupabaseClient } from '@supabase/supabase-js'

import { validateImage } from '../image-validate.ts'
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
 *   quarter, back); the server validates the bytes and stores them
 *   privately under `<owner>/<design>/v<seq>/<kind>.jpg`.
 * - Publish: only a version whose three views are ready; the pointer moves
 *   atomically in `flp_publish_version`, and the slug survives republish.
 * - Public read: anonymous, returns only title, display name and our own
 *   seq-pinned image URLs, and only while published. Never the document,
 *   history or owner (signed storage URLs would leak the owner ID in the
 *   path). Unpublish makes it 404 at once; images are cached for a minute.
 */

export const PUBLIC_RENDER_KINDS = ['view_front', 'view_three_quarter', 'view_back'] as const

export type PublicRenderKind = (typeof PUBLIC_RENDER_KINDS)[number]

/** Public views are cached briefly so an unpublish takes hold quickly. */
export const PUBLIC_IMAGE_MAX_AGE = 60

const BUCKET = 'design-assets'
const SLUG = /^[a-f0-9]{16}$/

export type PublicDesign = {
  slug: string
  title: string
  displayName: string | null
  seq: number
  publishedAt: string
  renders: Record<PublicRenderKind, string>
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

/** Parse `{ seq, renders: [{ kind, data }] }` strictly. */
export function parseRenderUpload({ value }: { value: unknown }):
  | { ok: true; seq: number; renders: Array<{ kind: PublicRenderKind; data: string }> }
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
    if (key !== 'seq' && key !== 'renders') {
      return invalid(`$.${key}`, 'unknown field')
    }
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

  return { ok: true, seq: record.seq as number, renders }
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
  const { data } = await client
    .from('render_artifacts')
    .select('kind, storage_path')
    .eq('design_id', designId)
    .eq('version_seq', seq)
    .eq('status', 'ready')

  return new Map((data ?? []).map((row) => [row.kind as string, row.storage_path as string]))
}

const notFound = () => apiError({ code: 'not_found', message: 'Design not found' })

/** POST /designs/:id/renders — store validated views of one saved version. */
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
        .select('seq')
        .eq('design_id', designId)
        .eq('seq', parsed.seq)
        .maybeSingle()
    : { data: null }

  if (!design || !version) {
    const error = notFound()
    return respond({ status: error.status, body: error.body })
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
      },
      { onConflict: 'design_id,version_seq,kind' },
    )

    if (error) {
      console.error('flp render row failed', { code: error.code })
      return respond({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } })
    }
  }

  return respond({ status: 201, body: { seq: parsed.seq, kinds: parsed.renders.map((render) => render.kind) } })
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
    ? await readyRenderKinds({ client: asUser, designId, seq: design.head_seq })
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

export type PublishedDesign = {
  slug: string
  title: string
  displayName: string | null
  seq: number
  publishedAt: string
  renderPaths: Map<string, string>
}

/**
 * The live publication behind `slug`, or null when it is unknown, revoked
 * or missing a view. The one place public reads decide what is published.
 */
export async function findPublishedDesign({
  admin,
  slug,
}: {
  admin: SupabaseClient
  slug: string | undefined
}): Promise<PublishedDesign | null> {
  if (!slug || !SLUG.test(slug)) {
    return null
  }

  const { data: publication } = await admin
    .from('publications')
    .select('slug, design_id, version_seq, display_name, title, published_at, status')
    .eq('slug', slug)
    .maybeSingle()

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

  if (!publication.title || PUBLIC_RENDER_KINDS.some((kind) => !renderPaths.has(kind))) {
    return null
  }

  return {
    slug,
    title: publication.title as string,
    displayName: (publication.display_name as string | null) ?? null,
    seq: publication.version_seq as number,
    publishedAt: publication.published_at as string,
    renderPaths,
  }
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
  const published = await findPublishedDesign({ admin, slug })

  if (!published) {
    return respond({ status: 404, body: { error: { code: 'not_found', message: 'This design is not available' } } })
  }

  const renders = Object.fromEntries(
    PUBLIC_RENDER_KINDS.map((kind) => [kind, publicImagePath({ slug: published.slug, kind, seq: published.seq })]),
  ) as Record<PublicRenderKind, string>

  const body: PublicDesign = {
    slug: published.slug,
    title: published.title,
    displayName: published.displayName,
    seq: published.seq,
    publishedAt: published.publishedAt,
    renders,
  }

  return respond({ status: 200, body })
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

  const published = await findPublishedDesign({ admin, slug })

  if (!published || (seq !== null && Number(seq) !== published.seq)) {
    return gone()
  }

  const { data, error } = await admin.storage.from(BUCKET).download(published.renderPaths.get(view)!)

  if (error || !data) {
    return gone()
  }

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      'Cache-Control': `public, max-age=${PUBLIC_IMAGE_MAX_AGE}`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
