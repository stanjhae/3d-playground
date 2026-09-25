import type { GarmentId } from './design-schema'
import { listRailGarments, type GarmentEntry } from './garments'

export type GarmentCategoryId =
  | 'tops'
  | 'bottoms'
  | 'outerwear'
  | 'accessories'

export const GARMENT_CATEGORIES: readonly {
  id: GarmentCategoryId
  labelKey:
    | 'selectCategoryTops'
    | 'selectCategoryBottoms'
    | 'selectCategoryOuterwear'
    | 'selectCategoryAccessories'
}[] = [
  { id: 'tops', labelKey: 'selectCategoryTops' },
  { id: 'bottoms', labelKey: 'selectCategoryBottoms' },
  { id: 'outerwear', labelKey: 'selectCategoryOuterwear' },
  { id: 'accessories', labelKey: 'selectCategoryAccessories' },
] as const

const GARMENT_CATEGORY: Record<GarmentId, GarmentCategoryId> = {
  tee: 'tops',
  slip: 'tops',
  gown: 'outerwear',
  mixed: 'tops',
  coat: 'outerwear',
  suit: 'outerwear',
  jacket: 'outerwear',
}

export function garmentCategory({
  garmentId,
}: {
  garmentId: GarmentId
}): GarmentCategoryId {
  return GARMENT_CATEGORY[garmentId] ?? 'tops'
}

export function listGarmentsByCategory({
  category,
}: {
  category: GarmentCategoryId
}): GarmentEntry[] {
  return listRailGarments().filter(
    (garment) => garmentCategory({ garmentId: garment.id }) === category,
  )
}

export const SHOOT_PRESETS = [
  { id: 'studio', label: 'Studio' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'runway', label: 'Runway' },
  { id: 'urban', label: 'Urban' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'social', label: 'Social Media' },
] as const

export type ShootPresetId = (typeof SHOOT_PRESETS)[number]['id']

export const SHOOT_CONFIG_FIELDS = [
  {
    id: 'style',
    label: 'Style',
    options: ['Urban Streetwear', 'Editorial', 'Minimal Studio'],
  },
  {
    id: 'location',
    label: 'Location',
    options: ['City / Urban', 'Studio', 'Outdoor'],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    options: ['Editorial Lighting', 'Soft Daylight', 'Hard Contrast'],
  },
  {
    id: 'pose',
    label: 'Pose',
    options: ['Full Body', 'Three Quarter', 'Close Up'],
  },
  {
    id: 'camera',
    label: 'Camera Angle',
    options: ['Eye Level', 'Low Angle', 'High Angle'],
  },
  {
    id: 'lens',
    label: 'Lens Style',
    options: ['35mm (Natural)', '50mm', '85mm Portrait'],
  },
  {
    id: 'background',
    label: 'Background',
    options: ['Urban Concrete', 'Seamless', 'Meadow'],
  },
  {
    id: 'format',
    label: 'Format',
    options: ['4K (High Resolution)', '1080p', 'Square Social'],
  },
] as const

export const CANNED_STILLS = [
  '/stills/look-atelier-ivory.png',
  '/stills/look-blush-first.png',
  '/stills/look-cotton-leather.png',
  '/stills/look-house-ink.png',
  '/stills/look-meadow-walk.png',
  '/stills/look-midnight-silk.png',
  '/stills/look-oxblood-evening.png',
  '/stills/look-slate-denim.png',
  '/stills/look-wool-hour.png',
] as const

export function pickCannedStillGrid({
  seed,
  count = 4,
}: {
  seed: string
  count?: number
}): string[] {
  const offset =
    [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    CANNED_STILLS.length
  const results: string[] = []

  for (let index = 0; index < count; index += 1) {
    results.push(CANNED_STILLS[(offset + index) % CANNED_STILLS.length]!)
  }

  return results
}

export const VIDEO_SCENES = [
  { id: 'front', label: 'Front Reveal', duration: '0:03' },
  { id: 'left', label: 'Left Turn', duration: '0:03' },
  { id: 'back', label: 'Back View', duration: '0:03' },
  { id: 'right', label: 'Right Sweep', duration: '0:03' },
  { id: 'close', label: 'Detail Close', duration: '0:03' },
] as const

export type VideoSceneId = (typeof VIDEO_SCENES)[number]['id']

export const VIDEO_SETTINGS = [
  {
    id: 'format',
    label: 'Format',
    options: ['9:16 Reel (Instagram)', '1:1 Social Post', '16:9 Campaign'],
  },
  {
    id: 'duration',
    label: 'Duration',
    options: ['15 Seconds', '30 Seconds', '60 Seconds'],
  },
  {
    id: 'camera',
    label: 'Camera Movement',
    options: ['Dynamic (Auto)', 'Static', 'Orbit'],
  },
  {
    id: 'transitions',
    label: 'Transitions',
    options: ['Cinematic', 'Hard Cut', 'Fade'],
  },
  {
    id: 'music',
    label: 'Music',
    options: ['Modern / Hip Hop', 'Ambient', 'Editorial'],
  },
  {
    id: 'logo',
    label: 'Logo Placement',
    options: ['Bottom Left', 'Bottom Right', 'None'],
  },
  {
    id: 'text',
    label: 'Text Overlay',
    options: ['From Idea to Reality', 'Wear Your Vision', 'None'],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    options: ['Editorial', 'Soft', 'Night'],
  },
] as const

export const VIDEO_EXPORT_PRESETS = [
  { id: 'reel', label: '9:16 Reel' },
  { id: 'short', label: '9:16 Short' },
  { id: 'square', label: '1:1 Social Post' },
  { id: 'campaign', label: '16:9 Campaign Video' },
] as const

export function videoStillForScene({
  sceneId,
}: {
  sceneId: VideoSceneId
}): string {
  const index = VIDEO_SCENES.findIndex((scene) => scene.id === sceneId)
  return CANNED_STILLS[Math.max(0, index) % CANNED_STILLS.length]!
}

export const LANDING_PATTERN_OPTIONS = [
  { id: 'solid', label: 'Solid' },
  { id: 'stripe', label: 'Stripes' },
  { id: 'check', label: 'Check' },
  { id: 'gradient', label: 'Gradient' },
] as const

export const LANDING_TEXTURE_OPTIONS = [
  { id: 'standard', label: 'Standard' },
  { id: 'washed', label: 'Washed' },
  { id: 'ribbed', label: 'Ribbed' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'terry', label: 'Terry' },
  { id: 'crinkle', label: 'Crinkle' },
] as const
