import { describe, expect, test } from 'vitest'

import { reviewVotes } from './moderation'

const voter = (voterId: string, accountCreatedAt: string, votedAt: string, votedOwners: string[]) => ({
  voterId,
  accountCreatedAt,
  votedAt,
  votedOwners,
})

describe('reviewVotes', () => {
  test('flags accounts made in the same hour, voting only for this owner, right after signing up', () => {
    const review = reviewVotes({
      ownerId: 'owner',
      voters: [
        voter('ring-1', '2026-11-10T10:00:00Z', '2026-11-10T10:05:00Z', ['owner']),
        voter('ring-2', '2026-11-10T10:20:00Z', '2026-11-12T09:00:00Z', ['owner']),
        voter('ring-3', '2026-11-10T10:40:00Z', '2026-11-12T09:00:00Z', ['owner', 'someone']),
        voter('regular', '2026-01-01T00:00:00Z', '2026-11-12T09:00:00Z', ['owner', 'someone', 'else']),
      ],
    })

    expect(review.total).toBe(4)
    expect(review.flagged.map(({ voterId, flags }) => [voterId, flags])).toEqual([
      ['ring-1', ['same-hour-accounts', 'voted-on-signup', 'votes-only-this-owner']],
      ['ring-2', ['same-hour-accounts', 'votes-only-this-owner']],
      ['ring-3', ['same-hour-accounts']],
    ])
  })

  test('two accounts in an hour are not a cluster', () => {
    const review = reviewVotes({
      ownerId: 'owner',
      voters: [
        voter('a', '2026-11-10T10:00:00Z', '2026-11-12T10:00:00Z', ['other']),
        voter('b', '2026-11-10T10:30:00Z', '2026-11-12T10:00:00Z', ['other']),
      ],
    })

    expect(review.flagged).toEqual([])
  })
})
