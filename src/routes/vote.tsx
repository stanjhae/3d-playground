import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { Leaderboard } from '../components/vote/Leaderboard'
import { LookCard } from '../components/vote/LookCard'
import { listDesigns, voteOnDesign } from '../lib/designs-api'
import type { Design } from '../lib/design-schema'
import { rankDesigns } from '../lib/rank-designs'
import {
  applyOptimisticVote,
  applyVoteResult,
  revertOptimisticVote,
} from '../lib/vote-board'

export const Route = createFileRoute('/vote')({
  component: VotePage,
})

function VotePage() {
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

  const leaderId = looks[0]?.id

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Fashion Leader Vote
      </p>
      <h1 className="font-display text-4xl text-ivory">The board</h1>
      <p className="max-w-lg text-base leading-relaxed text-ivory-muted">
        Vote a look to the top. The Leader wears the company name.
      </p>
      {status === 'loading' ? (
        <p className="text-sm text-ivory-muted">Preparing the board</p>
      ) : null}
      {status === 'error' ? (
        <p className="text-sm text-ivory-muted">The board could not load.</p>
      ) : null}
      {status === 'ready' ? (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <section className="grid gap-5 sm:grid-cols-2">
            {looks.map((look) => (
              <LookCard
                key={look.id}
                design={look}
                isLeader={look.id === leaderId}
                voting={votingIds.includes(look.id)}
                onVote={handleVote}
              />
            ))}
          </section>
          <Leaderboard looks={looks} />
        </section>
      ) : null}
    </section>
  )
}
