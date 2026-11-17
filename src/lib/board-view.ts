import type { BoardWindow } from './flp-api/contract'
import type { BoardEntry } from './flp-api/publication'

export type BoardSort = 'top' | 'new'

export const BOARD_WINDOW_LABEL: Record<BoardWindow, string> = {
  week: 'This week',
  month: 'This month',
  all: 'All time',
}

/**
 * The board as shown. The server ranks within the window and garment asked
 * for (ties share a place), so "Top" keeps its order; "New" lists the same
 * designs newest first, to vote on.
 */
export function boardView({ designs, sort = 'top' }: { designs: readonly BoardEntry[]; sort?: BoardSort }): BoardEntry[] {
  return sort === 'new'
    ? [...designs].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug))
    : [...designs]
}
