export type FabricPreset = {
  id: string
  name: string
  color: string
  roughness: number
  metalness: number
  mapId?: string
  sheen?: number
  sheenRoughness?: number
  sheenColor?: string
  clearcoat?: number
  clearcoatRoughness?: number
  mapRepeat?: number
}

const FABRIC_PRESETS: readonly FabricPreset[] = [
  {
    id: 'cotton',
    name: 'Cotton',
    color: '#f3efe6',
    roughness: 0.86,
    metalness: 0,
    mapId: 'cotton-weave',
    mapRepeat: 4,
  },
  {
    id: 'silk',
    name: 'Silk',
    color: '#f6e7d8',
    roughness: 0.16,
    metalness: 0.04,
    mapId: 'silk-shine',
    sheen: 1,
    sheenRoughness: 0.28,
    sheenColor: '#fff6ea',
    mapRepeat: 2,
  },
  {
    id: 'wool',
    name: 'Wool',
    color: '#d8cfc2',
    roughness: 0.92,
    metalness: 0,
    mapId: 'wool-nap',
    mapRepeat: 3.4,
  },
  {
    id: 'denim',
    name: 'Denim',
    color: '#2c3d56',
    roughness: 0.78,
    metalness: 0,
    mapId: 'denim-twill',
    mapRepeat: 3.2,
  },
  {
    id: 'leather',
    name: 'Leather',
    color: '#4a2f22',
    roughness: 0.38,
    metalness: 0.08,
    mapId: 'leather-grain',
    clearcoat: 0.22,
    clearcoatRoughness: 0.36,
    mapRepeat: 2.4,
  },
  {
    id: 'ivory-silk',
    name: 'Ivory Silk',
    color: '#f4ead4',
    roughness: 0.18,
    metalness: 0.04,
    mapId: 'silk-shine',
    sheen: 1,
    sheenRoughness: 0.26,
    sheenColor: '#fff4e4',
    mapRepeat: 2,
  },
  {
    id: 'ivory-cotton',
    name: 'Ivory Cotton',
    color: '#f3efe6',
    roughness: 0.85,
    metalness: 0,
    mapId: 'cotton-weave',
    mapRepeat: 4,
  },
  {
    id: 'ink-cotton',
    name: 'Ink Cotton',
    color: '#1a1c22',
    roughness: 0.84,
    metalness: 0,
    mapId: 'cotton-weave',
    mapRepeat: 4,
  },
  {
    id: 'atelier-wool',
    name: 'Atelier Wool',
    color: '#2b241c',
    roughness: 0.9,
    metalness: 0,
    mapId: 'wool-nap',
    mapRepeat: 3.4,
  },
  {
    id: 'brass-silk',
    name: 'Brass Silk',
    color: '#c4a15a',
    roughness: 0.2,
    metalness: 0.12,
    mapId: 'silk-shine',
    sheen: 0.85,
    sheenRoughness: 0.3,
    sheenColor: '#f3e2b0',
    mapRepeat: 2,
  },
  {
    id: 'blush-silk',
    name: 'Blush Silk',
    color: '#e8c4b8',
    roughness: 0.18,
    metalness: 0.03,
    mapId: 'silk-shine',
    sheen: 1,
    sheenRoughness: 0.3,
    sheenColor: '#ffe8dc',
    mapRepeat: 2,
  },
  {
    id: 'oxblood-leather',
    name: 'Oxblood Leather',
    color: '#6b1d2a',
    roughness: 0.36,
    metalness: 0.08,
    mapId: 'leather-grain',
    clearcoat: 0.28,
    clearcoatRoughness: 0.32,
    mapRepeat: 2.4,
  },
  {
    id: 'tobacco-leather',
    name: 'Tobacco Leather',
    color: '#7a4a28',
    roughness: 0.42,
    metalness: 0.06,
    mapId: 'leather-grain',
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    mapRepeat: 2.4,
  },
  {
    id: 'slate-denim',
    name: 'Slate Denim',
    color: '#3d4a55',
    roughness: 0.76,
    metalness: 0,
    mapId: 'denim-twill',
    mapRepeat: 3.2,
  },
  {
    id: 'meadow-cotton',
    name: 'Meadow Cotton',
    color: '#6b7c4a',
    roughness: 0.86,
    metalness: 0,
    mapId: 'cotton-weave',
    mapRepeat: 4,
  },
]

const fabricById = new Map(
  FABRIC_PRESETS.map((preset) => [preset.id, preset]),
)

const fabricByMapId = new Map<string, FabricPreset>()

for (const preset of FABRIC_PRESETS) {
  if (preset.mapId && !fabricByMapId.has(preset.mapId)) {
    fabricByMapId.set(preset.mapId, preset)
  }
}

export function getFabricById({ id }: { id: string }) {
  return fabricById.get(id)
}

export function getFabricByMapId({ mapId }: { mapId: string }) {
  return fabricByMapId.get(mapId)
}

export function getFabricForOverride({
  mapId,
  color,
}: {
  mapId?: string
  color?: string
}) {
  if (!mapId) {
    return undefined
  }

  const family = FABRIC_PRESETS.filter((preset) => preset.mapId === mapId)

  if (family.length === 0) {
    return undefined
  }

  if (color) {
    const match = family.find(
      (preset) => preset.color.toLowerCase() === color.toLowerCase(),
    )

    if (match) {
      return match
    }
  }

  return family[0]
}

export function listFabrics({ limit }: { limit?: number } = {}) {
  if (limit === 0) {
    return []
  }

  if (limit === undefined) {
    return [...FABRIC_PRESETS]
  }

  return FABRIC_PRESETS.slice(0, limit)
}
