import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { Leaderboard } from '../components/vote/Leaderboard'
import { LookCard } from '../components/vote/LookCard'
import { listDesigns, voteOnDesign } from '../lib/designs-api'
import type { Design } from '../lib/design-schema'
import { HOUSE_COPY } from '../lib/house-copy'
import { rankDesigns } from '../lib/rank-designs'
import {
  applyOptimisticVote,
  applyVoteResult,
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
  const [votingIds, setVotingIds] = useState<string[]>([])
  const votingIdsRef = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (cancelled) {
          return
        }

        setLooks(rankDesigns({ designs }))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleVote({ id }: { id: string }) {
    if (votingIdsRef.current.includes(id)) {
      return
    }

    votingIdsRef.current = [...votingIdsRef.current, id]
    setVotingIds(votingIdsRef.current)
    setLooks((current) => applyOptimisticVote({ looks: current, id }))

    try {
      const result = await voteOnDesign({ id })
      setLooks((current) =>
        applyVoteResult({
          looks: current,
          id: result.id,
          votes: result.votes,
        }),
      )
    } catch {
      setLooks((current) => revertOptimisticVote({ looks: current, id }))
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
    <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pt-24 pb-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Fashion Leader Vote
      </p>
      <h1 className="font-display text-5xl text-ivory">The board</h1>
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
        <p className="text-sm text-ivory-muted">{HOUSE_COPY.boardFailed}</p>
      ) : null}
      {status === 'ready' && leader ? (
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
          <Leaderboard looks={looks} />
        </section>
      ) : null}
    </section>
  )
}
