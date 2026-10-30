import type { AvatarMeasurements } from './avatar-geometry'
import {
  applyCommand,
  createCommandStack,
} from './design-commands'
import {
  createObjectId,
  type DesignDocument,
  type PanelId,
  type StrokeTool,
} from './design-document'
import type { GarmentId, MaterialOverride } from './design-schema'
import { listRailGarments, type GarmentEntry } from './garments'
import { isSafeLayerSrc } from './look-thumbnail'

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

export type LandingTextureId = (typeof LANDING_TEXTURE_OPTIONS)[number]['id']

const TEXTURE_SURFACE: Record<
  LandingTextureId,
  { roughness: number; metalness: number }
> = {
  standard: { roughness: 0.86, metalness: 0 },
  washed: { roughness: 0.94, metalness: 0 },
  ribbed: { roughness: 0.8, metalness: 0.02 },
  mesh: { roughness: 0.72, metalness: 0.04 },
  terry: { roughness: 0.98, metalness: 0 },
  crinkle: { roughness: 0.9, metalness: 0.01 },
}

export function landingClothOverrides({
  color,
  textureId = 'standard',
}: {
  color: string
  textureId?: LandingTextureId | string
}): MaterialOverride[] {
  const surface =
    TEXTURE_SURFACE[(textureId as LandingTextureId) ?? 'standard'] ??
    TEXTURE_SURFACE.standard

  return [
    {
      meshName: 'body',
      color,
      roughness: surface.roughness,
      metalness: surface.metalness,
    },
  ]
}

export function colorWithOpacity({
  color,
  opacity,
}: {
  color: string
  opacity: number
}): string {
  const trimmed = color.trim()
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  const rgb =
    hex.length === 3
      ? hex
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : hex.slice(0, 6).padEnd(6, '0')
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, '0')

  return `#${rgb}${alpha}`
}

/** Fill must never flood the panel atlas — map it to a wider brush stroke. */
export function resolveLandingStrokeTool({
  tool,
}: {
  tool: StrokeTool | 'Brush' | 'Eraser' | 'Fill'
}): { tool: StrokeTool; widthScale: number } {
  if (tool === 'eraser' || tool === 'Eraser') {
    return { tool: 'eraser', widthScale: 1 }
  }

  if (tool === 'fill' || tool === 'Fill') {
    return { tool: 'brush', widthScale: 2.4 }
  }

  return { tool: 'brush', widthScale: 1 }
}

export const LANDING_CAMERA_VIEWS = [
  'front',
  'back',
  'left',
  'right',
] as const

export type LandingCameraView = (typeof LANDING_CAMERA_VIEWS)[number]

export const LANDING_CAMERA_POSITIONS: Record<
  LandingCameraView,
  readonly [number, number, number]
> = {
  front: [0, 1.48, 4.1],
  back: [0.15, 1.48, -4.05],
  left: [-4.1, 1.48, 0],
  right: [4.1, 1.48, 0],
}

export function cameraViewAzimuth({
  view,
}: {
  view: LandingCameraView
}): number {
  if (view === 'back') {
    return Math.PI
  }

  if (view === 'left') {
    return -Math.PI / 2
  }

  if (view === 'right') {
    return Math.PI / 2
  }

  return 0
}

export type StudioEnvMode = 'studio' | 'outdoor'

export function studioEnvAppearance({
  envMode,
}: {
  envMode: StudioEnvMode
}): {
  background: string
  environmentIntensity: number
  exposure: number
  keyIntensity: number
} {
  if (envMode === 'outdoor') {
    return {
      background: '#87a4b8',
      environmentIntensity: 1.15,
      exposure: 1.28,
      keyIntensity: 2.35,
    }
  }

  return {
    background: '#1c1814',
    environmentIntensity: 0.72,
    exposure: 1.12,
    keyIntensity: 1.85,
  }
}

