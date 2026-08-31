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
}

export function createEmptyDesign({ id }: { id: string }): Design {
  return {
    id,
    title: '',
    author: '',
    votes: 0,
    thumbnailDataUrl: '',
    overrides: [],
  }
}
