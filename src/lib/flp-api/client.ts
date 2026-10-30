import type { CanonicalDocument } from '../canonical-document.ts'
import { accountGuard, useSessionStore } from '../auth/session-store.ts'
import type {
  ApiErrorCode,
  CreateDesignRequest,
  RestoreVersionRequest,
  SaveVersionRequest,
  VersionResponse,
} from './contract.ts'

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
    }

async function call<T>({
  path,
  method = 'GET',
  body,
  fetchImpl = fetch,
}: {
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
  fetchImpl?: typeof fetch
}): Promise<FlpResult<T>> {
  const stillSameAccount = accountGuard()
  const token = useSessionStore.getState().accessToken

  if (!token) {
    return { ok: false, code: 'unauthenticated', message: 'Sign in required' }
  }

  let response: Response

  try {
    response = await fetchImpl(`/api/flp/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    return stillSameAccount()
      ? { ok: false, code: 'network', message: 'Could not reach the server' }
      : { ok: false, code: 'account-changed', message: 'Account changed' }
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error?: { code?: string; message?: string; headSeq?: number | null } }
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
