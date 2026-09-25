import {
  type Design,
  type GarmentId,
  type MaterialOverride,
  resolveGarmentId,
} from './design-schema.ts'
import { isSafeLayerSrc, sanitizeArtMap } from './look-thumbnail.ts'

export const PANEL_IDS = ['front', 'back', 'left', 'right'] as const

export type PanelId = (typeof PANEL_IDS)[number]

/** Legacy panel id from drafts published before four-sided panels. */
const LEGACY_PANEL_ALIASES: Record<string, PanelId> = {
  sleeve: 'left',
}

const OPPOSITE_PANELS: Record<PanelId, PanelId> = {
  front: 'back',
  back: 'front',
  left: 'right',
  right: 'left',
}

export function oppositePanel({ panel }: { panel: PanelId }): PanelId {
  return OPPOSITE_PANELS[panel]
}

export const LAYER_KINDS = ['paint', 'graphic', 'text', 'art', 'pattern'] as const

export type LayerKind = (typeof LAYER_KINDS)[number]

export const STROKE_TOOLS = ['brush', 'eraser'] as const

export type StrokeTool = (typeof STROKE_TOOLS)[number]

export const TEXT_FACES = ['display', 'sans'] as const

export type TextFace = (typeof TEXT_FACES)[number]

export const NECK_IDS = ['crew', 'v'] as const

export type NeckId = (typeof NECK_IDS)[number]

export const HEM_IDS = ['crop', 'long'] as const

export type HemId = (typeof HEM_IDS)[number]

export const SLEEVE_IDS = ['short', 'long'] as const

export type SleeveId = (typeof SLEEVE_IDS)[number]

export const PATTERN_IDS = ['stripe', 'check', 'gradient'] as const

export type PatternId = (typeof PATTERN_IDS)[number]

export type StrokePoint = {
  x: number
  y: number
  p?: number
}

export type Stroke = {
  id: string
  panel: PanelId
  points: StrokePoint[]
  color: string
  width: number
  tool: StrokeTool
}

export type PaintLayer = {
  id: string
  kind: 'paint'
  visible: boolean
  strokes: Stroke[]
}

export type GraphicLayer = {
  id: string
  kind: 'graphic'
  panel: PanelId
  src: string
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  color?: string
  visible: boolean
}

export type TextLayer = {
  id: string
  kind: 'text'
  panel: PanelId
  content: string
  face: TextFace
  color: string
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  visible: boolean
}

export type ArtLayer = {
  id: string
  kind: 'art'
  src: string
  locked: true
  visible: boolean
}

export type PatternLayer = {
  id: string
  kind: 'pattern'
  patternId: PatternId
  panel: PanelId
  color: string
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  visible: boolean
}

export type DesignLayer =
  | PaintLayer
  | GraphicLayer
  | TextLayer
  | ArtLayer
  | PatternLayer

export type StructuralParams = {
  neck?: NeckId
  hem?: HemId
  sleeve?: SleeveId
}

export type DesignDocument = {
  garmentId: GarmentId
  garmentVersion: number
  structural: StructuralParams
  overrides: MaterialOverride[]
  layers: DesignLayer[]
}

const PANEL_ID_SET = new Set<string>(PANEL_IDS)
const LAYER_KIND_SET = new Set<string>(LAYER_KINDS)
const STROKE_TOOL_SET = new Set<string>(STROKE_TOOLS)
const TEXT_FACE_SET = new Set<string>(TEXT_FACES)
const NECK_ID_SET = new Set<string>(NECK_IDS)
const HEM_ID_SET = new Set<string>(HEM_IDS)
const SLEEVE_ID_SET = new Set<string>(SLEEVE_IDS)
const PATTERN_ID_SET = new Set<string>(PATTERN_IDS)

