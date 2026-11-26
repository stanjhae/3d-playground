import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { acceptTerms } from '../../lib/flp-api/client'
import type { VoteState } from '../../lib/flp-api/contract'
import { UNPUBLISHED_VOTES, VOTE_RULE, castVote, getVoteState, optimisticVote, retractVote, voteCountsLater } from '../../lib/flp-api/votes'
import { voteDeviceId } from '../../lib/vote-device'
import { TERMS_VERSION } from '../../lib/terms'
import { buttonClass } from '../ui/Button'
import { FeedbackPanel } from './FeedbackPanel'
import { VoteTally } from './VoteTally'

// Vote is the primary action on a design; once cast, Voted steps back to a
// secondary with a tick (pressing it again takes the vote back).
const primaryClass = buttonClass()
const secondaryClass = buttonClass({ variant: 'secondary' })

/**
 * One vote per account on a published design (V1). Signed out, the count
 * shows with a way to sign in and come back here. The count is read apart
 * from the (cached) share page, so it is current.
 *
 * `initial` is a state the caller already read for this account (the Vote
 * feed's rows say whether the viewer voted), so no request is made for it;
 * the caller remounts the button when the account changes.
 *
 * The count is counted votes only, with held ones (new accounts') beside
 * it. On the owner's own design there's no voting: the button says so.
 * `explain` adds the rule in words under the count (the share page).
 */
export function VoteButton({ slug, initial, explain = false }: { slug: string; initial?: VoteState; explain?: boolean }) {
  const status = useSessionStore((state) => state.status)
  const accountEpoch = useSessionStore((state) => state.accountEpoch)
  const [vote, setVote] = useState<VoteState | null>(initial ?? null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Voting asks for the terms once, like the studio (P1).
  const [needsTerms, setNeedsTerms] = useState(false)
  const pendingRef = useRef(false)
  const preloaded = initial !== undefined

  // Re-read when the account changes: "voted" belongs to one account.
  useEffect(() => {
    if (status === 'loading' || preloaded) {
      return
    }

    let cancelled = false
    setError(null)

    void getVoteState({ slug }).then((result) => {
      if (!cancelled) {
        setVote(result.ok ? result.data : null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [slug, status, accountEpoch, preloaded])

  async function toggle() {
    if (!vote || vote.own || pendingRef.current) {
      return
    }

    const before = vote
    pendingRef.current = true
    setPending(true)
    setError(null)
    setVote(optimisticVote({ state: before }))

    const result = before.voted
      ? await retractVote({ slug })
      : await castVote({
          slug,
          deviceId: voteDeviceId({ storage: typeof localStorage === 'undefined' ? null : localStorage }),
        })

    pendingRef.current = false
    setPending(false)

    if (result.ok) {
      setVote(result.data)
    } else if (result.code === 'terms_required') {
      setVote(before)
      setNeedsTerms(true)
    } else if (result.code === 'own_design') {
      setVote(before)
      setError('You can’t vote for your own design.')
    } else if (result.code === 'not_found') {
      // Unpublished meanwhile: votes are kept but shown nowhere until it's back (docs/abuse.md).
      setVote(before)
      setError(UNPUBLISHED_VOTES)
    } else if (result.code !== 'account-changed') {
      setVote(before)
      setError(before.voted ? `Your vote was not removed. ${result.message}` : `Your vote was not counted. ${result.message}`)
    }
  }

  async function acceptAndVote() {
    pendingRef.current = true
    setPending(true)
    const accepted = await acceptTerms({ version: TERMS_VERSION })
    pendingRef.current = false
    setPending(false)

    if (accepted.ok) {
      setNeedsTerms(false)
      await toggle()
    } else if (accepted.code !== 'account-changed') {
      setError(`The terms were not accepted. ${accepted.message}`)
    }
  }

  const count = vote ? (
    <span className="font-body text-sm text-flv-muted">
      <VoteTally count={vote.count} pending={vote.pending ?? 0} />
    </span>
  ) : null
  const rule = explain ? <p className="max-w-xs font-body text-xs text-flv-muted">{VOTE_RULE}</p> : null

  if (status === 'signed-out') {
    return (
      <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/sign-in"
          search={{ returnTo: `/s/${slug}` }}
          className={primaryClass}
        >
          Sign in to vote
        </Link>
        {count}
      </div>
      {rule}
      </div>
    )
  }

  if (status !== 'signed-in' || !vote) {
    return count
  }

  if (vote.own) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            title="You can’t vote for your own design"
            className={secondaryClass}
          >
            Your design
          </button>
          {count}
        </div>
        <p className="max-w-xs font-body text-xs text-flv-muted">You can’t vote for your own design.</p>
        {rule}
        <FeedbackPanel slug={slug} voted={false} own />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={vote.voted}
          disabled={pending}
          onClick={() => void toggle()}
          className={vote.voted ? secondaryClass : primaryClass}
        >
          {vote.voted ? <Check aria-hidden className="size-4 text-flv-accent" /> : null}
          {vote.voted ? 'Voted' : 'Vote'}
        </button>
        {count}
      </div>
      {needsTerms ? (
        <div className="flex flex-wrap items-center gap-2 font-body text-xs text-flv-ink">
          <span>
            To vote, accept the{' '}
            <Link to="/terms" className="underline" target="_blank">
              terms of use
            </Link>
            .
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => void acceptAndVote()}
            className={primaryClass}
          >
            Accept and vote
          </button>
        </div>
      ) : null}
      {vote.countsFrom ? (
        <p className="max-w-xs font-body text-xs text-flv-muted">{voteCountsLater({ countsFrom: vote.countsFrom })}</p>
      ) : (
        rule
      )}
      <p role="status" className={error ? 'font-body text-xs text-flv-accent' : 'sr-only'}>
        {error ?? ''}
      </p>
      <FeedbackPanel slug={slug} voted={vote.voted} own={false} />
    </div>
  )
}
