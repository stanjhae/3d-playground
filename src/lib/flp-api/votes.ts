import { type FlpResult, call, publicRead } from './client.ts'
import type { VoteState } from './contract.ts'
import type { ComparisonPair, VoteFeedPage } from './publication.ts'

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

export function castVote({
  slug,
  deviceId,
  fetchImpl,
}: {
  slug: string
  deviceId?: string | null
  fetchImpl?: typeof fetch
}) {
  return call<VoteState>({
    path: votePath({ slug }),
    method: 'POST',
    ...(deviceId ? { body: { deviceId } } : {}),
    fetchImpl,
  })
}

export function retractVote({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }) {
  return call<VoteState>({ path: votePath({ slug }), method: 'DELETE', fetchImpl })
}

/**
 * What the button shows while a vote is on its way, before the server
 * answers. The count is only ever counted votes: a vote from an account
 * whose votes don't count yet (`votesCountFrom`) goes to `pending`, and
 * taking back a held vote (`countsFrom`) takes it from there. The server's
 * answer corrects any guess.
 */
export function optimisticVote({ state }: { state: VoteState }): VoteState {
  const { countsFrom, ...rest } = state
  const pending = state.pending ?? 0

  if (state.voted) {
    return countsFrom
      ? { ...rest, pending: Math.max(0, pending - 1), voted: false }
      : { ...rest, count: Math.max(0, state.count - 1), voted: false }
  }

  if (state.votesCountFrom && Date.parse(state.votesCountFrom) > Date.now()) {
    return { ...rest, pending: pending + 1, voted: true, countsFrom: state.votesCountFrom }
  }

  return { ...rest, count: state.count + 1, voted: true }
}

/** Says when a new account's vote starts counting (docs/abuse.md). */
export function voteCountsLater({ countsFrom, now = new Date() }: { countsFrom: string; now?: Date }) {
  const hours = Math.max(1, Math.ceil((Date.parse(countsFrom) - now.getTime()) / 3_600_000))
  return `Your vote is saved. It counts once your account is a day old, in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`
}

export function voteCountLabel({ count }: { count: number }) {
  return `${count} ${count === 1 ? 'vote' : 'votes'}`
}

/**
 * The rule behind every count, said wherever one shows (share page, My
 * Studio, Ranking, Vote): the count is counted votes only.
 */
export const VOTE_RULE = 'Only votes from accounts more than a day old count. A newer account’s vote is kept and counts within 24 hours.'

/** How ties rank on Ranking, said on the page and on each Tied marker. */
export const TIE_RULE =
  'Designs with the same head-to-head score and the same number of votes share a rank, shown as =3, and the next rank skips (1, 2, 2, 4). Within a tie, the newest design is listed first. With no head-to-head picks yet, the score is the same for every design, so the order is the vote count.'

/** The same rule in a few words, where there's little room (a My Studio card). */
export const VOTE_RULE_SHORT = 'Only votes from accounts over a day old count.'

/** Held votes, said next to the count: "+1 pending (counts within 24 h)". */
export function pendingVoteLabel({ pending }: { pending: number }) {
  return pending > 0 ? `+${pending} pending (counts within 24 h)` : null
}

/**
 * One page of the Vote feed (`/vote`). Signed in, the session goes with it,
 * so the viewer's own designs are left out and each card knows its vote.
 */
export function getComparison({ fetchImpl }: { fetchImpl?: typeof fetch } = {}): Promise<FlpResult<{ pair: ComparisonPair | null }>> {
  return call<{ pair: ComparisonPair | null }>({ path: 'public/compare', fetchImpl })
}

export function chooseComparison({
  left,
  right,
  chosen,
  fetchImpl,
}: {
  left: string
  right: string
  chosen: string
  fetchImpl?: typeof fetch
}) {
  return call<{ pair: ComparisonPair | null }>({ path: 'public/compare', method: 'POST', body: { left, right, chosen }, fetchImpl })
}

export function getVoteFeed({
  garmentId = null,
  cursor = null,
  fetchImpl,
}: {
  garmentId?: string | null
  cursor?: string | null
  fetchImpl?: typeof fetch
} = {}): Promise<FlpResult<VoteFeedPage>> {
  const query = new URLSearchParams()

  if (garmentId) query.set('garment', garmentId)
  if (cursor) query.set('cursor', cursor)

  return publicRead<VoteFeedPage>({
    path: `public/feed${query.size ? `?${query}` : ''}`,
    fetchImpl,
    failed: 'The designs could not load',
  })
}

/**
 * What a vote shows once its design is unpublished: nothing anywhere (the
 * share page is gone, it leaves Ranking and Vote, My Studio shows no count),
 * but every vote is kept and comes back if it is published again. A button
 * left open on a page says so when used (docs/abuse.md).
 */
export const UNPUBLISHED_VOTES = 'This design isn’t published any more. Its votes are kept and come back if it’s published again.'
