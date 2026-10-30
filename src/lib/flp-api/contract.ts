import {
  type CanonicalDocument,
  type ValidationIssue,
  validateCanonicalDocument,
} from '../canonical-document.ts'
import {
  type ContentHash,
  hashCanonicalDocument,
  normalizeCanonicalDocument,
  serializeCanonicalDocument,
} from '../canonical-hash.ts'
import type { ImageMimeType, ImageRejectReason } from '../image-validate.ts'
import { isLibraryAssetId } from '../library-assets.ts'

/**
 * FLP design API contract (F08 #143): request shapes, server-side content
 * preparation and the error envelope. The server is the trust boundary:
 * it derives the owner from a verified session, re-validates and re-hashes
 * content, then calls the service-role functions in
 * supabase/migrations/*_flp_core_schema.sql. See docs/data-model.md.
 */

/** Must match the content_bytes bound in the schema migration. */
export const MAX_CONTENT_BYTES = 2_000_000

export const API_ERROR_STATUS = {
  unauthenticated: 401,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  invalid: 422,
  rate_limited: 429,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS

export type ApiError = {
  status: (typeof API_ERROR_STATUS)[ApiErrorCode]
  body: {
    error: {
      code: ApiErrorCode
      message: string
      issues?: ValidationIssue[]
      headSeq?: number | null
      reason?: ImageRejectReason
    }
  }
}

export type SaveKind = 'autosave' | 'checkpoint'

export type CreateDesignRequest = {
  mutationKey: string
  title?: string
  content: unknown
}

export type SaveVersionRequest = {
  baseSeq: number
  mutationKey: string
  kind: SaveKind
  label?: string
  content: unknown
}

export type RestoreVersionRequest = {
  baseSeq: number
  mutationKey: string
  fromSeq: number
}

export type PublishVersionRequest = {
  seq: number
  displayName?: string
}

export type VersionResponse = {
  designId: string
  seq: number
  kind: SaveKind | 'restore' | 'import'
  contentHash: ContentHash
  restoredFromSeq: number | null
  createdAt: string
}

export type PublicationResponse = {
  slug: string
  status: 'published' | 'revoked'
  seq: number | null
}

/** `GET /assets/:id` and finalize (S01 #170). */
export type AssetResponse =
  | { assetId: string; status: 'staged' }
  | { assetId: string; status: 'rejected'; reason: ImageRejectReason }
  | {
      assetId: string
      status: 'ready'
      mimeType: ImageMimeType
      width: number
      height: number
      byteSize: number
      sha256: string
      /** Short-lived signed read URL; the bucket is never public. */
      readUrl: string
      readUrlExpiresIn: number
    }

/** `POST /assets`: a staged reservation and where to PUT the original. */
export type AssetReservation = {
  assetId: string
  status: 'staged'
  upload: { url: string; method: 'PUT'; maxBytes: number }
}

export type PreparedContent = {
  content: CanonicalDocument
  contentHash: ContentHash
  contentBytes: number
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function apiError({
  code,
  message,
  issues,
  headSeq,
  reason,
}: {
  code: ApiErrorCode
  message: string
  issues?: ValidationIssue[]
  headSeq?: number | null
  reason?: ImageRejectReason
}): ApiError {
  return {
    status: API_ERROR_STATUS[code],
    body: {
      error: {
        code,
        message,
        ...(issues ? { issues } : {}),
        ...(headSeq !== undefined ? { headSeq } : {}),
        ...(reason ? { reason } : {}),
      },
    },
  }
}

const SQLSTATE_CODES: Record<string, ApiErrorCode> = {
  FL401: 'unauthenticated',
  FL404: 'not_found',
  FL409: 'conflict',
  FL413: 'too_large',
  FL422: 'invalid',
}

/**
 * Maps a database error to the envelope. Unknown failures are not
 * described to the client; the caller logs and returns a 500.
 */
export function apiErrorFromDatabase({
  code,
  message,
  details,
}: {
  code?: string
  message?: string
  details?: string | null
}): ApiError | null {
  const mapped = code ? SQLSTATE_CODES[code] : undefined

  if (!mapped) {
    return null
  }

  if (mapped === 'not_found') {
    return apiError({ code: mapped, message: 'Design not found' })
  }

  if (mapped === 'conflict' && details) {
    try {
      const parsed = JSON.parse(details) as { headSeq?: unknown }
      const headSeq =
        typeof parsed.headSeq === 'number' ? parsed.headSeq : null

      return apiError({ code: mapped, message: message ?? 'Conflict', headSeq })
    } catch {
      // Fall through to the plain conflict envelope.
    }
  }

  return apiError({ code: mapped, message: message ?? mapped })
}

export async function prepareContent({
  value,
}: {
  value: unknown
}): Promise<{ ok: true; prepared: PreparedContent } | { ok: false; error: ApiError }> {
  const result = validateCanonicalDocument({ value })

  if (!result.ok) {
    return {
      ok: false,
      error: apiError({
        code: 'invalid',
        message: 'Design content is invalid',
        issues: result.issues,
      }),
    }
  }

  const content = normalizeCanonicalDocument({ document: result.document })
  const contentBytes = new TextEncoder().encode(
    serializeCanonicalDocument({ document: content }),
  ).length

  if (contentBytes > MAX_CONTENT_BYTES) {
    return {
      ok: false,
      error: apiError({ code: 'too_large', message: 'Design content is too large' }),
    }
  }

  return {
    ok: true,
    prepared: {
      content,
      contentHash: await hashCanonicalDocument({ document: content }),
      contentBytes,
    },
  }
}

type Parsed<T> = { ok: true; request: T } | { ok: false; error: ApiError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFields<T>({
  value,
  required,
  optional = [],
  check,
}: {
  value: unknown
  required: readonly string[]
  optional?: readonly string[]
  check: (record: Record<string, unknown>) => ValidationIssue[]
}): Parsed<T> {
  const issues: ValidationIssue[] = []

  if (!isRecord(value)) {
    issues.push({ path: '$', message: 'expected an object' })
  } else {
    const allowed = new Set([...required, ...optional])

    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        issues.push({ path: `$.${key}`, message: 'unknown field' })
      }
    }

    for (const key of required) {
      if (!(key in value)) {
        issues.push({ path: `$.${key}`, message: 'required' })
      }
    }

    if (issues.length === 0) {
      issues.push(...check(value))
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: apiError({ code: 'invalid', message: 'Request is invalid', issues }),
    }
  }

  return { ok: true, request: value as T }
}

function mutationKeyIssue({ value }: { value: unknown }): ValidationIssue[] {
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? []
    : [{ path: '$.mutationKey', message: 'expected a UUID' }]
}

function seqIssue({
  value,
  path,
}: {
  value: unknown
  path: string
}): ValidationIssue[] {
  return Number.isInteger(value) && (value as number) >= 1
    ? []
    : [{ path, message: 'expected a version number' }]
}

function textIssue({
  value,
  path,
  max,
}: {
  value: unknown
  path: string
  max: number
}): ValidationIssue[] {
  return value === undefined ||
    (typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= max)
    ? []
    : [{ path, message: `expected 1–${max} characters` }]
}

export function parseCreateDesignRequest({ value }: { value: unknown }) {
  return parseFields<CreateDesignRequest>({
    value,
    required: ['mutationKey', 'content'],
    optional: ['title'],
    check: (record) => [
      ...mutationKeyIssue({ value: record.mutationKey }),
      ...textIssue({ value: record.title, path: '$.title', max: 80 }),
    ],
  })
}

export function parseSaveVersionRequest({ value }: { value: unknown }) {
  return parseFields<SaveVersionRequest>({
    value,
    required: ['baseSeq', 'mutationKey', 'kind', 'content'],
    optional: ['label'],
    check: (record) => [
      ...seqIssue({ value: record.baseSeq, path: '$.baseSeq' }),
      ...mutationKeyIssue({ value: record.mutationKey }),
      ...(record.kind === 'autosave' || record.kind === 'checkpoint'
        ? []
        : [{ path: '$.kind', message: 'expected autosave or checkpoint' }]),
      ...textIssue({ value: record.label, path: '$.label', max: 60 }),
    ],
  })
}

export function parseRestoreVersionRequest({ value }: { value: unknown }) {
  return parseFields<RestoreVersionRequest>({
    value,
    required: ['baseSeq', 'mutationKey', 'fromSeq'],
    check: (record) => [
      ...seqIssue({ value: record.baseSeq, path: '$.baseSeq' }),
      ...mutationKeyIssue({ value: record.mutationKey }),
      ...seqIssue({ value: record.fromSeq, path: '$.fromSeq' }),
    ],
  })
}

export function parsePublishVersionRequest({ value }: { value: unknown }) {
  return parseFields<PublishVersionRequest>({
    value,
    required: ['seq'],
    optional: ['displayName'],
    check: (record) => [
      ...seqIssue({ value: record.seq, path: '$.seq' }),
      ...textIssue({ value: record.displayName, path: '$.displayName', max: 40 }),
    ],
  })
}

/**
 * Built-in library graphics: valid in documents without an asset row, but
 * only for graphics that actually ship (`src/lib/library-assets.ts`).
 */
export const LIBRARY_ASSET_PREFIX = 'asset_lib_'

/** `asset_lib_*` ids that name no shipped graphic; nothing could draw them. */
export function unknownLibraryReferences({ document }: { document: CanonicalDocument }) {
  const references: Array<{ assetId: string; path: string }> = []

  for (const [panelId, panel] of Object.entries(document.panels)) {
    panel.layers.forEach((layer, index) => {
      if (
        layer.kind === 'image' &&
        layer.assetId.startsWith(LIBRARY_ASSET_PREFIX) &&
        !isLibraryAssetId({ assetId: layer.assetId })
      ) {
        references.push({
          assetId: layer.assetId,
          path: `$.panels.${panelId}.layers[${index}].assetId`,
        })
      }
    })
  }

  return references
}

/**
 * Uploaded assets a document references, with the path of each use, so a
 * save can be refused unless every one is a ready asset of the caller.
 */
export function uploadedAssetReferences({ document }: { document: CanonicalDocument }) {
  const references: Array<{ assetId: string; path: string }> = []

  for (const [panelId, panel] of Object.entries(document.panels)) {
    panel.layers.forEach((layer, index) => {
      if (layer.kind === 'image' && !layer.assetId.startsWith(LIBRARY_ASSET_PREFIX)) {
        references.push({
          assetId: layer.assetId,
          path: `$.panels.${panelId}.layers[${index}].assetId`,
        })
      }
    })
  }

  return references
}
