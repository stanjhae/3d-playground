export type FabricPreset = {
  id: string
  name: string
}

export function getFabricById({ id }: { id: string }) {
  return id ? undefined : undefined
}

export function listFabrics({ limit }: { limit?: number } = {}) {
  return limit === 0 ? [] : ([] as FabricPreset[])
}
