import { call, publicRead } from './flp-api/client.ts'
import type { DesignComment, FollowState } from './flp-api/contract.ts'
import type { BoardEntry } from './flp-api/publication.ts'

/**
 * Comments and follows: off unless the build sets `VITE_COMMUNITY=true`
 * (and the server `FLP_COMMUNITY=true`). See docs/decisions.md.
 */
export const COMMUNITY = import.meta.env.VITE_COMMUNITY === 'true'

const commentsPath = ({ slug }: { slug: string }) => `public/${encodeURIComponent(slug)}/comments`
const followPath = ({ handle }: { handle: string }) => `public/u/${encodeURIComponent(handle)}/follow`

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
