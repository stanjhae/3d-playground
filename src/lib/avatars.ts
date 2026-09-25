export type AvatarFilter = 'male' | 'female' | 'athletic'

export type AvatarPreset = {
  id: string
  label: string
  filters: readonly AvatarFilter[]
  heightCm: number
  chestCm: number
  waistCm: number
  /** Optional GLB path; AvatarBody uses procedural geometry when missing. */
  src?: string
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    id: 'atelier-tall',
    label: 'Tall',
    filters: ['male', 'athletic'],
    heightCm: 188,
    chestCm: 104,
    waistCm: 82,
    src: '/models/avatar-tall.glb',
  },
  {
    id: 'atelier-soft',
    label: 'Soft',
    filters: ['female'],
    heightCm: 172,
    chestCm: 94,
    waistCm: 74,
    src: '/models/avatar-soft.glb',
  },
  {
    id: 'atelier-compact',
    label: 'Compact',
    filters: ['male'],
    heightCm: 168,
    chestCm: 98,
    waistCm: 84,
    src: '/models/avatar-compact.glb',
  },
  {
    id: 'atelier-long',
    label: 'Long line',
    filters: ['female', 'athletic'],
    heightCm: 180,
    chestCm: 90,
    waistCm: 70,
    src: '/models/avatar-long.glb',
  },
  {
    id: 'atelier-broad',
    label: 'Broad',
    filters: ['male', 'athletic'],
    heightCm: 182,
    chestCm: 112,
    waistCm: 90,
    src: '/models/avatar-broad.glb',
  },
  {
    id: 'atelier-house',
    label: 'House',
    filters: ['female', 'male'],
    heightCm: 176,
    chestCm: 96,
    waistCm: 76,
    src: '/models/avatar-house.glb',
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
