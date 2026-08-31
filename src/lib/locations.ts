export type LocationPreset = {
  id: string
  name: string
  position: readonly [number, number, number]
  lookAt: readonly [number, number, number]
  velocityY: number
}

const LOCATION_PRESETS: readonly LocationPreset[] = [
  {
    id: 'cafeteria',
    name: 'Cafeteria',
    position: [-474, 100, 469],
    lookAt: [1850, 100, 2500],
    velocityY: 100,
  },
  {
    id: 'entrance',
    name: 'Entrance',
    position: [-110, 100, -2862],
    lookAt: [140, 100, 2100],
    velocityY: 100,
  },
  {
    id: 'secondFloor',
    name: 'Second floor',
    position: [-518, 900, 792],
    lookAt: [-500, 875, 200],
    velocityY: 900,
  },
  {
    id: 'thirdFloor',
    name: 'Third floor',
    position: [-571, 1250, 989],
    lookAt: [850, 1000, -1110],
    velocityY: 1250,
  },
  {
    id: 'bigLectureHall',
    name: 'Big lecture hall',
    position: [866, 250, -1130],
    lookAt: [4000, 150, 3000],
    velocityY: 250,
  },
  {
    id: 'laboratory',
    name: 'Laboratory',
    position: [-2290, 100, -1469],
    lookAt: [-1000, 200, -4100],
    velocityY: 100,
  },
]

const locationById = new Map(
  LOCATION_PRESETS.map((preset) => [preset.id, preset]),
)

export function getLocationById({ id }: { id: string }) {
  return locationById.get(id)
}

export function listLocations({ limit }: { limit?: number } = {}) {
  if (limit === 0) {
    return []
  }

  if (limit === undefined) {
    return [...LOCATION_PRESETS]
  }

  return LOCATION_PRESETS.slice(0, limit)
}
