import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Leaderboard } from '../components/vote/Leaderboard'
import { LookCard } from '../components/vote/LookCard'
import { trackAssumption } from '../lib/assumption-events'
import {
  DEFAULT_BOARD_FILTERS,
  boardGarmentOptions,
  filterBoardLooks,
  type BoardFilterState,
  type BoardTimeframe,
} from '../lib/board-filters'
import { listChallenges } from '../lib/challenges'
import { cn } from '../lib/cn'
import { listDesigns, voteOnDesign } from '../lib/designs-api'
import type { Design, GarmentId } from '../lib/design-schema'
import { getGarment, listRailGarments } from '../lib/garments'
import { HOUSE_COPY } from '../lib/house-copy'
import { rankDesigns } from '../lib/rank-designs'
import { chromeKickerClass, chromeTextClass } from '../lib/studio-chrome'
import {
  applyOptimisticVote,
  applyVoteResult,
  isLiveBoardLoad,
  nextBoardLoadId,
  revertOptimisticVote,
} from '../lib/vote-board'

export const Route = createFileRoute('/vote')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { entered?: string } => {
    if (typeof search.entered === 'string' && search.entered.length > 0) {
      return { entered: search.entered }
    }

    return {}
  },
  component: VotePage,
})

function VotePage() {
  const { entered } = Route.useSearch()
  const [looks, setLooks] = useState<Design[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [voteError, setVoteError] = useState<string | null>(null)
  const [votingIds, setVotingIds] = useState<string[]>([])
  const [filters, setFilters] = useState<BoardFilterState>(DEFAULT_BOARD_FILTERS)
  const votingIdsRef = useRef<string[]>([])
  const boardLoadRef = useRef(0)
  const challenges = listChallenges()

  function loadBoard() {
    const loadId = nextBoardLoadId({ current: boardLoadRef.current })
    boardLoadRef.current = loadId
    setStatus('loading')
    setVoteError(null)

    void listDesigns()
      .then((designs) => {
        if (
          !isLiveBoardLoad({
            loadId,
            current: boardLoadRef.current,
          })
        ) {
          return
        }

        setLooks(rankDesigns({ designs }))
        setStatus('ready')
      })
      .catch(() => {
        if (
          !isLiveBoardLoad({
            loadId,
            current: boardLoadRef.current,
          })
        ) {
          return
        }

        setStatus('error')
      })
  }

  useEffect(() => {
    loadBoard()

    return () => {
      boardLoadRef.current = nextBoardLoadId({
        current: boardLoadRef.current,
      })
    }
  }, [])

  async function handleVote({ id }: { id: string }) {
    if (votingIdsRef.current.includes(id)) {
      return
    }

    votingIdsRef.current = [...votingIdsRef.current, id]
    setVotingIds(votingIdsRef.current)
    setVoteError(null)
    setLooks((current) => applyOptimisticVote({ looks: current, id }))

    try {
      const result = await voteOnDesign({ id })
      void trackAssumption({ name: 'voted' })
      setLooks((current) =>
        applyVoteResult({
          looks: current,
          id: result.id,
          votes: result.votes,
        }),
      )
    } catch {
      setLooks((current) => revertOptimisticVote({ looks: current, id }))
      setVoteError(HOUSE_COPY.voteFailed)
    } finally {
      votingIdsRef.current = votingIdsRef.current.filter(
        (votingId) => votingId !== id,
      )
      setVotingIds(votingIdsRef.current)
    }
  }

  const filteredLooks = useMemo(
    () => filterBoardLooks({ looks, filters }),
    [filters, looks],
  )
  const leader = filteredLooks[0]
  const rest = filteredLooks.slice(1)
  const garmentOptions = boardGarmentOptions({ looks })
  const railGarments = listRailGarments().filter((garment) =>
    garmentOptions.includes(garment.id),
  )

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-8 pb-16 sm:gap-8 sm:px-6 sm:pt-10">
      <p className={chromeKickerClass()}>Fashion Leader Vote</p>
      <h1 className="font-display text-4xl text-ivory sm:text-5xl">The board</h1>
      <div className="flex flex-col gap-3 border border-atelier-line bg-atelier-raised p-4">
        <p className={chromeKickerClass()}>{HOUSE_COPY.filters}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filters.garmentId === 'all'}
            onClick={() => {
              setFilters((current) => ({ ...current, garmentId: 'all' }))
            }}
            className={cn('min-h-9 border px-3', chromeTextClass(), {
              'border-brass text-brass': filters.garmentId === 'all',
              'border-atelier-line text-ivory-muted hover:text-brass':
                filters.garmentId !== 'all',
            })}
          >
            {HOUSE_COPY.allChallenges}
          </button>
          {(railGarments.length > 0
            ? railGarments
            : garmentOptions.map((id) => getGarment({ garmentId: id }))
          ).map((garment) => (
            <button
              key={garment.id}
              type="button"
              aria-pressed={filters.garmentId === garment.id}
              onClick={() => {
                setFilters((current) => ({
                  ...current,
                  garmentId: garment.id as GarmentId | 'all',
                }))
              }}
              className={cn('min-h-9 border px-3', chromeTextClass(), {
                'border-brass text-brass': filters.garmentId === garment.id,
                'border-atelier-line text-ivory-muted hover:text-brass':
                  filters.garmentId !== garment.id,
              })}
            >
              {garment.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filters.challengeId === 'all'}
            onClick={() => {
              setFilters((current) => ({ ...current, challengeId: 'all' }))
            }}
            className={cn('min-h-9 border px-3', chromeTextClass(), {
              'border-brass text-brass': filters.challengeId === 'all',
              'border-atelier-line text-ivory-muted hover:text-brass':
                filters.challengeId !== 'all',
            })}
          >
            {HOUSE_COPY.challenge}: {HOUSE_COPY.allChallenges}
          </button>
          {challenges.map((challenge) => (
            <button
              key={challenge.id}
              type="button"
              aria-pressed={filters.challengeId === challenge.id}
              onClick={() => {
                setFilters((current) => ({
                  ...current,
                  challengeId: challenge.id,
                }))
              }}
              className={cn('min-h-9 border px-3', chromeTextClass(), {
                'border-brass text-brass': filters.challengeId === challenge.id,
                'border-atelier-line text-ivory-muted hover:text-brass':
                  filters.challengeId !== challenge.id,
              })}
            >
              {challenge.title}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['week', 'all'] as BoardTimeframe[]).map((timeframe) => (
            <button
              key={timeframe}
              type="button"
              aria-pressed={filters.timeframe === timeframe}
              onClick={() => {
                setFilters((current) => ({ ...current, timeframe }))
              }}
              className={cn('min-h-9 border px-3', chromeTextClass(), {
                'border-brass text-brass': filters.timeframe === timeframe,
                'border-atelier-line text-ivory-muted hover:text-brass':
                  filters.timeframe !== timeframe,
              })}
            >
              {timeframe === 'week' ? HOUSE_COPY.thisWeek : HOUSE_COPY.allTime}
            </button>
          ))}
        </div>
      </div>
      {voteError ? (
        <p className="font-body text-sm text-ivory-muted">{voteError}</p>
      ) : null}
      {status === 'loading' ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="aspect-[4/5] border border-atelier-line bg-atelier-raised"
            />
          ))}
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="flex flex-col gap-3">
          <p className="font-body text-sm text-ivory-muted">
            {HOUSE_COPY.boardFailed}
          </p>
          <button
            type="button"
            onClick={() => {
              loadBoard()
            }}
            className="min-h-11 self-start border border-brass px-4 font-body text-xs tracking-[0.08em] text-brass uppercase"
          >
            {HOUSE_COPY.tryAgain}
          </button>
        </div>
      ) : null}
      {status === 'ready' && !leader ? (
        <div className="flex flex-col gap-3">
          <p className="font-body text-sm text-ivory-muted">
            {HOUSE_COPY.boardEmpty}
          </p>
          <Link
            to="/"
            search={{}}
            className="min-h-11 self-start border border-brass px-4 font-body text-xs tracking-[0.08em] text-brass uppercase"
          >
            {HOUSE_COPY.studioOpen}
          </Link>
        </div>
      ) : null}
      {status === 'ready' && leader ? (
        <section className="flex flex-col gap-8">
          <div className="overflow-x-auto border border-atelier-line bg-atelier-raised">
            <table className="w-full min-w-[28rem] text-left">
              <caption className={cn('px-4 pt-4 text-left', chromeKickerClass())}>
                {HOUSE_COPY.rankings}
              </caption>
              <thead>
                <tr className="border-b border-atelier-line">
                  <th className={cn('px-4 py-3 text-ivory-muted', chromeTextClass())}>
                    #
                  </th>
                  <th className={cn('px-4 py-3 text-ivory-muted', chromeTextClass())}>
                    Look
                  </th>
                  <th className={cn('px-4 py-3 text-ivory-muted', chromeTextClass())}>
                    {HOUSE_COPY.votes}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLooks.slice(0, 8).map((look, index) => (
                  <tr
                    key={look.id}
                    className="border-b border-atelier-line/60 last:border-b-0"
                  >
                    <td className="px-4 py-3 font-body text-sm text-brass">
                      {index === 0 ? HOUSE_COPY.leader : index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/look/$lookId"
                        params={{ lookId: look.id }}
                        className="font-body text-sm text-ivory hover:text-brass"
                      >
                        {look.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-ivory-muted">
                      {look.votes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden">
            <Leaderboard looks={filteredLooks} compact />
          </div>
          <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <section className="flex flex-col gap-8">
              <LookCard
                design={leader}
                isLeader
                featured
                isEntered={entered === leader.id}
                voting={votingIds.includes(leader.id)}
                onVote={handleVote}
              />
              <section className="grid gap-5 sm:grid-cols-2">
                {rest.map((look) => (
                  <LookCard
                    key={look.id}
                    design={look}
                    isEntered={entered === look.id}
                    voting={votingIds.includes(look.id)}
                    onVote={handleVote}
                  />
                ))}
              </section>
            </section>
            <div className="hidden lg:block">
              <Leaderboard looks={filteredLooks} />
            </div>
          </section>
        </section>
      ) : null}
    </section>
  )
}
