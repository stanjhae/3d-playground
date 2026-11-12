import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { cn } from '../../lib/cn'
import { getBoard } from '../../lib/flp-api/public-read'
import type { BoardEntry } from '../../lib/flp-api/publication'
import { voteCountLabel } from '../../lib/flp-api/votes'
import { type BoardSort, boardView } from '../../lib/board-view'
import { getGarment } from '../../lib/garments'
import { GownCredit } from '../editor/GownCredit'

type Load = { state: 'loading' } | { state: 'ready'; designs: BoardEntry[] } | { state: 'failed' }

/**
 * The board (V2): every published design, most voted first, filterable by
 * garment. Each card opens the design's share page, where people vote.
 */
export function PublicationBoard() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [garmentId, setGarmentId] = useState<string | null>(null)
  const [sort, setSort] = useState<BoardSort>('top')

  useEffect(() => {
    let cancelled = false

    void getBoard().then((result) => {
      if (!cancelled) {
        setLoad(result.ok ? { state: 'ready', designs: result.data } : { state: 'failed' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const designs = useMemo(() => (load.state === 'ready' ? load.designs : []), [load])
  const garments = useMemo(() => [...new Set(designs.map((design) => design.garmentId))], [designs])
  // Ranked over the whole board, so a design's place never moves with the filter.
  const shown = useMemo(() => boardView({ designs, garmentId, sort }), [designs, garmentId, sort])

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">Fashion Leader Vote</p>
        <h1 className="font-display text-4xl">Vote and rankings</h1>
        <p className="font-body text-sm text-flv-muted">
          Every published design, ranked by votes. Open one to see every side and give it your vote.
        </p>
      </header>

      <div role="tablist" aria-label="Board order" className="flex gap-2">
        {(
          [
            { id: 'top', label: 'Rankings', hint: 'Most voted first' },
            { id: 'new', label: 'New', hint: 'Newest first, to vote on' },
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

      {garments.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by garment">
          {[null, ...garments].map((id) => (
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

      {load.state === 'loading' ? <p className="font-body text-sm text-flv-muted">Loading designs…</p> : null}
      {load.state === 'failed' ? (
        <p className="font-body text-sm text-flv-muted">The board isn’t available right now. Try again shortly.</p>
      ) : null}
      {load.state === 'ready' && designs.length === 0 ? (
        <p className="font-body text-sm text-flv-muted">
          Nothing is published yet. Publish a design from{' '}
          <Link to="/studio" className="underline">
            My Studio
          </Link>{' '}
          to put it here.
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((design, index) => (
          <li key={design.slug} className="flv-panel flex flex-col gap-3 p-4">
            <Link to="/s/$slug" params={{ slug: design.slug }} className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-xl border border-flv-line bg-flv-soft">
                <span
                  aria-label={`Rank ${design.rank}`}
                  className="absolute top-2 left-2 z-10 rounded-full bg-flv-ink px-2.5 py-1 font-body text-xs font-medium text-white"
                >
                  #{design.rank}
                </span>
                <img
                  src={design.image}
                  alt={`${design.title}, front view`}
                  loading={index < 3 ? 'eager' : 'lazy'}
                  className="aspect-[3/4] w-full object-contain"
                />
              </div>
              <h2 className="font-display text-2xl text-flv-ink [overflow-wrap:anywhere]">{design.title}</h2>
              <p className="font-body text-sm text-flv-muted">
                {design.displayName ? `By ${design.displayName} · ` : ''}
                {getGarment({ garmentId: design.garmentId }).label}
              </p>
            </Link>
            <GownCredit garmentId={design.garmentId} />
            <p className="font-body text-sm text-flv-muted">{voteCountLabel({ count: design.votes })}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
