import type { BoardEntry } from './flp-api/publication'

export type BoardSort = 'top' | 'new'

export type RankedEntry = BoardEntry & {
  /** Standard competition rank by votes over the whole board: ties share it (1, 2, 2, 4). */
  rank: number
}

/**
 * The board as shown: ranked by votes over every garment, so a design's
 * rank never changes with the filter, then filtered and put in the order
 * the tab asks for. "Top" is the rankings; "New" is fresh designs to vote on.
 */
export function boardView({
  designs,
  garmentId = null,
  sort = 'top',
}: {
  designs: readonly BoardEntry[]
  garmentId?: string | null
  sort?: BoardSort
}): RankedEntry[] {
  const byVotes = [...designs].sort(
    (a, b) => b.votes - a.votes || a.publishedAt.localeCompare(b.publishedAt) || a.slug.localeCompare(b.slug),
  )
  const ranked: RankedEntry[] = []

  for (const [index, design] of byVotes.entries()) {
    const previous = ranked[index - 1]
    ranked.push({ ...design, rank: previous && previous.votes === design.votes ? previous.rank : index + 1 })
  }

  const shown = garmentId ? ranked.filter((design) => design.garmentId === garmentId) : ranked

  return sort === 'new'
    ? [...shown].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug))
    : shown
}