export function createObjectId({ prefix }: { prefix: string }) {
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  return `${prefix}-${entropy}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function asString({ value, fallback = '' }: { value: unknown; fallback?: string }) {
  return typeof value === 'string' ? value : fallback
}

function asNumber({
  value,
  fallback,
}: {
  value: unknown
  fallback: number
}) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean({
  value,
  fallback,
}: {
  value: unknown
  fallback: boolean
}) {
  return typeof value === 'boolean' ? value : fallback
}

function parsePanelId({ value }: { value: unknown }): PanelId {
  const raw = asString({ value })
  const aliased = LEGACY_PANEL_ALIASES[raw]

  if (aliased) {
    return aliased
  }

  return PANEL_ID_SET.has(raw) ? (raw as PanelId) : 'front'
}

function parseOpacity({ value }: { value: unknown }) {
  return Math.min(
    1,
    Math.max(0, asNumber({ value, fallback: 1 })),
  )
}

function parseStrokePoint({ value }: { value: unknown }): StrokePoint | null {
  if (!isRecord(value)) {
    return null
  }

  const x = asNumber({ value: value.x, fallback: Number.NaN })
  const y = asNumber({ value: value.y, fallback: Number.NaN })

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  const point: StrokePoint = { x, y }
  const pressure = asNumber({ value: value.p, fallback: Number.NaN })

  if (Number.isFinite(pressure)) {
    point.p = pressure
  }

  return point
}

function parseStroke({ value }: { value: unknown }): Stroke | null {
  if (!isRecord(value)) {
    return null
  }

  const id = asString({ value: value.id }).trim()
  const color = asString({ value: value.color }).trim()
  const tool = asString({ value: value.tool })

  if (!id || !color || !Array.isArray(value.points)) {
    return null
  }

  const points = value.points
    .map((point) => parseStrokePoint({ value: point }))
    .filter((point): point is StrokePoint => point !== null)

  return {
    id,
    panel: parsePanelId({ value: value.panel }),
    points,
    color,
    width: Math.max(0.002, asNumber({ value: value.width, fallback: 0.02 })),
    tool: STROKE_TOOL_SET.has(tool) ? (tool as StrokeTool) : 'brush',
  }
}

function parsePaintLayer({
  record,
  id,
}: {
  record: Record<string, unknown>
  id: string
}): PaintLayer {
  const strokes = Array.isArray(record.strokes)
    ? record.strokes
        .map((value) => parseStroke({ value }))
        .filter((stroke): stroke is Stroke => stroke !== null)
    : []

  return {
    id,
    kind: 'paint',
    visible: asBoolean({ value: record.visible, fallback: true }),
    strokes,
  }
}

function parseGraphicLayer({
  record,
  id,
}: {
  record: Record<string, unknown>
  id: string
}): GraphicLayer | null {
  const src = asString({ value: record.src }).trim()

  if (!isSafeLayerSrc({ src })) {
    return null
  }

  const color = asString({ value: record.color }).trim()

  return {
    id,
    kind: 'graphic',
    panel: parsePanelId({ value: record.panel }),
    src,
    x: asNumber({ value: record.x, fallback: 0.5 }),
    y: asNumber({ value: record.y, fallback: 0.5 }),
    scale: asNumber({ value: record.scale, fallback: 0.32 }),
    rotation: asNumber({ value: record.rotation, fallback: 0 }),
    opacity: parseOpacity({ value: record.opacity }),
    ...(color ? { color } : {}),
    visible: asBoolean({ value: record.visible, fallback: true }),
  }
}

function parseTextLayer({
  record,
  id,
}: {
  record: Record<string, unknown>
  id: string
}): TextLayer | null {
  const content = asString({ value: record.content })
  const face = asString({ value: record.face, fallback: 'display' })

  return {
    id,
    kind: 'text',
    panel: parsePanelId({ value: record.panel }),
    content,
    face: TEXT_FACE_SET.has(face) ? (face as TextFace) : 'display',
    color: asString({ value: record.color, fallback: '#1a1c22' }),
    x: asNumber({ value: record.x, fallback: 0.5 }),
    y: asNumber({ value: record.y, fallback: 0.42 }),
    scale: asNumber({ value: record.scale, fallback: 0.12 }),
    rotation: asNumber({ value: record.rotation, fallback: 0 }),
    opacity: parseOpacity({ value: record.opacity }),
    visible: asBoolean({ value: record.visible, fallback: true }),
  }
}

function parseArtLayer({
  record,
  id,
}: {
  record: Record<string, unknown>
  id: string
}): ArtLayer | null {
  const src = sanitizeArtMap({ artMap: asString({ value: record.src }).trim() })

  if (!src) {
    return null
  }

  return {
    id,
    kind: 'art',
    src,
    locked: true,
    visible: asBoolean({ value: record.visible, fallback: true }),
  }
}

export function parseLayer({ value }: { value: unknown }): DesignLayer | null {
  if (!isRecord(value)) {
    return null
  }

  const kind = asString({ value: value.kind })
  const id = asString({ value: value.id }).trim()

  if (!id || !LAYER_KIND_SET.has(kind)) {
    return null
  }

  if (kind === 'paint') {
    return parsePaintLayer({ record: value, id })
  }

  if (kind === 'graphic') {
    return parseGraphicLayer({ record: value, id })
  }

  if (kind === 'text') {
    return parseTextLayer({ record: value, id })
  }

  if (kind === 'pattern') {
    return parsePatternLayer({ record: value, id })
  }

  return parseArtLayer({ record: value, id })
}

function parsePatternLayer({
  record,
  id,
}: {
  record: Record<string, unknown>
  id: string
}): PatternLayer | null {
  const patternId = asString({ value: record.patternId })

  if (!PATTERN_ID_SET.has(patternId)) {
    return null
  }

  return {
    id,
    kind: 'pattern',
    patternId: patternId as PatternId,
    panel: parsePanelId({ value: record.panel }),
    color: asString({ value: record.color, fallback: '#1a1c22' }),
    x: asNumber({ value: record.x, fallback: 0.5 }),
    y: asNumber({ value: record.y, fallback: 0.5 }),
    scale: asNumber({ value: record.scale, fallback: 0.42 }),
    rotation: asNumber({ value: record.rotation, fallback: 0 }),
    opacity: parseOpacity({ value: record.opacity }),
    visible: asBoolean({ value: record.visible, fallback: true }),
  }
}

export function parseStructural({
  value,
}: {
  value: unknown
}): StructuralParams {
  if (!isRecord(value)) {
    return {}
  }

  const next: StructuralParams = {}
  const neck = asString({ value: value.neck })
  const hem = asString({ value: value.hem })
  const sleeve = asString({ value: value.sleeve })

  if (NECK_ID_SET.has(neck)) {
    next.neck = neck as NeckId
  }

  if (HEM_ID_SET.has(hem)) {
    next.hem = hem as HemId
  }

  if (SLEEVE_ID_SET.has(sleeve)) {
    next.sleeve = sleeve as SleeveId
  }

  return next
}

export function createEmptyPaintLayer(): PaintLayer {
  return {
    id: createObjectId({ prefix: 'paint' }),
    kind: 'paint',
    visible: true,
    strokes: [],
  }
}

export function createEmptyDocument({
  garmentId,
}: {
  garmentId?: string | null
} = {}): DesignDocument {
  return {
    garmentId: resolveGarmentId({ garmentId }),
    garmentVersion: resolveGarmentId({ garmentId }) === 'tee' ? 2 : 1,
    structural: {},
    overrides: [],
    layers: [createEmptyPaintLayer()],
  }
}

export function cloneDocument({
  document,
}: {
  document: DesignDocument
}): DesignDocument {
  return structuredClone(document)
}

export function parseDocument({
  value,
}: {
  value: unknown
}): DesignDocument | null {
  if (!isRecord(value)) {
    return null
  }

  const layers = Array.isArray(value.layers)
    ? value.layers
        .map((layer) => parseLayer({ value: layer }))
        .filter((layer): layer is DesignLayer => layer !== null)
    : []

  const overrides = Array.isArray(value.overrides)
    ? value.overrides.filter((override): override is MaterialOverride => {
        return isRecord(override) && typeof override.meshName === 'string'
      })
    : []

  return {
    garmentId: resolveGarmentId({
      garmentId:
        typeof value.garmentId === 'string' ? value.garmentId : undefined,
    }),
    garmentVersion: Math.max(
      1,
      Math.floor(asNumber({ value: value.garmentVersion, fallback: 1 })),
    ),
    structural: parseStructural({ value: value.structural }),
    overrides: overrides.map((override) => ({ ...override })),
    layers: layers.length > 0 ? layers : [createEmptyPaintLayer()],
  }
}

export const MAX_PUBLISH_GRAPHIC_CHARS = 80_000

export function sanitizePublishedDocument({
  document,
}: {
  document: DesignDocument
}): DesignDocument | undefined {
  const parsed = parseDocument({ value: document })

  if (!parsed) {
    return undefined
  }

  const layers = parsed.layers
    .filter((layer) => layer.kind !== 'art')
    .map((layer) => {
      if (layer.kind !== 'graphic') {
        return layer
      }

      if (layer.src.length > MAX_PUBLISH_GRAPHIC_CHARS) {
        return null
      }

      return layer
    })
    .filter(
      (
        layer,
      ): layer is Exclude<DesignLayer, { kind: 'art' }> => layer !== null,
    )

  if (
    layers.every(
      (layer) => layer.kind === 'paint' && layer.strokes.length === 0,
    )
  ) {
    const hasStructural = Object.keys(parsed.structural).length > 0
    const hasOverrides = parsed.overrides.length > 0

    if (!hasStructural && !hasOverrides) {
      return {
        ...parsed,
        layers: layers.length > 0 ? layers : [createEmptyPaintLayer()],
      }
    }
  }

  return {
    ...parsed,
    layers: layers.length > 0 ? layers : [createEmptyPaintLayer()],
  }
}

export function documentFromDesign({
  design,
}: {
  design: Pick<
    Design,
    'garmentId' | 'overrides' | 'artMap' | 'structural' | 'document'
  >
}): DesignDocument {
  if (design.document) {
    const fromStored = parseDocument({ value: design.document })

    if (fromStored) {
      return fromStored
    }
  }

  const document = createEmptyDocument({ garmentId: design.garmentId })
  document.overrides = design.overrides.map((override) => ({ ...override }))
  document.structural = parseStructural({ value: design.structural })

  const artMap = design.artMap
    ? sanitizeArtMap({ artMap: design.artMap })
    : ''

  if (artMap) {
    document.layers.unshift({
      id: createObjectId({ prefix: 'art' }),
      kind: 'art',
      src: artMap,
      locked: true,
      visible: true,
    })
  }

  return document
}

export function documentHasInk({
  document,
}: {
  document: DesignDocument
}) {
  return document.layers.some((layer) => {
    if (!layer.visible) {
      return false
    }

    if (layer.kind === 'paint') {
      return layer.strokes.length > 0
    }

    if (layer.kind === 'text') {
      return layer.content.trim().length > 0
    }

    return (
      layer.kind === 'graphic' ||
      layer.kind === 'art' ||
      layer.kind === 'pattern'
    )
  })
}

export function activePaintLayer({
  document,
}: {
  document: DesignDocument
}): PaintLayer {
  const found = document.layers.find(
    (layer): layer is PaintLayer => layer.kind === 'paint' && layer.visible,
  )

  if (found) {
    return found
  }

  const created = createEmptyPaintLayer()
  document.layers.push(created)
  return created
}
