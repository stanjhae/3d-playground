import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { cn } from '../../lib/cn'
import type { FeedEntry } from '../../lib/flp-api/publication'
import { getVoteFeed, voteCountLabel } from '../../lib/flp-api/votes'
import { getGarment, listRailGarments } from '../../lib/garments'
import { templateForGarment } from '../../lib/template-manifest'
import { VoteButton } from '../share/VoteButton'
import { GownCredit } from '../editor/GownCredit'

type Feed =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; designs: FeedEntry[]; next: string | null; more: 'idle' | 'loading' | 'failed' }

/** The garments a design can be published on: each has a template. */
const FEED_GARMENTS = listRailGarments().filter((garment) => templateForGarment({ garmentId: garment.id }))

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
  // Each read belongs to one account and filter; a late answer is dropped.
  const readId = useRef(0)
  const signedIn = status === 'signed-in'

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    const id = ++readId.current
    setFeed({ state: 'loading' })

    void getVoteFeed({ garmentId }).then((result) => {
      if (id === readId.current) {
        setFeed(result.ok ? { state: 'ready', designs: result.data.designs, next: result.data.next, more: 'idle' } : { state: 'failed' })
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
          Discover designs and vote for the ones you like. Designs that need votes come first (fewer than three
          this week), then the rest, newest first, so new designs get seen too. The top designs are on{' '}
          <Link to="/ranking" className="underline">
            Ranking
          </Link>
          .
        </p>
        {status === 'signed-out' ? (
          <Link
            to="/sign-in"
            search={{ returnTo: '/vote' }}
            className="inline-flex min-h-11 w-fit items-center border border-flv-line px-4 font-body text-xs tracking-[0.1em] uppercase hover:border-flv-accent hover:text-flv-accent"
          >
            Sign in to vote
          </Link>
        ) : null}
      </header>

      {FEED_GARMENTS.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by garment">
          {[null, ...FEED_GARMENTS.map((garment) => garment.id)].map((id) => (
            <button
              key={id ?? 'all'}
              type="button"
              aria-pressed={garmentId === id}
              onClick={() => setGarmentId(id)}
              className={cn('min-h-9 rounded-full border px-3 font-body text-xs tracking-[0.08em] uppercase', {
                'border-flv-accent text-flv-accent': garmentId === id,
                'border-flv-line text-flv-muted hover:text-flv-accent': garmentId !== id,
              })}
            >
              {id ? getGarment({ garmentId: id }).label : 'All garments'}
            </button>
          ))}
        </div>
      ) : null}

      {feed.state === 'loading' ? <p className="font-body text-sm text-flv-muted">Loading designs…</p> : null}
      {feed.state === 'failed' ? (
        <p className="font-body text-sm text-flv-muted">The designs aren’t available right now. Try again shortly.</p>
      ) : null}
      {feed.state === 'ready' && designs.length === 0 ? (
        <p className="font-body text-sm text-flv-muted">
          {garmentId ? 'No designs on this garment to vote on yet.' : 'No designs to vote on yet.'} Publish one from{' '}
          <Link to="/studio" className="underline">
            My Studio
          </Link>
          .
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  ...(design.countsFrom ? { countsFrom: design.countsFrom } : {}),
                }}
              />
            ) : (
              <p data-testid="vote-count" className="font-body text-sm text-flv-muted">
                {voteCountLabel({ count: design.votes })}
              </p>
            )}
          </li>
        ))}
      </ul>

      {feed.state === 'ready' && feed.next ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={feed.more === 'loading'}
            onClick={() => void loadMore()}
            className="inline-flex min-h-11 items-center border border-flv-ink px-5 font-body text-xs tracking-[0.1em] uppercase hover:bg-flv-soft disabled:opacity-60"
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
