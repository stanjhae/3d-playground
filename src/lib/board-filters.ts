import type { Design, GarmentId } from './design-schema'
import { resolveGarmentId } from './design-schema'
import { rankDesigns } from './rank-designs'

export type BoardTimeframe = 'week' | 'all'

export type BoardFilterState = {
  garmentId?: GarmentId | 'all'
  challengeId?: string | 'all'
  timeframe: BoardTimeframe
}

export const DEFAULT_BOARD_FILTERS: BoardFilterState = {
  garmentId: 'all',
  challengeId: 'all',
  timeframe: 'all',
}

function isWithinWeek({ createdAt, now }: { createdAt?: string; now: Date }) {
  if (!createdAt) {
    // Seed / legacy looks without timestamps stay visible under "this week".
    return true
  }

  const created = new Date(createdAt)

  if (Number.isNaN(created.getTime())) {
    return true
  }

  const weekMs = 7 * 24 * 60 * 60 * 1000
  return now.getTime() - created.getTime() <= weekMs
}

export function filterBoardLooks({
  looks,
  filters,
  now = new Date(),
}: {
  looks: Design[]
  filters: BoardFilterState
  now?: Date
}) {
  const filtered = looks.filter((look) => {
    if (filters.garmentId && filters.garmentId !== 'all') {
      if (resolveGarmentId({ garmentId: look.garmentId }) !== filters.garmentId) {
        return false
      }
    }

    if (filters.challengeId && filters.challengeId !== 'all') {
      if (look.challengeId !== filters.challengeId) {
        return false
      }
    }

    if (filters.timeframe === 'week') {
      if (!isWithinWeek({ createdAt: look.createdAt, now })) {
        return false
      }
    }

    return true
  })

  return rankDesigns({ designs: filtered })
}

export function boardGarmentOptions({
  looks,
}: {
  looks: Design[]
}): GarmentId[] {
  const ids = new Set<GarmentId>()

  for (const look of looks) {
    ids.add(resolveGarmentId({ garmentId: look.garmentId }))
  }

  return [...ids]
}
