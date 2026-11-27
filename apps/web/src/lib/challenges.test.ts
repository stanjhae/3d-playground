import { describe, expect, test } from 'vitest'

import { getChallengeById, listChallenges } from './challenges'

describe('challenges', () => {
  test('lists fixed house challenges', () => {
    const challenges = listChallenges()

    expect(challenges.length).toBeGreaterThanOrEqual(2)
    expect(challenges.every((challenge) => challenge.id && challenge.title)).toBe(
      true,
    )
    expect(getChallengeById({ challengeId: challenges[0]?.id })?.title).toBe(
      challenges[0]?.title,
    )
    expect(getChallengeById({ challengeId: 'missing' })).toBeUndefined()
  })
})
