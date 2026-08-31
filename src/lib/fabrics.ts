export type FabricPreset = {
  id: string
  name: string
  color: string
  roughness: number
  metalness: number
  mapId?: string
}

const FABRIC_PRESETS: readonly FabricPreset[] = [
  {
    id: 'cotton',
    name: 'Cotton',
    color: '#f3efe6',
    roughness: 0.86,
    metalness: 0,
    mapId: 'cotton-weave',
  },
  {
    id: 'silk',
    name: 'Silk',
    color: '#f6e7d8',
    roughness: 0.18,
    metalness: 0.04,
    mapId: 'silk-shine',
  },
  {
    id: 'wool',
    name: 'Wool',
    color: '#d8cfc2',
    roughness: 0.92,
    metalness: 0,
    mapId: 'wool-nap',
  },
  {
    id: 'denim',
    name: 'Denim',
    color: '#2c3d56',
    roughness: 0.78,
    metalness: 0,
    mapId: 'denim-twill',
  },
  {
    id: 'leather',
    name: 'Leather',
    color: '#4a2f22',
    roughness: 0.42,
    metalness: 0.08,
    mapId: 'leather-grain',
  },
  {
    id: 'ivory-silk',
    name: 'Ivory Silk',
    color: '#f4ead4',
    roughness: 0.2,
    metalness: 0.04,
    mapId: 'silk-shine',
  },
  {
    id: 'ivory-cotton',
    name: 'Ivory Cotton',
    color: '#f3efe6',
    roughness: 0.85,
    metalness: 0,
    mapId: 'cotton-weave',
  },
  {
    id: 'ink-cotton',
    name: 'Ink Cotton',
    color: '#1a1c22',
    roughness: 0.84,
    metalness: 0,
    mapId: 'cotton-weave',
  },
  {
    id: 'atelier-wool',
    name: 'Atelier Wool',
    color: '#2b241c',
    roughness: 0.9,
    metalness: 0,
    mapId: 'wool-nap',
  },
  {
    id: 'brass-silk',
    name: 'Brass Silk',
    color: '#c4a15a',
    roughness: 0.22,
    metalness: 0.12,
    mapId: 'silk-shine',
  },
  {
    id: 'blush-silk',
    name: 'Blush Silk',
    color: '#e8c4b8',
    roughness: 0.2,
    metalness: 0.03,
    mapId: 'silk-shine',
  },
  {
    id: 'oxblood-leather',
    name: 'Oxblood Leather',
    color: '#6b1d2a',
    roughness: 0.4,
    metalness: 0.08,
    mapId: 'leather-grain',
  },
  {
    id: 'tobacco-leather',
    name: 'Tobacco Leather',
    color: '#7a4a28',
    roughness: 0.45,
    metalness: 0.06,
    mapId: 'leather-grain',
  },
  {
    id: 'slate-denim',
    name: 'Slate Denim',
    color: '#3d4a55',
    roughness: 0.76,
    metalness: 0,
    mapId: 'denim-twill',
  },
  {
    id: 'meadow-cotton',
    name: 'Meadow Cotton',
    color: '#6b7c4a',
    roughness: 0.86,
    metalness: 0,
    mapId: 'cotton-weave',
  },
]

const fabricById = new Map(
  FABRIC_PRESETS.map((preset) => [preset.id, preset]),
)

export function getFabricById({ id }: { id: string }) {
  return fabricById.get(id)
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
