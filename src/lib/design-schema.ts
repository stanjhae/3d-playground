export type GarmentId = 'column' | 'jacket'

export type MaterialOverride = {
  meshName: string
  color?: string
  roughness?: number
  metalness?: number
  mapId?: string
}

export type Design = {
  id: string
  title: string
  author: string
  votes: number
  thumbnailDataUrl: string
  overrides: MaterialOverride[]
  garmentId?: GarmentId
}

export function createEmptyDesign({ id }: { id: string }): Design {
  return {
    id,
    title: '',
    author: '',
    votes: 0,
    thumbnailDataUrl: '',
    overrides: [],
    garmentId: 'column',
  }
}

export function resolveGarmentId({
  garmentId,
}: {
  garmentId?: string | null
}): GarmentId {
  return garmentId === 'jacket' ? 'jacket' : 'column'
}
