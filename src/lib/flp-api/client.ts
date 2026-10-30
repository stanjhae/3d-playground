import type { CanonicalDocument } from '../canonical-document.ts'
import {
  accountGuard,
  applySession,
  signOut,
  useSessionStore,
  waitForSession,
} from '../auth/session-store.ts'
import { getSupabaseClient } from '../auth/supabase-client.ts'
import type { ImageRejectReason } from '../image-validate.ts'
import type {
  ApiErrorCode,
  CreateDesignRequest,
  DesignDetails,
  ProfileResponse,
  RestoreVersionRequest,
  PublicationResponse,
  SaveVersionRequest,
  UpdateDesignRequest,
  VersionDetail,
  VersionPage,
  VersionResponse,
} from './contract.ts'
import type { OwnerPublication, PublicDesign, PublicRenderKind } from './publication.ts'

/**
 * Browser calls to `/api/flp/*` (S03 #172). Each call carries the current
 * access token and is dropped as `account-changed` if the account changes
 * before it settles, so account A's response never reaches account B.
 */

export type DesignSummary = {
  id: string
  title: string
  visibility: 'private' | 'published'
  headSeq: number | null
  updatedAt: string
}

export type DesignWithHead = DesignSummary & {
  head: {
    seq: number
    kind: VersionResponse['kind']
    content: CanonicalDocument
    contentHash: string
    createdAt: string
  } | null
}

export type FlpResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      code: ApiErrorCode | 'account-changed' | 'network' | 'internal'
      message: string
      headSeq?: number | null
      /** Seconds to wait after `rate_limited` (Q02 #187). */
      retryAfter?: number
      /** Why an uploaded image was rejected (S02 #171). */
      reason?: ImageRejectReason
    }

/** A fresh access token for the same account, or null after signing out. */
async function renewOrEnd(): Promise<string | null> {
  const client = getSupabaseClient()

  if (!client) {
    return null
  }

  const { data, error } = await client.auth.refreshSession()

  if (!error && data.session) {
    applySession({ session: data.session })
    return data.session.access_token
  }

  await signOut({ client })
  return null
}

