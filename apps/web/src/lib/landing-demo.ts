import { currentTemplateFor } from './template-manifest'
import { showsGarmentInStudio } from './concept-flags'
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
  hoodie: 'tops',
  overall: 'tops',
  tailored: 'outerwear',
  jacket: 'outerwear',
  vest: 'tops',
  crop: 'tops',
  dress: 'outerwear',
  trousers: 'bottoms',
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
    (garment) =>
      garmentCategory({ garmentId: garment.id }) === category &&
      showsGarmentInStudio({ garmentId: garment.id }),
  )
}

/**
 * Pieces we plan to make but have no garment id, model or template for yet.
 * The picker shows them as Coming soon tiles so a category is never empty or
 * hidden. They are not `GarmentId`s, so nothing can select, save, search or
 * vote on them.
 */
export type PlannedGarment = { id: string; label: string; category: GarmentCategoryId }

export const PLANNED_GARMENTS: readonly PlannedGarment[] = [
  { id: 'cap', label: 'Cap', category: 'accessories' },
  { id: 'tote', label: 'Tote bag', category: 'accessories' },
  { id: 'beanie', label: 'Beanie', category: 'accessories' },
]

export function listPlannedGarments({ category }: { category: GarmentCategoryId }): PlannedGarment[] {
  return PLANNED_GARMENTS.filter((planned) => planned.category === category)
}

/** Every category with something to show: garments to pick, or ones coming soon. */
export function pickerCategories() {
  return GARMENT_CATEGORIES.filter(
    (entry) => listGarmentsByCategory({ category: entry.id }).length > 0 || listPlannedGarments({ category: entry.id }).length > 0,
  )
}

/** Why a saved design's other garments can't be picked, and the way out. */
export const LOCKED_GARMENT_NOTE = 'Saved designs keep their garment. Start a new design to switch.'

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

/**
 * The views, in the studio's tab order and with its names
 * (`garmentPanels`, landing-demo.test.ts holds them together): Front, Back,
 * then the wearer's right sleeve and left sleeve.
 */
export const LANDING_CAMERA_VIEWS = [
  'front',
  'back',
  'right',
  'left',
] as const

export type LandingCameraView = (typeof LANDING_CAMERA_VIEWS)[number]

/** Each view's button, as the studio names the side. */
export const LANDING_VIEW_LABEL: Record<LandingCameraView, string> = {
  front: 'Front',
  back: 'Back',
  right: 'Right sleeve',
  left: 'Left sleeve',
}

/**
 * The render panel each view draws on. Views are the wearer's sides; the
 * tee's render panels name sleeves by mesh side, so the wearer's left sleeve
 * is render panel `right` (the current tee template, checked in
 * landing-demo.test.ts).
 */
export const LANDING_VIEW_PANEL: Record<LandingCameraView, PanelId> = {
  front: 'front',
  back: 'back',
  left: 'right',
  right: 'left',
}

/**
 * Width / height of each panel of the landing's real tee, keyed by the
 * sketch's own panel names (what `LANDING_VIEW_PANEL` writes), which are the
 * tee's render panels. Read from the tee the hero draws, so a re-baked tee
 * brings its own shapes. The pad takes this shape, so its ink covers the
 * whole panel, sleeves included. landing-demo.test.ts checks them against
 * the rendered tee.
 */
export const LANDING_PANEL_ASPECT: Record<string, number> = Object.fromEntries(
  Object.values(currentTemplateFor({ templateId: 'tee-crew-short' }).regions).map((region) => [
    region.renderPanel,
    region.surface?.panelAspect ?? 1,
  ]),
)

/**
 * A point on the wide sketch pad, placed on a panel without stretching:
 * the pad fills the panel's width (or height, for a wider panel) and keeps
 * its own proportions, centred. `padAspect` and `panelAspect` are width / height.
 */
export function padToPanel({ x, y, padAspect, panelAspect }: { x: number; y: number; padAspect: number; panelAspect: number }) {
  if (padAspect >= panelAspect) {
    const height = panelAspect / padAspect
    return { x, y: 0.5 + (y - 0.5) * height }
  }

  const width = padAspect / panelAspect
  return { x: 0.5 + (x - 0.5) * width, y }
}

/**
 * A point on the pad as the sketch stores it. The hero tee's panels run
 * their y up the body (0 at the hem), while the pad runs down the screen,
 * so the pad is turned the right way up: what's drawn at its top lands at
 * the top of the panel, not the hem.
 */
export function padToSketch({ x, y, padAspect, panelAspect }: { x: number; y: number; padAspect: number; panelAspect: number }) {
  return padToPanel({ x, y: 1 - y, padAspect, panelAspect })
}

