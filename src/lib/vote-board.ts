import type { Design } from './design-schema'
import { rankDesigns } from './rank-designs'

export function applyOptimisticVote({
  looks,
  id,
}: {
  looks: Design[]
  id: string
}): Design[] {
  return rankDesigns({
    designs: looks.map((look) =>
      look.id === id ? { ...look, votes: look.votes + 1 } : look,
    ),
  })
}

export function applyVoteResult({
  looks,
  id,
  votes,
}: {
  looks: Design[]
  id: string
  votes: number
}): Design[] {
  return rankDesigns({
    designs: looks.map((look) => (look.id === id ? { ...look, votes } : look)),
  })
}

export function revertOptimisticVote({
  looks,
  id,
}: {
  looks: Design[]
  id: string
}): Design[] {
  return rankDesigns({
    designs: looks.map((look) =>
      look.id === id ? { ...look, votes: Math.max(0, look.votes - 1) } : look,
    ),
  })
}
