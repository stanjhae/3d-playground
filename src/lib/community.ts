import { useSessionStore } from './auth/session-store.ts'
import { type FlpResult, call } from './flp-api/client.ts'
import type { DesignComment, FollowState } from './flp-api/contract.ts'
import type { BoardEntry } from './flp-api/publication.ts'

/**
 * Comments and follows: off unless the build sets `VITE_COMMUNITY=true`
 * (and the server `FLP_COMMUNITY=true`). See docs/decisions.md.
 */
export const COMMUNITY = import.meta.env.VITE_COMMUNITY === 'true'

const commentsPath = ({ slug }: { slug: string }) => `public/${encodeURIComponent(slug)}/comments`
const followPath = ({ handle }: { handle: string }) => `public/u/${encodeURIComponent(handle)}/follow`

/** Reads without a session when signed out, so the page never asks to sign in to read. */
async function publicRead<T>({ path, fetchImpl = fetch }: { path: string; fetchImpl?: typeof fetch }): Promise<FlpResult<T>> {
  if (useSessionStore.getState().status === 'signed-in') {
    return call<T>({ path, fetchImpl })
  }

  try {
    const response = await fetchImpl(`/api/flp/${path}`)

    if (response.ok) {
      return { ok: true, data: (await response.json()) as T }
    }

    return response.status === 404
      ? { ok: false, code: 'not_found', message: 'This isn’t available' }
      : { ok: false, code: 'internal', message: 'This could not load' }
  } catch {
    return { ok: false, code: 'network', message: 'Could not reach the server' }
  }
}

export function getComments({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }) {
  return publicRead<{ comments: DesignComment[] }>({ path: commentsPath({ slug }), fetchImpl })
}

export function addComment({ slug, body, fetchImpl }: { slug: string; body: string; fetchImpl?: typeof fetch }) {
  return call<{ comments: DesignComment[] }>({ path: commentsPath({ slug }), method: 'POST', body: { body }, fetchImpl })
}

export function hideComment({ slug, commentId, fetchImpl }: { slug: string; commentId: string; fetchImpl?: typeof fetch }) {
  return call<{ comments: DesignComment[] }>({
    path: `${commentsPath({ slug })}/${encodeURIComponent(commentId)}`,
    method: 'DELETE',
    fetchImpl,
  })
}

export function getFollowState({ handle, fetchImpl }: { handle: string; fetchImpl?: typeof fetch }) {
  return publicRead<FollowState>({ path: followPath({ handle }), fetchImpl })
}

export function setFollow({ handle, follow, fetchImpl }: { handle: string; follow: boolean; fetchImpl?: typeof fetch }) {
  return call<FollowState>({ path: followPath({ handle }), method: follow ? 'POST' : 'DELETE', fetchImpl })
}

export function getFollowingBoard({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  return call<{ designs: BoardEntry[] }>({ path: 'public/following', fetchImpl })
}

export function followerLabel({ count }: { count: number }) {
  return `${count} ${count === 1 ? 'follower' : 'followers'}`
}
