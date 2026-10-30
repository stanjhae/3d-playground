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
 * - Public read: anonymous, returns only title, display name and 5-minute
 *   signed render URLs, and only while published. Never the document,
 *   history or owner. Unpublish makes it 404 at once.
 */

export const PUBLIC_RENDER_KINDS = ['view_front', 'view_three_quarter', 'view_back'] as const

export type PublicRenderKind = (typeof PUBLIC_RENDER_KINDS)[number]

/** Signed render URLs expire quickly so revoked media stops loading. */
export const SIGNED_URL_SECONDS = 300

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
  const gone = () => respond({ status: 404, body: { error: { code: 'not_found', message: 'This design is not available' } } })

  if (!slug || !SLUG.test(slug)) {
    return gone()
  }

  const { data: publication } = await admin
    .from('publications')
    .select('slug, design_id, version_seq, display_name, published_at, status')
    .eq('slug', slug)
    .maybeSingle()

  if (!publication || publication.status !== 'published' || !publication.design_id || !publication.version_seq) {
    return gone()
  }

  const { data: design } = await admin
    .from('designs')
    .select('title')
    .eq('id', publication.design_id)
    .maybeSingle()
  const ready = await readyRenderKinds({
    client: admin,
    designId: publication.design_id as string,
    seq: publication.version_seq as number,
  })

  if (!design || PUBLIC_RENDER_KINDS.some((kind) => !ready.has(kind))) {
    return gone()
  }

  const renders = {} as Record<PublicRenderKind, string>

  for (const kind of PUBLIC_RENDER_KINDS) {
    const signed = await admin.storage
      .from(BUCKET)
      .createSignedUrl(ready.get(kind)!, SIGNED_URL_SECONDS)

    if (signed.error || !signed.data) {
      return gone()
    }

    renders[kind] = signed.data.signedUrl
  }

  const body: PublicDesign = {
    slug,
    title: design.title as string,
    displayName: (publication.display_name as string | null) ?? null,
    seq: publication.version_seq as number,
    publishedAt: publication.published_at as string,
    renders,
  }

  return respond({ status: 200, body })
}
