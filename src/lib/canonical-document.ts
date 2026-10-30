/**
 * Canonical design document, schema v2 (FLP F04).
 *
 * The 2D document is the source of truth: the renderer, saves and
 * publication all derive from it. This module is the single strict
 * validator shared by the browser and the API. It never repairs input —
 * unknown fields, unknown kinds, out-of-range or non-finite numbers all
 * fail with a path so callers can surface or migrate them explicitly.
 *
 * Coordinates are panel-normalized with a bottom-left origin: x grows
 * right, y grows up, both in [0, 1] across the panel's print region, and
 * map to atlas UV through `panelPointToUv` unchanged. Sizes (object scale,
 * stroke width, pattern period) are fractions of atlas width, as the
 * renderer already draws them. Angles are radians in (-π, π], positive
 * turning clockwise on screen. None of these carry a physical unit.
 * See docs/canonical-document.md.
 */

export const CANONICAL_SCHEMA_VERSION = 2

export const CANONICAL_PANEL_IDS = ['front', 'back', 'left', 'right'] as const

export type CanonicalPanelId = (typeof CANONICAL_PANEL_IDS)[number]

export const TEMPLATE_IDS = ['tee-crew-short'] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const BASE_KINDS = ['solid', 'stripes', 'check'] as const

export type BaseKind = (typeof BASE_KINDS)[number]

export const CANONICAL_LAYER_KINDS = ['paint', 'image', 'text'] as const

export type CanonicalLayerKind = (typeof CANONICAL_LAYER_KINDS)[number]

export const CANONICAL_TEXT_FACES = ['display', 'sans'] as const

export type CanonicalTextFace = (typeof CANONICAL_TEXT_FACES)[number]

export const CANONICAL_LIMITS = {
  idLength: 64,
  nameLength: 40,
  textLength: 280,
  layersPerPanel: 40,
  strokesPerLayer: 2_000,
  pointsPerStroke: 4_096,
  minStrokeWidth: 0.002,
  maxStrokeWidth: 0.25,
  maxObjectScale: 1,
  minPatternPeriod: 0.02,
  maxPatternPeriod: 0.5,
  maxImageAspect: 20,
  maxIssues: 50,
} as const

/** Stored numbers keep six decimals, so π itself rounds to this bound. */
export const MAX_ANGLE = 3.141593

/** Pinned garment template. Changing geometry means a new version. */
export type TemplateRef = {
  id: TemplateId
  version: number
}

export type Color = `#${string}`

export type SolidBase = {
  kind: 'solid'
  color: Color
}

export type StripesBase = {
  kind: 'stripes'
  colors: [Color, Color]
  period: number
  angle: number
}

export type CheckBase = {
  kind: 'check'
  colors: [Color, Color]
  period: number
}

export type GarmentBase = SolidBase | StripesBase | CheckBase

export type BrushStroke = {
  id: string
  tool: 'brush'
  color: Color
  width: number
  opacity: number
  /** Flat [x0, y0, x1, y1, …] panel-normalized points. */
  points: number[]
}

export type EraserStroke = {
  id: string
  tool: 'eraser'
  width: number
  points: number[]
}

export type CanonicalStroke = BrushStroke | EraserStroke

type LayerCommon = {
  id: string
  visible: boolean
  opacity: number
  name?: string
}

export type Placement = {
  x: number
  y: number
  scale: number
  rotation: number
}

export type CanonicalPaintLayer = LayerCommon & {
  kind: 'paint'
  strokes: CanonicalStroke[]
}

export type CanonicalImageLayer = LayerCommon &
  Placement & {
    kind: 'image'
    /** Immutable uploaded asset; bytes never live in the document. */
    assetId: string
    /**
     * Natural width / height of the asset. The image is contained in a
     * `scale`-sided square, so aspect 1 reproduces legacy square stamps.
     */
    aspect: number
  }

export type CanonicalTextLayer = LayerCommon &
  Placement & {
    kind: 'text'
    content: string
    face: CanonicalTextFace
    color: Color
  }

export type CanonicalLayer =
  | CanonicalPaintLayer
  | CanonicalImageLayer
  | CanonicalTextLayer

/** Layers are ordered bottom to top. */
export type CanonicalPanel = {
  layers: CanonicalLayer[]
}

export type CanonicalDocument = {
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION
  template: TemplateRef
  base: GarmentBase
  panels: Record<CanonicalPanelId, CanonicalPanel>
}

export type ValidationIssue = {
  path: string
  message: string
}

