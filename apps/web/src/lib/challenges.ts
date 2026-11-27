import type { GarmentId } from './design-schema'

export type HouseChallenge = {
  id: string
  title: string
  garmentHint: GarmentId
  blurb: string
}

export const HOUSE_CHALLENGES: readonly HouseChallenge[] = [
  {
    id: 'tee-night',
    title: 'Tee night',
    garmentHint: 'tee',
    blurb: 'One mark. One tee. Lead the board.',
  },
  {
    id: 'column-ivory',
    title: 'Ivory column',
    garmentHint: 'gown',
    blurb: 'Cloth only. Keep the line long.',
  },
  {
    id: 'coat-brass',
    title: 'Brass coat',
    garmentHint: 'coat',
    blurb: 'Hardware and weight. No soft silk.',
  },
] as const

export function listChallenges() {
  return [...HOUSE_CHALLENGES]
}

export function getChallengeById({
  challengeId,
}: {
  challengeId?: string | null
}) {
  if (!challengeId) {
    return undefined
  }

  return HOUSE_CHALLENGES.find((challenge) => challenge.id === challengeId)
}
