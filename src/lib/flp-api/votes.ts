import { useSessionStore } from '../auth/session-store.ts'
import { type FlpResult, call } from './client.ts'
import type { VoteState } from './contract.ts'

/**
 * Votes on a published design (V1), one per account. Reading works signed
 * out (the count, never voted); casting and retracting need a session.
 */

const votePath = ({ slug }: { slug: string }) => `public/${encodeURIComponent(slug)}/vote`

export async function getVoteState({
  slug,
  fetchImpl = fetch,
}: {
  slug: string
  fetchImpl?: typeof fetch
}): Promise<FlpResult<VoteState>> {
  if (useSessionStore.getState().status === 'signed-in') {
    return call<VoteState>({ path: votePath({ slug }), fetchImpl })
  }

  try {
    const response = await fetchImpl(`/api/flp/${votePath({ slug })}`)

    if (response.ok) {
      return { ok: true, data: (await response.json()) as VoteState }
    }

    return response.status === 404
      ? { ok: false, code: 'not_found', message: 'This design is not available' }
      : { ok: false, code: 'internal', message: 'Votes could not load' }
  } catch {
    return { ok: false, code: 'network', message: 'Could not reach the server' }
  }
}

export function castVote({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }) {
  return call<VoteState>({ path: votePath({ slug }), method: 'POST', fetchImpl })
}

export function retractVote({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }) {
  return call<VoteState>({ path: votePath({ slug }), method: 'DELETE', fetchImpl })
}

/** What the button shows while a vote is on its way, before the server answers. */
export function optimisticVote({ state }: { state: VoteState }): VoteState {
  return state.voted
    ? { count: Math.max(0, state.count - 1), voted: false }
    : { count: state.count + 1, voted: true }
}

export function voteCountLabel({ count }: { count: number }) {
  return `${count} ${count === 1 ? 'vote' : 'votes'}`
}