export type ValidationResult =
  | { ok: true; document: CanonicalDocument }
  | { ok: false; issues: ValidationIssue[] }

const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const ASSET_ID_PATTERN = /^asset_[A-Za-z0-9_-]{8,64}$/
const COLOR_PATTERN = /^#[0-9a-f]{6}$/

type Context = {
  issues: ValidationIssue[]
  ids: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function report({
  context,
  path,
  message,
}: {
  context: Context
  path: string
  message: string
}) {
  if (context.issues.length < CANONICAL_LIMITS.maxIssues) {
    context.issues.push({ path, message })
  }
}

function checkRecord({
  context,
  value,
  path,
  required,
  optional = [],
}: {
  context: Context
  value: unknown
  path: string
  required: readonly string[]
  optional?: readonly string[]
}): Record<string, unknown> | null {
  if (!isRecord(value)) {
    report({ context, path, message: 'expected an object' })
    return null
  }

  const allowed = new Set([...required, ...optional])

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      report({ context, path: `${path}.${key}`, message: 'unknown field' })
    }
  }

  for (const key of required) {
    if (!(key in value)) {
      report({ context, path: `${path}.${key}`, message: 'required' })
    }
  }

  return value
}

function checkNumber({
  context,
  value,
  path,
  min,
  max,
  minExclusive = false,
  integer = false,
}: {
  context: Context
  value: unknown
  path: string
  min: number
  max: number
  minExclusive?: boolean
  integer?: boolean
}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    report({ context, path, message: 'expected a finite number' })
    return
  }

  if (integer && !Number.isInteger(value)) {
    report({ context, path, message: 'expected an integer' })
    return
  }

  const belowMin = minExclusive ? value <= min : value < min

  if (belowMin || value > max) {
    const lower = minExclusive ? `(${min}` : `[${min}`
    report({ context, path, message: `out of range ${lower}, ${max}]` })
  }
}

function checkEnum({
  context,
  value,
  path,
  options,
}: {
  context: Context
  value: unknown
  path: string
  options: readonly string[]
}) {
  if (typeof value !== 'string' || !options.includes(value)) {
    report({
      context,
      path,
      message: `expected one of ${options.join(', ')}`,
    })
  }
}

function checkColor({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    report({ context, path, message: 'expected lowercase #rrggbb' })
  }
}