export const LANDING_CAMERA_POSITIONS: Record<
  LandingCameraView,
  readonly [number, number, number]
> = {
  front: [0, 1.48, 4.1],
  back: [0.15, 1.48, -4.05],
  // Sides are the wearer's, as on the studio's tabs: Left shows the left sleeve (+x).
  left: [4.1, 1.48, 0],
  right: [-4.1, 1.48, 0],
}

const FRONT_EDGE = Math.PI / 6
const BACK_EDGE = (5 * Math.PI) / 6
/** How far past an edge the camera must go before the side changes, so it doesn't flicker on one. */
const SIDE_HYSTERESIS = 0.12

function sideZone({ side, azimuth, widen }: { side: LandingCameraView; azimuth: number; widen: number }) {
  const turn = Math.abs(azimuth)

  if (side === 'front') return turn <= FRONT_EDGE + widen
  if (side === 'back') return turn >= BACK_EDGE - widen
  const sign = side === 'left' ? 1 : -1
  return sign * azimuth > FRONT_EDGE - widen && sign * azimuth < BACK_EDGE + widen
}

/**
 * The side a camera at `azimuth` (radians round the tee, 0 = the front,
 * +π/2 = the wearer's left) mostly shows: a sixth of the turn each for the
 * front and back, the rest for the sleeves, which show from a quarter view.
 * `previous` is kept until the camera is clearly past its edge.
 */
export function sideAtAzimuth({ azimuth, previous }: { azimuth: number; previous?: LandingCameraView }): LandingCameraView {
  const angle = Math.atan2(Math.sin(azimuth), Math.cos(azimuth))

  if (previous && sideZone({ side: previous, azimuth: angle, widen: SIDE_HYSTERESIS })) {
    return previous
  }

  return LANDING_CAMERA_VIEWS.find((side) => sideZone({ side, azimuth: angle, widen: 0 })) ?? 'front'
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
    return Math.PI / 2
  }

  if (view === 'right') {
    return -Math.PI / 2
  }

  return 0
}

export type StudioEnvMode = 'studio' | 'outdoor'

export function studioEnvAppearance({
  envMode,
}: {
  envMode: StudioEnvMode
}): {
  /** Top of the seamless backdrop; published stills show this behind the garment. */
  background: string
  /** Bottom of the backdrop. A touch darker, so the floor and the tee's shadow read. */
  backgroundLow: string
  environmentIntensity: number
  exposure: number
  keyIntensity: number
} {
  if (envMode === 'outdoor') {
    return {
      background: '#87a4b8',
      backgroundLow: '#c4d2d6',
      environmentIntensity: 1.15,
      exposure: 1.05,
      keyIntensity: 2.35,
    }
  }

  return {
    // A pale, warm grey sweep. It was pure white, which a white garment
    // matched once Neutral tone mapping drew white cloth as white (the
    // trousers' edges vanished); the light grey keeps an edge on every cloth.
    background: '#efeeeb',
    backgroundLow: '#e0ded9',
    environmentIntensity: 0.68,
    // With Neutral tone mapping (StudioRenderer) the lit cloth meets its swatch here.
    exposure: 0.8,
    keyIntensity: 1.7,
  }
}

/** The backdrop as CSS, shown behind a canvas until its first frame draws. */
export function studioStageBackdrop({
  envMode = 'studio',
}: {
  envMode?: StudioEnvMode
} = {}) {
  const { background, backgroundLow } = studioEnvAppearance({ envMode })

  return `linear-gradient(180deg, ${background}, ${backgroundLow})`
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

/** How far one Smaller / Larger press resizes a logo, and the sizes it stays between. */
export const LANDING_SCALE_STEP = 1.25
const LANDING_SCALE_RANGE = { min: 0.08, max: 0.9 } as const

export function scaleLandingGraphic({
  document,
  layerId,
  factor,
}: {
  document: DesignDocument
  layerId: string
  factor: number
}): DesignDocument {
  const layer = document.layers.find((entry) => entry.id === layerId)

  if (layer?.kind !== 'graphic') {
    return document
  }

  const scale = Math.min(LANDING_SCALE_RANGE.max, Math.max(LANDING_SCALE_RANGE.min, layer.scale * factor))
  return scale === layer.scale ? document : updateLandingGraphicTransform({ document, layerId, scale })
}

export function removeLandingGraphic({
  document,
  layerId,
}: {
  document: DesignDocument
  layerId: string
}): DesignDocument {
  if (!document.layers.some((layer) => layer.id === layerId && layer.kind === 'graphic')) {
    return document
  }

  return applyCommand({
    stack: createCommandStack({ document }),
    command: { type: 'removeLayer', layerId },
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
