import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { cn } from '../../lib/cn'
import { COMMUNITY, getFollowingBoard } from '../../lib/community'
import { BOARD_WINDOWS, type BoardWindow } from '../../lib/flp-api/contract'
import { getBoard } from '../../lib/flp-api/public-read'
import type { BoardEntry } from '../../lib/flp-api/publication'
import { tieLabel } from '../../lib/flp-api/compare'
import { TIE_RULE, VOTE_RULE } from '../../lib/flp-api/votes'
import { BOARD_WINDOW_LABEL } from '../../lib/board-view'
import { getGarment } from '../../lib/garments'
import { GownCredit } from '../editor/GownCredit'
import { VoteTally } from '../share/VoteTally'
import { chipClass } from '../ui/Button'
import { HowVotesCount } from './HowVotesCount'

type Load = { state: 'loading' } | { state: 'ready'; designs: BoardEntry[] } | { state: 'failed' }

/**
 * Ranking (V2): every published design, ranked by counted votes this week,
 * this month or of all time, and within one garment when filtered. Each card
 * opens the design's share page. Finding designs to vote on is Vote (/vote).
 */
export function PublicationBoard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [garmentId, setGarmentId] = useState<string | null>(null)
  const [chosen, setSort] = useState<'top' | 'following'>('top')
  const signedIn = useSessionStore((state) => state.status === 'signed-in')
  // Following needs a session: signed out (even mid-visit), it's Rankings again.
  const sort = chosen === 'following' && !(COMMUNITY && signedIn) ? 'top' : chosen
  const following = sort === 'following'
  const [window, setWindow] = useState<BoardWindow>('all')
  // Every garment seen on the board, so the filter keeps its chips while filtered.
  const [garments, setGarments] = useState<string[]>([])
  const shownWindow = following ? 'all' : window

  useEffect(() => {
    let cancelled = false
    setLoad({ state: 'loading' })

    const read = following
      ? getFollowingBoard().then((result) => (result.ok ? { ok: true as const, data: result.data.designs } : { ok: false as const }))
      : getBoard({ window: shownWindow, garmentId })

    void read.then((result) => {
      if (cancelled) return
      setLoad(result.ok ? { state: 'ready', designs: result.data } : { state: 'failed' })

      if (result.ok && !following) {
        setGarments((known) => [...new Set([...known, ...result.data.map((design) => design.garmentId)])])
      }
    })

    return () => {
      cancelled = true
    }
  }, [shownWindow, garmentId, following])

  // The server ranks (ties share a place); Following is newest first.
  const designs = useMemo(() => (load.state === 'ready' ? load.designs : []), [load])

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Fashion Leader Vote</p>
        <h1 className="font-display text-4xl">Ranking</h1>
        <p className="font-body text-sm text-flv-muted">
          The top designs, ranked by votes. New designs that need votes are on{' '}
          <Link to="/vote" search={{}} className="underline">
            Vote
          </Link>
          .
        </p>
        <HowVotesCount>
          <li>{VOTE_RULE}</li>
          <li data-testid="tie-rule">{TIE_RULE}</li>
        </HowVotesCount>
      </header>

      <div role="tablist" aria-label="Board order" className="flex gap-2">
        {(
          [
            { id: 'top', label: 'Rankings', hint: 'Most voted first' },
            ...(COMMUNITY && signedIn ? [{ id: 'following', label: 'Following', hint: 'Designers you follow, newest first' } as const] : []),
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={sort === tab.id}
            title={tab.hint}
            onClick={() => setSort(tab.id)}
            className={cn('min-h-11 border-b-2 px-3 font-body text-sm', {
              'border-flv-accent font-medium text-flv-accent': sort === tab.id,
              'border-transparent text-flv-muted hover:text-flv-accent': sort !== tab.id,
            })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {sort === 'top' ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ranking period">
          {BOARD_WINDOWS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={window === id}
              onClick={() => setWindow(id)}
              className={chipClass({ selected: window === id })}
            >
              {BOARD_WINDOW_LABEL[id]}
            </button>
          ))}
        </div>
      ) : null}

      {garments.length > 0 && !following ? (
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
      ) : null}

      {load.state === 'loading' ? <p className="font-body text-sm text-flv-muted">Loading designs…</p> : null}
      {load.state === 'failed' ? (
        <p className="font-body text-sm text-flv-muted">The board isn’t available right now. Try again shortly.</p>
      ) : null}
      {load.state === 'ready' && designs.length === 0 && following ? (
        <p className="font-body text-sm text-flv-muted">
          Nothing here yet. Follow designers from their profile pages to see their new designs here.
        </p>
      ) : null}
      {load.state === 'ready' && designs.length === 0 && !following && (garmentId || shownWindow !== 'all') ? (
        <p className="font-body text-sm text-flv-muted">No designs here for this {garmentId ? 'garment' : 'period'} yet.</p>
      ) : null}
      {load.state === 'ready' && designs.length === 0 && !following && !garmentId && shownWindow === 'all' ? (
        <p className="font-body text-sm text-flv-muted">
          Nothing is published yet. Publish a design from{' '}
          <Link to="/studio" className="underline">
            My Studio
          </Link>{' '}
          to put it here.
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {designs.map((design, index) => (
          <li key={design.slug} className="flv-panel flex flex-col gap-3 p-4">
            <Link to="/s/$slug" params={{ slug: design.slug }} className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-xl border border-flv-line bg-flv-soft">
                {following ? null : (
                  <span className="absolute top-2 left-2 z-10 flex gap-1">
                    <span
                      aria-label={design.tied ? `Tied for rank ${design.rank}` : `Rank ${design.rank}`}
                      className="rounded-full bg-flv-ink px-2.5 py-1 font-body text-xs font-medium text-white"
                    >
                      {design.tied ? tieLabel({ rank: design.rank }) : `#${design.rank}`}
                    </span>
                    {design.tied ? (
                      <span
                        title={TIE_RULE}
                        className="rounded-full border border-flv-ink bg-white px-2.5 py-1 font-body text-xs font-medium text-flv-ink"
                      >
                        Tied
                      </span>
                    ) : null}
                  </span>
                )}
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
            <p className="font-body text-sm text-flv-muted">
              <VoteTally
                count={design.votes}
                pending={design.pending}
                suffix={sort === 'top' && shownWindow !== 'all' ? ` ${BOARD_WINDOW_LABEL[shownWindow].toLowerCase()}` : ''}
              />
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