export async function call<T>({
  path,
  method = 'GET',
  body,
  fetchImpl = fetch,
}: {
  path: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  fetchImpl?: typeof fetch
}): Promise<FlpResult<T>> {
  // A call made while the stored session is still loading (e.g. on a page
  // that renders before its route guard) waits for it instead of failing.
  if (useSessionStore.getState().status === 'loading') {
    await waitForSession({ client: getSupabaseClient() })
  }

  const stillSameAccount = accountGuard()
  const token = useSessionStore.getState().accessToken

  if (!token) {
    return { ok: false, code: 'unauthenticated', message: 'Sign in required' }
  }

  const send = (bearer: string) =>
    fetchImpl(`/api/flp/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  let response: Response

  try {
    response = await send(token)

    // The server no longer accepts this session (expired, revoked, or the
    // account was deleted): renew it once, or end it so the route guards
    // send the person to sign-in instead of leaving them stuck.
    if (response.status === 401 && stillSameAccount()) {
      const renewed = await renewOrEnd()

      if (!renewed) {
        return { ok: false, code: 'unauthenticated', message: 'Sign in required' }
      }

      response = await send(renewed)
    }
  } catch {
    return stillSameAccount()
      ? { ok: false, code: 'network', message: 'Could not reach the server' }
      : { ok: false, code: 'account-changed', message: 'Account changed' }
  }

  const payload = (response.status === 204 ? null : await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | {
        error?: {
          code?: string
          message?: string
          headSeq?: number | null
          reason?: ImageRejectReason
        }
      }
    | null

  if (!stillSameAccount()) {
    return { ok: false, code: 'account-changed', message: 'Account changed' }
  }

  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : undefined

    return {
      ok: false,
      code: (error?.code as ApiErrorCode | undefined) ?? 'internal',
      message: error?.message ?? 'Something went wrong',
      ...(error && 'headSeq' in error ? { headSeq: error.headSeq } : {}),
      ...(error?.reason ? { reason: error.reason } : {}),
      ...(response.status === 429
        ? { retryAfter: Number(response.headers.get('retry-after')) || 5 }
        : {}),
    }
  }

  return { ok: true, data: payload as T }
}

export function listOwnedDesigns({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  return call<{ designs: DesignSummary[] }>({ path: 'designs', fetchImpl })
}

export function getOwnedDesign({
  designId,
  fetchImpl,
}: {
  designId: string
  fetchImpl?: typeof fetch
}) {
  return call<DesignWithHead>({ path: `designs/${designId}`, fetchImpl })
}

export function createOwnedDesign({
  request,
  fetchImpl,
}: {
  request: CreateDesignRequest
  fetchImpl?: typeof fetch
}) {
  return call<VersionResponse>({ path: 'designs', method: 'POST', body: request, fetchImpl })
}

export function saveDesignVersion({
  designId,
  request,
  fetchImpl,
}: {
  designId: string
  request: SaveVersionRequest
  fetchImpl?: typeof fetch
}) {
  return call<VersionResponse>({
    path: `designs/${designId}/versions`,
    method: 'POST',
    body: request,
    fetchImpl,
  })
}

export function restoreDesignVersion({
  designId,
  request,
  fetchImpl,
}: {
  designId: string
  request: RestoreVersionRequest
  fetchImpl?: typeof fetch
}) {
  return call<VersionResponse>({
    path: `designs/${designId}/restore`,
    method: 'POST',
    body: request,
    fetchImpl,
  })
}

/** Rename or describe a design (A06 #150); not a new version. */
export function updateDesign({
  designId,
  request,
  fetchImpl,
}: {
  designId: string
  request: UpdateDesignRequest
  fetchImpl?: typeof fetch
}) {
  return call<DesignDetails>({ path: `designs/${designId}`, method: 'PATCH', body: request, fetchImpl })
}

/** Delete a design, its history and any publication (A07 #151). */
export function deleteDesign({ designId, fetchImpl }: { designId: string; fetchImpl?: typeof fetch }) {
  return call<null>({ path: `designs/${designId}`, method: 'DELETE', fetchImpl })
}

/** The name the account shows on published designs (A06 #150). */
export function getProfile({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  return call<ProfileResponse>({ path: 'profile', fetchImpl })
}

export function setDisplayName({
  displayName,
  fetchImpl,
}: {
  displayName: string | null
  fetchImpl?: typeof fetch
}) {
  return call<ProfileResponse>({ path: 'profile', method: 'POST', body: { displayName }, fetchImpl })
}

/** Publication state for the owner (P03 #181). */
export function getPublication({ designId, fetchImpl }: { designId: string; fetchImpl?: typeof fetch }) {
  return call<{ publication: OwnerPublication | null }>({ path: `designs/${designId}/publication`, fetchImpl })
}

/** Upload the views of one saved version (P02 #180). Data is base64 JPEG/PNG. */
export function uploadRenders({
  designId,
  seq,
  renders,
  fetchImpl,
}: {
  designId: string
  seq: number
  renders: Array<{ kind: PublicRenderKind; data: string }>
  fetchImpl?: typeof fetch
}) {
  return call<{ seq: number; kinds: PublicRenderKind[] }>({
    path: `designs/${designId}/renders`,
    method: 'POST',
    body: { seq, renders },
    fetchImpl,
  })
}

export function publishDesign({
  designId,
  seq,
  displayName,
  fetchImpl,
}: {
  designId: string
  seq: number
  displayName?: string
  fetchImpl?: typeof fetch
}) {
  return call<PublicationResponse>({
    path: `designs/${designId}/publication`,
    method: 'POST',
    body: displayName ? { seq, displayName } : { seq },
    fetchImpl,
  })
}

export function unpublishDesign({ designId, fetchImpl }: { designId: string; fetchImpl?: typeof fetch }) {
  return call<null>({ path: `designs/${designId}/publication`, method: 'DELETE', fetchImpl })
}

/** Anonymous read of a published design (P04 #182); no session needed. */
export async function getPublicDesign({
  slug,
  fetchImpl = fetch,
}: {
  slug: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; data: PublicDesign } | { ok: false; code: 'not_found' | 'network' }> {
  try {
    const response = await fetchImpl(`/api/flp/public/${encodeURIComponent(slug)}`)
    return response.ok
      ? { ok: true, data: (await response.json()) as PublicDesign }
      : { ok: false, code: 'not_found' }
  } catch {
    return { ok: false, code: 'network' }
  }
}

/** One newest-first page of a design's history (S07 #176). */
export function listDesignVersions({
  designId,
  before = null,
  limit,
  fetchImpl,
}: {
  designId: string
  before?: number | null
  limit?: number
  fetchImpl?: typeof fetch
}) {
  const params = new URLSearchParams()

  if (before !== null) {
    params.set('before', String(before))
  }

  if (limit !== undefined) {
    params.set('limit', String(limit))
  }

  const query = params.toString()
  return call<VersionPage>({
    path: `designs/${designId}/versions${query ? `?${query}` : ''}`,
    fetchImpl,
  })
}

/** One version's content, for read-only preview (S07 #176). */
export function getDesignVersion({
  designId,
  seq,
  fetchImpl,
}: {
  designId: string
  seq: number
  fetchImpl?: typeof fetch
}) {
  return call<VersionDetail>({ path: `designs/${designId}/versions/${seq}`, fetchImpl })
}