export const SAMPLE_SIZE_IDS = ['XS', 'S', 'M', 'L', 'XL'] as const

export type SampleSizeId = (typeof SAMPLE_SIZE_IDS)[number]

export function sampleSizeMeasurements({
  size,
}: {
  size: SampleSizeId
}): AvatarMeasurements {
  const presets: Record<SampleSizeId, AvatarMeasurements> = {
    XS: { height: 160, chest: 86, waist: 68 },
    S: { height: 168, chest: 92, waist: 72 },
    M: { height: 175, chest: 98, waist: 78 },
    L: { height: 180, chest: 102, waist: 80 },
    XL: { height: 188, chest: 112, waist: 88 },
  }

  return { ...presets[size] }
}

export function stampLandingGraphic({
  document,
  src,
  panel = 'front',
  x = 0.5,
  y = 0.48,
  scale = 0.28,
}: {
  document: DesignDocument
  src: string
  panel?: PanelId
  x?: number
  y?: number
  scale?: number
}): DesignDocument {
  if (!isSafeLayerSrc({ src })) {
    return document
  }

  const stack = createCommandStack({ document })

  return applyCommand({
    stack,
    command: {
      type: 'addGraphic',
      layer: {
        id: createObjectId({ prefix: 'mark' }),
        kind: 'graphic',
        panel,
        src,
        x,
        y,
        scale,
        rotation: 0,
        opacity: 1,
        visible: true,
      },
    },
  }).document
}

export function updateLandingGraphicTransform({
  document,
  layerId,
  x,
  y,
  scale,
}: {
  document: DesignDocument
  layerId: string
  x?: number
  y?: number
  scale?: number
}): DesignDocument {
  const stack = createCommandStack({ document })

  return applyCommand({
    stack,
    command: {
      type: 'updateLayer',
      layerId,
      patch: {
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(scale !== undefined ? { scale } : {}),
      },
    },
  }).document
}

export function latestLandingGraphicId({
  document,
}: {
  document: DesignDocument
}): string | null {
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]
    if (layer?.kind === 'graphic') {
      return layer.id
    }
  }

  return null
}

export function addLandingStroke({
  document,
  points,
  color,
  width,
  tool = 'brush',
  panel = 'front',
  opacity = 1,
}: {
  document: DesignDocument
  points: { x: number; y: number }[]
  color: string
  width: number
  tool?: StrokeTool | 'Brush' | 'Eraser' | 'Fill'
  panel?: PanelId
  opacity?: number
}): DesignDocument {
  if (points.length === 0) {
    return document
  }

  const resolved = resolveLandingStrokeTool({ tool })
  const stack = createCommandStack({ document })

  return applyCommand({
    stack,
    command: {
      type: 'addStroke',
      stroke: {
        id: createObjectId({ prefix: 'ink' }),
        panel,
        points: points.map((point) => ({ x: point.x, y: point.y })),
        color: colorWithOpacity({ color, opacity }),
        width: width * resolved.widthScale,
        tool: resolved.tool,
      },
    },
  }).document
}

export function applyLandingPattern({
  document,
  patternId,
  color,
  panel = 'front',
}: {
  document: DesignDocument
  patternId: 'solid' | 'stripe' | 'check' | 'gradient'
  color: string
  panel?: PanelId
}): DesignDocument {
  let next = document

  for (const layer of [...next.layers]) {
    if (layer.kind === 'pattern') {
      next = applyCommand({
        stack: createCommandStack({ document: next }),
        command: { type: 'removeLayer', layerId: layer.id },
      }).document
    }
  }

  if (patternId === 'solid') {
    return next
  }

  return applyCommand({
    stack: createCommandStack({ document: next }),
    command: {
      type: 'addPattern',
      layer: {
        id: createObjectId({ prefix: 'print' }),
        kind: 'pattern',
        patternId,
        panel,
        color,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        opacity: 0.85,
        visible: true,
      },
    },
  }).document
}
