export type LocationPreset = {
  id: string
  name: string
}

export function getLocationById({ id }: { id: string }) {
  return id ? undefined : undefined
}

export function listLocations({ limit }: { limit?: number } = {}) {
  return limit === 0 ? [] : ([] as LocationPreset[])
}
