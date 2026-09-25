import type { DesignDocument } from './design-document.ts'

export const GARMENT_IDS = [
  'gown',
  'slip',
  'mixed',
  'coat',
  'suit',
  'jacket',
  'tee',
] as const

export type GarmentId = (typeof GARMENT_IDS)[number]

const GARMENT_ID_SET = new Set<string>(GARMENT_IDS)

const GARMENT_ALIASES: Record<string, GarmentId> = {
  column: 'gown',
}

export type MaterialOverride = {
  meshName: string
  color?: string
  roughness?: number
  metalness?: number
  mapId?: string
}

export type DesignMethod = 'draw' | 'tech' | 'combined'

export type Design = {
  id: string
  title: string
  author: string
  votes: number
  thumbnailDataUrl: string
  overrides: MaterialOverride[]
  garmentId?: GarmentId
  artMap?: string
  document?: DesignDocument
  structural?: {
    neck?: 'crew' | 'v'
    hem?: 'crop' | 'long'
    sleeve?: 'short' | 'long'
  }
  tags?: string[]
  method?: DesignMethod
  challengeId?: string
  createdAt?: string
  avatarId?: string
  angleStills?: string[]
}

export function createEmptyDesign({ id }: { id: string }): Design {
  return {
    id,
    title: '',
    author: '',
    votes: 0,
    thumbnailDataUrl: '',
    overrides: [],
    garmentId: 'gown',
  }
}

export function resolveGarmentId({
  garmentId,
}: {
  garmentId?: string | null
}): GarmentId {
  if (!garmentId) {
    return 'gown'
  }

  const aliased = GARMENT_ALIASES[garmentId]

  if (aliased) {
    return aliased
  }

  if (GARMENT_ID_SET.has(garmentId)) {
    return garmentId as GarmentId
  }

  return 'gown'
}
