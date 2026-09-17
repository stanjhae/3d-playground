import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { Leaderboard } from '../components/vote/Leaderboard'
import { LookCard } from '../components/vote/LookCard'
import { trackAssumption } from '../lib/assumption-events'
import { listDesigns, voteOnDesign } from '../lib/designs-api'
import type { Design } from '../lib/design-schema'
import { HOUSE_COPY } from '../lib/house-copy'
import { rankDesigns } from '../lib/rank-designs'
import { chromeKickerClass } from '../lib/studio-chrome'
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
  const votingIdsRef = useRef<string[]>([])
  const boardLoadRef = useRef(0)

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

  const leader = looks[0]
  const rest = looks.slice(1)

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-8 pb-16 sm:gap-8 sm:px-6 sm:pt-10">
      <p className={chromeKickerClass()}>Fashion Leader Vote</p>
      <h1 className="font-display text-4xl text-ivory sm:text-5xl">The board</h1>
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
          <div className="lg:hidden">
            <Leaderboard looks={looks} compact />
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
              <Leaderboard looks={looks} />
            </div>
          </section>
        </section>
      ) : null}
    </section>
  )
}
