import { type FlpResult, call, publicRead } from './client.ts'
import type { VoteState } from './contract.ts'

/**
 * Votes on a published design (V1), one per account. Reading works signed
 * out (the count, never voted); casting and retracting need a session.
 */

const votePath = ({ slug }: { slug: string }) => `public/${encodeURIComponent(slug)}/vote`

export function getVoteState({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }): Promise<FlpResult<VoteState>> {
  return publicRead<VoteState>({
    path: votePath({ slug }),
    fetchImpl,
    notFound: 'This design is not available',
    failed: 'Votes could not load',
  })
}

export function castVote({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }) {
  return call<VoteState>({ path: votePath({ slug }), method: 'POST', fetchImpl })
}

export function retractVote({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }) {
  return call<VoteState>({ path: votePath({ slug }), method: 'DELETE', fetchImpl })
}

/**
 * What the button shows while a vote is on its way, before the server
 * answers. A held vote (a new account's) never moved the count, so taking
 * it back doesn't either; the server's answer corrects any guess.
 */
export function optimisticVote({ state }: { state: VoteState }): VoteState {
  if (state.voted) {
    return { count: state.countsFrom ? state.count : Math.max(0, state.count - 1), voted: false }
  }

  return { count: state.count + 1, voted: true }
}

/** Says when a new account's vote starts counting (docs/abuse.md). */
export function voteCountsLater({ countsFrom, now = new Date() }: { countsFrom: string; now?: Date }) {
  const hours = Math.max(1, Math.ceil((Date.parse(countsFrom) - now.getTime()) / 3_600_000))
  return `Your vote is saved. It counts once your account is a day old, in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`
}

export function voteCountLabel({ count }: { count: number }) {
  return `${count} ${count === 1 ? 'vote' : 'votes'}`
}