function checkBoolean({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (typeof value !== 'boolean') {
    report({ context, path, message: 'expected a boolean' })
  }
}

function checkId({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > CANONICAL_LIMITS.idLength ||
    !ID_PATTERN.test(value)
  ) {
    report({ context, path, message: 'expected a stable id' })
    return
  }

  if (context.ids.has(value)) {
    report({ context, path, message: `duplicate id ${value}` })
    return
  }

  context.ids.add(value)
}

function checkArray({
  context,
  value,
  path,
  max,
}: {
  context: Context
  value: unknown
  path: string
  max: number
}): unknown[] | null {
  if (!Array.isArray(value)) {
    report({ context, path, message: 'expected an array' })
    return null
  }

  if (value.length > max) {
    report({ context, path, message: `more than ${max} items` })
    return null
  }

  return value
}

function checkTemplate({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  const template = checkRecord({ context, value, path, required: ['id', 'version'] })

  if (!template) {
    return
  }

  checkEnum({ context, value: template.id, path: `${path}.id`, options: TEMPLATE_IDS })
  checkNumber({
    context,
    value: template.version,
    path: `${path}.version`,
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    integer: true,
  })
}

function checkColorPair({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (!Array.isArray(value) || value.length !== 2) {
    report({ context, path, message: 'expected two colors' })
    return
  }

  value.forEach((color, index) => {
    checkColor({ context, value: color, path: `${path}[${index}]` })
  })
}

function checkBase({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (!isRecord(value)) {
    report({ context, path, message: 'expected an object' })
    return
  }

  if (value.kind === 'solid') {
    if (checkRecord({ context, value, path, required: ['kind', 'color'] })) {
      checkColor({ context, value: value.color, path: `${path}.color` })
    }
    return
  }

  if (value.kind === 'stripes' || value.kind === 'check') {
    const required =
      value.kind === 'stripes'
        ? ['kind', 'colors', 'period', 'angle']
        : ['kind', 'colors', 'period']

    if (!checkRecord({ context, value, path, required })) {
      return
    }

    checkColorPair({ context, value: value.colors, path: `${path}.colors` })
    checkNumber({
      context,
      value: value.period,
      path: `${path}.period`,
      min: CANONICAL_LIMITS.minPatternPeriod,
      max: CANONICAL_LIMITS.maxPatternPeriod,
    })

    if (value.kind === 'stripes') {
      checkNumber({
        context,
        value: value.angle,
        path: `${path}.angle`,
        min: -MAX_ANGLE,
        max: MAX_ANGLE,
        minExclusive: true,
      })
    }
    return
  }

  checkEnum({ context, value: value.kind, path: `${path}.kind`, options: BASE_KINDS })
}

function checkPoints({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  const points = checkArray({
    context,
    value,
    path,
    max: CANONICAL_LIMITS.pointsPerStroke * 2,
  })

  if (!points) {
    return
  }

  if (points.length < 2 || points.length % 2 !== 0) {
    report({ context, path, message: 'expected x, y pairs' })
    return
  }

  for (let index = 0; index < points.length; index += 1) {
    const coordinate = points[index]

    if (
      typeof coordinate !== 'number' ||
      !Number.isFinite(coordinate) ||
      coordinate < 0 ||
      coordinate > 1
    ) {
      report({
        context,
        path: `${path}[${index}]`,
        message: 'expected a finite number in [0, 1]',
      })
      return
    }
  }
}

function checkStroke({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (!isRecord(value)) {
    report({ context, path, message: 'expected an object' })
    return
  }

  if (value.tool !== 'brush' && value.tool !== 'eraser') {
    checkEnum({
      context,
      value: value.tool,
      path: `${path}.tool`,
      options: ['brush', 'eraser'],
    })
    return
  }

  const required =
    value.tool === 'brush'
      ? ['id', 'tool', 'color', 'width', 'opacity', 'points']
      : ['id', 'tool', 'width', 'points']

  if (!checkRecord({ context, value, path, required })) {
    return
  }

  checkId({ context, value: value.id, path: `${path}.id` })
  checkNumber({
    context,
    value: value.width,
    path: `${path}.width`,
    min: CANONICAL_LIMITS.minStrokeWidth,
    max: CANONICAL_LIMITS.maxStrokeWidth,
  })
  checkPoints({ context, value: value.points, path: `${path}.points` })

  if (value.tool === 'brush') {
    checkColor({ context, value: value.color, path: `${path}.color` })
    checkNumber({ context, value: value.opacity, path: `${path}.opacity`, min: 0, max: 1 })
  }
}

function checkPlacement({
  context,
  value,
  path,
}: {
  context: Context
  value: Record<string, unknown>
  path: string
}) {
  checkNumber({ context, value: value.x, path: `${path}.x`, min: 0, max: 1 })
  checkNumber({ context, value: value.y, path: `${path}.y`, min: 0, max: 1 })
  checkNumber({
    context,
    value: value.scale,
    path: `${path}.scale`,
    min: 0,
    max: CANONICAL_LIMITS.maxObjectScale,
    minExclusive: true,
  })
  checkNumber({
    context,
    value: value.rotation,
    path: `${path}.rotation`,
    min: -MAX_ANGLE,
    max: MAX_ANGLE,
    minExclusive: true,
  })
}

const LAYER_COMMON_FIELDS = ['id', 'kind', 'visible', 'opacity'] as const
const PLACEMENT_FIELDS = ['x', 'y', 'scale', 'rotation'] as const

const LAYER_FIELDS: Record<CanonicalLayerKind, readonly string[]> = {
  paint: [...LAYER_COMMON_FIELDS, 'strokes'],
  image: [...LAYER_COMMON_FIELDS, ...PLACEMENT_FIELDS, 'assetId', 'aspect'],
  text: [...LAYER_COMMON_FIELDS, ...PLACEMENT_FIELDS, 'content', 'face', 'color'],
}

function checkLayer({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  if (!isRecord(value)) {
    report({ context, path, message: 'expected an object' })
    return
  }

  const kind = value.kind

  if (kind !== 'paint' && kind !== 'image' && kind !== 'text') {
    checkEnum({
      context,
      value: kind,
      path: `${path}.kind`,
      options: CANONICAL_LAYER_KINDS,
    })
    return
  }

  if (
    !checkRecord({
      context,
      value,
      path,
      required: LAYER_FIELDS[kind],
      optional: ['name'],
    })
  ) {
    return
  }

  checkId({ context, value: value.id, path: `${path}.id` })
  checkBoolean({ context, value: value.visible, path: `${path}.visible` })
  checkNumber({ context, value: value.opacity, path: `${path}.opacity`, min: 0, max: 1 })

  if ('name' in value) {
    const name = value.name

    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      name.length > CANONICAL_LIMITS.nameLength
    ) {
      report({
        context,
        path: `${path}.name`,
        message: `expected 1–${CANONICAL_LIMITS.nameLength} characters`,
      })
    }
  }

  if (kind === 'paint') {
    const strokes = checkArray({
      context,
      value: value.strokes,
      path: `${path}.strokes`,
      max: CANONICAL_LIMITS.strokesPerLayer,
    })

    strokes?.forEach((stroke, index) => {
      checkStroke({ context, value: stroke, path: `${path}.strokes[${index}]` })
    })
    return
  }

  checkPlacement({ context, value, path })

  if (kind === 'image') {
    if (typeof value.assetId !== 'string' || !ASSET_ID_PATTERN.test(value.assetId)) {
      report({ context, path: `${path}.assetId`, message: 'expected an asset id' })
    }

    checkNumber({
      context,
      value: value.aspect,
      path: `${path}.aspect`,
      min: 1 / CANONICAL_LIMITS.maxImageAspect,
      max: CANONICAL_LIMITS.maxImageAspect,
    })
    return
  }

  if (
    typeof value.content !== 'string' ||
    value.content.trim().length === 0 ||
    value.content.length > CANONICAL_LIMITS.textLength
  ) {
    report({
      context,
      path: `${path}.content`,
      message: `expected 1–${CANONICAL_LIMITS.textLength} characters`,
    })
  }

  checkEnum({
    context,
    value: value.face,
    path: `${path}.face`,
    options: CANONICAL_TEXT_FACES,
  })
  checkColor({ context, value: value.color, path: `${path}.color` })
}

function checkPanels({
  context,
  value,
  path,
}: {
  context: Context
  value: unknown
  path: string
}) {
  const panels = checkRecord({ context, value, path, required: CANONICAL_PANEL_IDS })

  if (!panels) {
    return
  }

  for (const panelId of CANONICAL_PANEL_IDS) {
    const panelPath = `${path}.${panelId}`

    if (!(panelId in panels)) {
      continue
    }

    const panel = checkRecord({
      context,
      value: panels[panelId],
      path: panelPath,
      required: ['layers'],
    })

    if (!panel) {
      continue
    }

    const layers = checkArray({
      context,
      value: panel.layers,
      path: `${panelPath}.layers`,
      max: CANONICAL_LIMITS.layersPerPanel,
    })

    layers?.forEach((layer, index) => {
      checkLayer({ context, value: layer, path: `${panelPath}.layers[${index}]` })
    })
  }
}

export function validateCanonicalDocument({
  value,
}: {
  value: unknown
}): ValidationResult {
  const context: Context = { issues: [], ids: new Set() }

  const root = checkRecord({
    context,
    value,
    path: '$',
    required: ['schemaVersion', 'template', 'base', 'panels'],
  })

  if (root) {
    if (
      'schemaVersion' in root &&
      root.schemaVersion !== CANONICAL_SCHEMA_VERSION
    ) {
      report({
        context,
        path: '$.schemaVersion',
        message: `expected ${CANONICAL_SCHEMA_VERSION}`,
      })
    }

    if ('template' in root) {
      checkTemplate({ context, value: root.template, path: '$.template' })
    }

    if ('base' in root) {
      checkBase({ context, value: root.base, path: '$.base' })
    }

    if ('panels' in root) {
      checkPanels({ context, value: root.panels, path: '$.panels' })
    }
  }

  if (context.issues.length > 0) {
    return { ok: false, issues: context.issues }
  }

  return { ok: true, document: value as CanonicalDocument }
}

export function createEmptyCanonicalDocument(): CanonicalDocument {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    template: { id: 'tee-crew-short', version: 1 },
    // The template's own material colour, so an untouched tee renders as before.
    base: { kind: 'solid', color: '#f3efe6' },
    panels: {
      front: { layers: [] },
      back: { layers: [] },
      left: { layers: [] },
      right: { layers: [] },
    },
  }
}

/**
 * Atlas-relative size of an image layer: contained in a `scale`-sided
 * square, longest side equal to `scale`. Aspect 1 is the legacy square.
 */
export function imageBox({
  scale,
  aspect,
}: {
  scale: number
  aspect: number
}) {
  return aspect >= 1
    ? { width: scale, height: scale / aspect }
    : { width: scale * aspect, height: scale }
}
