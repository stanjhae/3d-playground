import { describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'
import {
  applyOptimisticVote,
  applyVoteResult,
  revertOptimisticVote,
} from './vote-board'

function look({
  id,
  title,
  votes,
}: {
  id: string
  title: string
  votes: number
}) {
  return {
    ...createEmptyDesign({ id }),
    title,
    votes,
  }
}

describe('vote board updates', () => {
  const seed = [
    look({ id: 'look-midnight-silk', title: 'Midnight Silk Column', votes: 6 }),
    look({ id: 'look-atelier-ivory', title: 'Atelier Ivory', votes: 5 }),
  ]

  test('one vote can flip the Leader', () => {
    const after = applyOptimisticVote({
      looks: seed,
      id: 'look-atelier-ivory',
    })

    expect(after[0]?.id).toBe('look-atelier-ivory')
    expect(after[0]?.votes).toBe(6)
  })

  test('reverting one vote does not wipe another card', () => {
    const afterA = applyOptimisticVote({
      looks: seed,
      id: 'look-midnight-silk',
    })
    const afterB = applyOptimisticVote({
      looks: afterA,
      id: 'look-atelier-ivory',
    })
    const afterAFailed = revertOptimisticVote({
      looks: afterB,
      id: 'look-midnight-silk',
    })
    const afterBOk = applyVoteResult({
      looks: afterAFailed,
      id: 'look-atelier-ivory',
      votes: 6,
    })

    expect(afterBOk.find((item) => item.id === 'look-midnight-silk')?.votes).toBe(
      6,
    )
    expect(afterBOk.find((item) => item.id === 'look-atelier-ivory')?.votes).toBe(
      6,
    )
    expect(afterBOk[0]?.id).toBe('look-atelier-ivory')
  })

  test('revert does not go below zero', () => {
    const after = revertOptimisticVote({
      looks: [look({ id: 'look-blush-first', title: 'Blush First Look', votes: 0 })],
      id: 'look-blush-first',
    })

    expect(after[0]?.votes).toBe(0)
  })
})
