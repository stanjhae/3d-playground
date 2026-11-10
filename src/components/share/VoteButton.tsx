import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { cn } from '../../lib/cn'
import type { VoteState } from '../../lib/flp-api/contract'
import { castVote, getVoteState, optimisticVote, retractVote, voteCountLabel } from '../../lib/flp-api/votes'

const controlClass =
  'inline-flex min-h-11 items-center justify-center gap-2 border px-4 font-body text-xs tracking-[0.1em] uppercase disabled:opacity-60'

/**
 * One vote per account on a published design (V1). Signed out, the count
 * shows with a way to sign in and come back here. The count is read apart
 * from the (cached) share page, so it is current.
 */
export function VoteButton({ slug }: { slug: string }) {
  const status = useSessionStore((state) => state.status)
  const accountEpoch = useSessionStore((state) => state.accountEpoch)
  const [vote, setVote] = useState<VoteState | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  // Re-read when the account changes: "voted" belongs to one account.
  useEffect(() => {
    if (status === 'loading') {
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
  }, [slug, status, accountEpoch])

  async function toggle() {
    if (!vote || pendingRef.current) {
      return
    }

    const before = vote
    pendingRef.current = true
    setPending(true)
    setError(null)
    setVote(optimisticVote({ state: before }))

    const result = before.voted ? await retractVote({ slug }) : await castVote({ slug })

    pendingRef.current = false
    setPending(false)

    if (result.ok) {
      setVote(result.data)
    } else if (result.code !== 'account-changed') {
      setVote(before)
      setError(before.voted ? `Your vote was not removed. ${result.message}` : `Your vote was not counted. ${result.message}`)
    }
  }

  const count = vote ? (
    <span className="font-body text-sm text-flv-muted" data-testid="vote-count">
      {voteCountLabel({ count: vote.count })}
    </span>
  ) : null

  if (status === 'signed-out') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/sign-in"
          search={{ returnTo: `/s/${slug}` }}
          className={cn(controlClass, 'border-flv-line hover:border-flv-accent hover:text-flv-accent')}
        >
          Sign in to vote
        </Link>
        {count}
      </div>
    )
  }

  if (status !== 'signed-in' || !vote) {
    return count
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-pressed={vote.voted}
          disabled={pending}
          onClick={() => void toggle()}
          className={cn(controlClass, {
            'border-flv-accent bg-flv-accent text-white': vote.voted,
            'border-flv-accent text-flv-accent hover:bg-flv-soft': !vote.voted,
          })}
        >
          {vote.voted ? 'Voted' : 'Vote'}
        </button>
        {count}
      </div>
      <p role="status" className={error ? 'font-body text-xs text-flv-accent' : 'sr-only'}>
        {error ?? ''}
      </p>
    </div>
  )
}
