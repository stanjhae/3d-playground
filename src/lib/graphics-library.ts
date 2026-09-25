export type GraphicAsset = {
  id: string
  label: string
  category: 'crosses' | 'flames' | 'logos' | 'shapes'
  src: string
}

export const GRAPHIC_ASSETS: readonly GraphicAsset[] = [
  {
    id: 'cross-gothic',
    label: 'Gothic Cross',
    category: 'crosses',
    src: '/graphics/cross-gothic.svg',
  },
  {
    id: 'cross-ornate',
    label: 'Ornate Cross',
    category: 'crosses',
    src: '/graphics/cross-ornate.svg',
  },
  {
    id: 'cross-simple',
    label: 'Simple Cross',
    category: 'crosses',
    src: '/graphics/cross-simple.svg',
  },
  {
    id: 'cross-flare',
    label: 'Flare Cross',
    category: 'crosses',
    src: '/graphics/cross-flare.svg',
  },
  {
    id: 'flame-rise',
    label: 'Rising Flame',
    category: 'flames',
    src: '/graphics/flame-rise.svg',
  },
  {
    id: 'flame-side',
    label: 'Side Flame',
    category: 'flames',
    src: '/graphics/flame-side.svg',
  },
  {
    id: 'flame-burst',
    label: 'Burst Flame',
    category: 'flames',
    src: '/graphics/flame-burst.svg',
  },
  {
    id: 'logo-flv',
    label: 'FLV Mark',
    category: 'logos',
    src: '/graphics/logo-flv.svg',
  },
  {
    id: 'logo-crown',
    label: 'Crown',
    category: 'logos',
    src: '/graphics/logo-crown.svg',
  },
  {
    id: 'shape-stripe',
    label: 'Stripe Block',
    category: 'shapes',
    src: '/graphics/shape-stripe.svg',
  },
] as const

export function listGraphicsByCategory({
  category,
}: {
  category: GraphicAsset['category'] | 'all'
}): GraphicAsset[] {
  if (category === 'all') {
    return [...GRAPHIC_ASSETS]
  }

  return GRAPHIC_ASSETS.filter((asset) => asset.category === category)
}
