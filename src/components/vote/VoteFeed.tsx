import { Link, useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { cn } from '../../lib/cn'
import type { FeedEntry } from '../../lib/flp-api/publication'
import { VOTE_RULE, getVoteFeed } from '../../lib/flp-api/votes'
import { getBoard } from '../../lib/flp-api/public-read'
import { getGarment, listRailGarments } from '../../lib/garments'
import { ComparePair } from './ComparePair'
import { HowVotesCount } from './HowVotesCount'
import { VoteButton } from '../share/VoteButton'
import { VoteTally } from '../share/VoteTally'
import { GownCredit } from '../editor/GownCredit'
import { buttonClass, chipClass } from '../ui/Button'

type Feed =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; designs: FeedEntry[]; next: string | null; more: 'idle' | 'loading' | 'failed' }

/** Rail order, so the filter chips read the same as the garment rail. */
const RAIL_ORDER: readonly string[] = listRailGarments().map((garment) => garment.id)

/** Garments with designs, in rail order (any garment off the rail goes last). */
function orderGarments(ids: Iterable<string>) {
  const rank = (id: string) => {
    const index = RAIL_ORDER.indexOf(id)
    return index === -1 ? RAIL_ORDER.length : index
  }

  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b))
}

/**
 * Vote: the discover feed. Designs that need votes come first, then the
 * rest, newest first in each (`flp_vote_feed`), so a new design is seen
 * before it has any. Signed in, the viewer's own designs are left out and
 * each card has its own Vote button. The rankings are on /ranking.
 */
