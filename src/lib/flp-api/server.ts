import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import type { ContentHash } from '../canonical-hash.ts'
import {
  type ApiError,
  MAX_CONTENT_BYTES,
  type VersionResponse,
  apiError,
  apiErrorFromDatabase,
  parseCreateDesignRequest,
  parseRestoreVersionRequest,
  parseSaveVersionRequest,
  prepareContent,
} from './contract.ts'

/**
 * FLP design API (S03 #172) behind `/api/flp/*`. The server is the trust
 * boundary (docs/data-model.md):
 * - the owner comes from a JWT verified with Supabase Auth, never the body;
 * - reads run as that user, so RLS applies even if a filter is wrong;
 * - writes call the service-role `flp_*` functions with re-validated,
 *   re-hashed content.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_BODY_BYTES = MAX_CONTENT_BYTES * 2

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

  if (collection !== 'designs' || rest.length > 0 || (designId && !UUID.test(designId))) {
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
