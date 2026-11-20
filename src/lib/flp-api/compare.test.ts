import { describe, expect, test } from 'vitest'

import { comparisonScore, orderedPair, pickComparison, tieLabel } from './compare'

describe('head-to-head ranking', () => {
  test('a single pick cannot outrank a longer record at the same rate', () => {
    const one = comparisonScore({ wins: 1, losses: 0 })
    const many = comparisonScore({ wins: 10, losses: 0 })

    expect(many).toBeGreaterThan(one)
    expect(comparisonScore({ wins: 0, losses: 0 })).toBe(0.5)
  })

  test('the next pair is the two least shown, newest first when the counts match', () => {
    expect(
      pickComparison({
        designs: [
          { slug: 'bbbbbbbbbbbbbbbb', impressions: 3, publishedAt: '2026-11-01T00:00:00.000Z' },
          { slug: 'aaaaaaaaaaaaaaaa', impressions: 1, publishedAt: '2026-11-02T00:00:00.000Z' },
          { slug: 'cccccccccccccccc', impressions: 1, publishedAt: '2026-11-20T00:00:00.000Z' },
        ],
      }),
    ).toEqual(['cccccccccccccccc', 'aaaaaaaaaaaaaaaa'])
    expect(pickComparison({ designs: [{ slug: 'aaaaaaaaaaaaaaaa', impressions: 0, publishedAt: '2026-11-01T00:00:00.000Z' }] })).toBeNull()
  })

  test('a tie is written as =3, and a pair is stored in slug order', () => {
    expect(tieLabel({ rank: 3 })).toBe('=3')
    expect(orderedPair({ left: 'bbbbbbbbbbbbbbbb', right: 'aaaaaaaaaaaaaaaa' })).toEqual({
      slugLow: 'aaaaaaaaaaaaaaaa',
      slugHigh: 'bbbbbbbbbbbbbbbb',
    })
    expect(orderedPair({ left: 'aaaaaaaaaaaaaaaa', right: 'aaaaaaaaaaaaaaaa' })).toBeNull()
  })
})
