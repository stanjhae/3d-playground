import { describe, expect, test } from 'vitest'

import {
  DEFAULT_BOARD_FILTERS,
  boardGarmentOptions,
  filterBoardLooks,
} from './board-filters'
import { createEmptyDesign } from './design-schema'

describe('board-filters', () => {
  const looks = [
    {
      ...createEmptyDesign({ id: 'look-tee' }),
      title: 'Tee mark',
      garmentId: 'tee' as const,
      votes: 4,
      challengeId: 'tee-night',
      createdAt: new Date().toISOString(),
      tags: ['night'],
    },
    {
      ...createEmptyDesign({ id: 'look-gown' }),
      title: 'Gown ivory',
      garmentId: 'gown' as const,
      votes: 8,
      challengeId: 'column-ivory',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
  ]

  test('filters by garment and challenge', () => {
    expect(
      filterBoardLooks({
        looks,
        filters: { ...DEFAULT_BOARD_FILTERS, garmentId: 'tee' },
      }).map((look) => look.id),
    ).toEqual(['look-tee'])

    expect(
      filterBoardLooks({
        looks,
        filters: { ...DEFAULT_BOARD_FILTERS, challengeId: 'column-ivory' },
      }).map((look) => look.id),
    ).toEqual(['look-gown'])
  })

  test('this week keeps undated looks and drops older dated looks', () => {
    const withUndated = [
      ...looks,
      {
        ...createEmptyDesign({ id: 'look-seed' }),
        title: 'Seed',
        garmentId: 'gown' as const,
        votes: 2,
      },
    ]

    expect(
      filterBoardLooks({
        looks: withUndated,
        filters: { ...DEFAULT_BOARD_FILTERS, timeframe: 'week' },
        now: new Date(),
      }).map((look) => look.id),
    ).toEqual(['look-tee', 'look-seed'])
  })

  test('lists garment options present on the board', () => {
    expect(boardGarmentOptions({ looks }).sort()).toEqual(['gown', 'tee'])
  })
})