export function VoteFeed() {
  const status = useSessionStore((state) => state.status)
  const accountEpoch = useSessionStore((state) => state.accountEpoch)
  const [garmentId, setGarmentId] = useState<string | null>(null)
  const [feed, setFeed] = useState<Feed>({ state: 'loading' })
  // Only garments that have published designs, like Ranking: the board lists
  // every published design, and the feed's own pages add any it missed.
  const [garments, setGarments] = useState<string[]>([])
  // Each read belongs to one account and filter; a late answer is dropped.
  const readId = useRef(0)
  const signedIn = status === 'signed-in'
  const { mode } = useSearch({ from: '/vote' })
  const comparing = mode === 'compare'

  useEffect(() => {
    let cancelled = false

    void getBoard().then((result) => {
      if (!cancelled && result.ok) {
        setGarments((known) => orderGarments([...known, ...result.data.map((design) => design.garmentId)]))
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    const id = ++readId.current
    setFeed({ state: 'loading' })

    void getVoteFeed({ garmentId }).then((result) => {
      if (id === readId.current) {
        setFeed(result.ok ? { state: 'ready', designs: result.data.designs, next: result.data.next, more: 'idle' } : { state: 'failed' })

        if (result.ok) {
          setGarments((known) => orderGarments([...known, ...result.data.designs.map((design) => design.garmentId)]))
        }
      }
    })
  }, [garmentId, status, accountEpoch])

  async function loadMore() {
    if (feed.state !== 'ready' || !feed.next || feed.more === 'loading') {
      return
    }

    const id = readId.current
    const before = feed
    setFeed({ ...before, more: 'loading' })
    const result = await getVoteFeed({ garmentId, cursor: before.next })

    if (id !== readId.current) {
      return
    }

    if (!result.ok) {
      setFeed({ ...before, more: 'failed' })
      return
    }

    // A design whose group changed since the last page may come round again.
    const seen = new Set(before.designs.map((design) => design.slug))
    setFeed({
      state: 'ready',
      designs: [...before.designs, ...result.data.designs.filter((design) => !seen.has(design.slug))],
      next: result.data.next,
      more: 'idle',
    })
  }

  const designs = feed.state === 'ready' ? feed.designs : []

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Fashion Leader Vote</p>
        <h1 className="font-display text-4xl">Vote</h1>
        <p className="max-w-2xl font-body text-sm text-flv-muted">
          Vote for the designs you like. Designs that need votes come first.{' '}
          <Link to="/vote" search={comparing ? {} : { mode: 'compare' }} className="underline">
            {comparing ? 'Back to the list' : 'Compare two'}
          </Link>
        </p>
        <HowVotesCount>
          <li>
            Designs that need votes (fewer than three this week) come first, then the rest, newest first, so new designs
            get seen too.
          </li>
          <li>{VOTE_RULE}</li>
          <li>
            The top designs are on{' '}
            <Link to="/ranking" className="underline">
              Ranking
            </Link>
            .
          </li>
        </HowVotesCount>
        {signedIn ? (
          // Without this, your own design seems to vanish from here (tester pass 3).
          <p data-testid="own-designs-note" className="max-w-2xl font-body text-sm text-flv-muted">
            Your own designs aren’t shown here, since you can’t vote for them. See them and their votes in{' '}
            <Link to="/studio" className="underline">
              My Studio
            </Link>
            .
          </p>
        ) : null}
        {status === 'signed-out' ? (
          <Link
            to="/sign-in"
            search={{ returnTo: '/vote' }}
            className={cn(buttonClass(), 'w-fit')}
          >
            Sign in to vote
          </Link>
        ) : null}
      </header>

      {comparing ? <ComparePair /> : null}

      {comparing || garments.length === 0 ? null : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by garment">
          {[null, ...garments].map((id) => (
            <button
              key={id ?? 'all'}
              type="button"
              aria-pressed={garmentId === id}
              onClick={() => setGarmentId(id)}
              className={chipClass({ selected: garmentId === id })}
            >
              {id ? getGarment({ garmentId: id }).label : 'All garments'}
            </button>
          ))}
        </div>
      )}

      {!comparing && feed.state === 'loading' ? <p className="font-body text-sm text-flv-muted">Loading designs…</p> : null}
      {!comparing && feed.state === 'failed' ? (
        <p className="font-body text-sm text-flv-muted">The designs aren’t available right now. Try again shortly.</p>
      ) : null}
      {!comparing && feed.state === 'ready' && designs.length === 0 ? (
        <p className="font-body text-sm text-flv-muted">
          {garmentId ? 'No designs on this garment to vote on yet.' : 'No designs to vote on yet.'} Publish one from{' '}
          <Link to="/studio" className="underline">
            My Studio
          </Link>
          .
        </p>
      ) : null}

      {comparing ? null : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {designs.map((design, index) => (
          <li key={design.slug} className="flv-panel flex flex-col gap-3 p-4">
            <Link to="/s/$slug" params={{ slug: design.slug }} className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-xl border border-flv-line bg-flv-soft">
                {design.needsVotes ? (
                  <span className="absolute top-2 left-2 z-10 rounded-full bg-flv-accent px-2.5 py-1 font-body text-xs font-medium text-white">
                    Needs votes
                  </span>
                ) : null}
                <img
                  src={design.image}
                  alt={`${design.title}, front view`}
                  loading={index < 3 ? 'eager' : 'lazy'}
                  className="aspect-[3/4] w-full object-contain"
                />
              </div>
              <h2 className="font-display text-2xl text-flv-ink [overflow-wrap:anywhere]">{design.title}</h2>
              <p className="font-body text-sm text-flv-muted">
                {design.displayName && !design.ownerHandle ? `By ${design.displayName} · ` : ''}
                {getGarment({ garmentId: design.garmentId }).label}
              </p>
            </Link>
            {design.ownerHandle ? (
              <Link
                to="/u/$handle"
                params={{ handle: design.ownerHandle }}
                className="font-body text-sm text-flv-muted underline-offset-2 hover:text-flv-accent hover:underline"
              >
                By {design.displayName ?? `@${design.ownerHandle}`}
              </Link>
            ) : null}
            <GownCredit garmentId={design.garmentId} />
            {signedIn ? (
              <VoteButton
                // A new account is a new button: "voted" belongs to one account.
                key={accountEpoch}
                slug={design.slug}
                initial={{
                  count: design.votes,
                  voted: design.voted,
                  pending: design.pending,
                  ...(design.countsFrom ? { countsFrom: design.countsFrom } : {}),
                  ...(design.votesCountFrom ? { votesCountFrom: design.votesCountFrom } : {}),
                }}
              />
            ) : (
              <p className="font-body text-sm text-flv-muted">
                <VoteTally count={design.votes} pending={design.pending} />
              </p>
            )}
          </li>
        ))}
      </ul>}

      {!comparing && feed.state === 'ready' && feed.next ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={feed.more === 'loading'}
            onClick={() => void loadMore()}
            className={buttonClass({ variant: 'secondary' })}
          >
            {feed.more === 'loading' ? 'Loading…' : 'Load more'}
          </button>
          {feed.more === 'failed' ? (
            <p role="status" className="font-body text-xs text-flv-accent">
              More designs could not load. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
