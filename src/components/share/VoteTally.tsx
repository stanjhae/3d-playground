import { VOTE_RULE, pendingVoteLabel, voteCountLabel } from '../../lib/flp-api/votes'

/**
 * A design's vote count, the same everywhere (share page, My Studio,
 * Ranking, Vote): the counted number, read from the database, with the
 * votes kept but not counted yet beside it, and the rule on hover.
 */
export function VoteTally({ count, pending = 0, suffix = '' }: { count: number; pending?: number; suffix?: string }) {
  const held = pendingVoteLabel({ pending })

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" title={VOTE_RULE}>
      {/* Read from the database, not claimed (docs/claims-audit.md). */}
      <span data-testid="vote-count">
        {voteCountLabel({ count })}
        {suffix}
      </span>
      {held ? (
        <span data-testid="vote-pending" className="text-xs text-flv-muted">
          {held}
        </span>
      ) : null}
    </span>
  )
}
