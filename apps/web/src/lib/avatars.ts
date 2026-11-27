export type AvatarFilter = 'male' | 'female' | 'athletic'

/** Which mannequin is built: shoulders, bust and hips follow it. */
export type AvatarBuild = 'male' | 'female' | 'neutral'

export type AvatarPreset = {
  id: string
  label: string
  filters: readonly AvatarFilter[]
  build: AvatarBuild
  heightCm: number
  chestCm: number
  waistCm: number
  hipCm: number
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    id: 'atelier-tall',
    label: 'Tall · Male',
    filters: ['male', 'athletic'],
    build: 'male',
    heightCm: 188,
    chestCm: 104,
    waistCm: 82,
    hipCm: 98,
  },
  {
    id: 'atelier-tall-female',
    label: 'Tall · Female',
    filters: ['female', 'athletic'],
    build: 'female',
    heightCm: 180,
    chestCm: 92,
    waistCm: 70,
    hipCm: 102,
  },
  {
    id: 'atelier-soft',
    label: 'Soft · Female',
    filters: ['female'],
    build: 'female',
    heightCm: 172,
    chestCm: 94,
    waistCm: 74,
    hipCm: 104,
  },
  {
    id: 'atelier-compact',
    label: 'Compact · Male',
    filters: ['male'],
    build: 'male',
    heightCm: 168,
    chestCm: 98,
    waistCm: 84,
    hipCm: 96,
  },
  {
    id: 'atelier-long',
    label: 'Long line · Female',
    filters: ['female', 'athletic'],
    build: 'female',
    heightCm: 176,
    chestCm: 88,
    waistCm: 66,
    hipCm: 94,
  },
  {
    id: 'atelier-broad',
    label: 'Broad · Male',
    filters: ['male', 'athletic'],
    build: 'male',
    heightCm: 182,
    chestCm: 112,
    waistCm: 90,
    hipCm: 102,
  },
  {
    id: 'atelier-house',
    label: 'House',
    filters: ['female', 'male'],
    build: 'neutral',
    heightCm: 176,
    chestCm: 96,
    waistCm: 76,
    hipCm: 98,
  },
] as const

export const DEFAULT_AVATAR_MEASUREMENTS = {
  height: 180,
  chest: 102,
  waist: 80,
} as const

export function listAvatars({
  filter,
}: {
  filter?: AvatarFilter
} = {}) {
  if (!filter) {
    return [...AVATAR_PRESETS]
  }

  return AVATAR_PRESETS.filter((avatar) => avatar.filters.includes(filter))
}

export function getAvatarById({ avatarId }: { avatarId?: string | null }) {
  if (!avatarId) {
    return undefined
  }

  return AVATAR_PRESETS.find((avatar) => avatar.id === avatarId)
}

/** Pressing the chosen mannequin again goes back to the tee alone. */
export function nextAvatarSelection({
  currentId,
  clickedId,
}: {
  currentId: string | null
  clickedId: string
}): string | null {
  return currentId === clickedId ? null : clickedId
}
