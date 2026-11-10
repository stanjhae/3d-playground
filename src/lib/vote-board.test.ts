import { describe, expect, test } from 'vitest'

import { isLiveBoardLoad, nextBoardLoadId } from './vote-board'

describe('board load generation', () => {
  test('a late failure is not live after a newer load starts', () => {
    const first = nextBoardLoadId({ current: 0 })
    const second = nextBoardLoadId({ current: first })

    expect(isLiveBoardLoad({ loadId: first, current: second })).toBe(false)
    expect(isLiveBoardLoad({ loadId: second, current: second })).toBe(true)
  })
})
