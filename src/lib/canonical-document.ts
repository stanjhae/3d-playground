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

import { MOTIF_IDS, type MotifId } from './base-motifs'
import {
  type GarmentShape,
  isNeutralShape,
  neutralShapeFor,
  SHAPE_FIELDS,
  SHAPE_LIMITS,
  type ShapeField,
  type ShapeLimits,
  shapeSpecFor,
} from './garment-shape-params.ts'
import { BASE_FABRIC_IDS, type BaseFabricId } from './fabrics.ts'
import { type CanonicalPattern, checkPattern } from './pattern/pattern-document.ts'
import {
  currentTemplateFor,
  isUpcomingTemplate,
  isUpcomingTemplateVersion,
  READABLE_TEMPLATE_IDS,
  resolveTemplate,
  TEMPLATE_IDS,
} from './template-manifest.ts'

export { TEMPLATE_IDS }

export const CANONICAL_SCHEMA_VERSION = 2

/** The tee's panels. Each template names its own; see `panelIdsOf`. */
export const CANONICAL_PANEL_IDS = ['front', 'back', 'left', 'right'] as const

/** A panel id from the document's template (`template.regions`). */
export type CanonicalPanelId = string

/** A key of `TEMPLATE_ARCHIVE` in template-manifest.ts. */
export type TemplateId = string

export const BASE_KINDS = ['solid', 'stripes', 'check', 'motif'] as const

export type BaseKind = (typeof BASE_KINDS)[number]

export const CANONICAL_LAYER_KINDS = ['paint', 'image', 'text', 'fill'] as const

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
  /** Panels a document on an upcoming template may name (pattern-reader R). */
  upcomingPanels: 8,
  /** One repeat of a `fill` layer, as a fraction of its panel's width (reader R2). */
  minFillTile: 0.05,
  maxFillTile: 1,
} as const

/** The cloth a `base.fabric` may name: a base preset of `fabrics.ts` (reader R2). */
export const CANONICAL_FABRIC_IDS = BASE_FABRIC_IDS

export type CanonicalFabricId = BaseFabricId

/** The patterns a `fill` layer may repeat; the base's own two. */
export const FILL_PATTERNS = ['stripes', 'check'] as const

export type FillPattern = (typeof FILL_PATTERNS)[number]

/** Stored numbers keep six decimals, so π itself rounds to this bound. */
export const MAX_ANGLE = 3.141593

/** Pinned garment template. Changing geometry means a new version. */
export type TemplateRef = {
  id: TemplateId
  version: number
}

export type Color = `#${string}`

/**
 * The garment's cloth (reader R2): a base preset id, on any kind of base.
 * Left out when unset, so a design without one hashes as it always did.
 */
type BaseFabric = {
  fabric?: CanonicalFabricId
}

export type SolidBase = BaseFabric & {
  kind: 'solid'
  color: Color
}

export type StripesBase = BaseFabric & {
  kind: 'stripes'
  colors: [Color, Color]
  period: number
  angle: number
}

export type CheckBase = BaseFabric & {
  kind: 'check'
  colors: [Color, Color]
  period: number
}

/** A two-colour motif (`base-motifs.ts`): dots, honeycomb, leopard and the rest. */
export type MotifBase = BaseFabric & {
  kind: 'motif'
  motif: MotifId
  colors: [Color, Color]
  period: number
}

export type GarmentBase = SolidBase | StripesBase | CheckBase | MotifBase

export type BrushStroke = {
  id: string
  tool: 'brush'
  color: Color
  width: number
  opacity: number
  /** Flat [x0, y0, x1, y1, …] panel-normalized points. */
  points: number[]
  /** Pen pressure per point, 0–1; left out when the stroke has none. */
  pressures?: number[]
}

export type EraserStroke = {
  id: string
  tool: 'eraser'
  width: number
  points: number[]
  /** Pen pressure per point, 0–1; left out when the stroke has none. */
  pressures?: number[]
}

export type CanonicalStroke = BrushStroke | EraserStroke

type LayerCommon = {
  id: string
  visible: boolean
  opacity: number
  name?: string
  /** Can't be selected or moved on the panel; left out when unlocked. */
  locked?: true
}

/** Mirrored about the object's own axes; each is left out when off. */
type Flips = {
  flipX?: true
  flipY?: true
}

export type Placement = {
  x: number
  y: number
  scale: number
  rotation: number
  /**
   * Height when it differs from the width (reader R2): the object is
   * stretched along its own y axis. Same bounds as `scale`; left out when
   * uniform, so `scale` sizes both axes.
   */
  scaleY?: number
}

export type CanonicalPaintLayer = LayerCommon & {
  kind: 'paint'
  strokes: CanonicalStroke[]
}

export type CanonicalImageLayer = LayerCommon &
  Placement &
  Flips & {
    kind: 'image'
    /** Immutable uploaded asset; bytes never live in the document. */
    assetId: string
    /**
     * Natural width / height of the asset. The image is contained in a
     * `scale`-sided square, so aspect 1 reproduces legacy square stamps.
     */
    aspect: number
    /**
     * Colour strength: 0 is black and white, 1 as uploaded (left out), up
     * to 2 for richer colour (tester, 22 Nov).
     */
    saturation?: number
  }

export type CanonicalTextLayer = LayerCommon &
  Placement &
  Flips & {
    kind: 'text'
    content: string
    face: CanonicalTextFace
    color: Color
  }

/** What a `fill` layer repeats: an uploaded image, or stripes or a check. */
export type FillSource =
  | {
      assetId: string
      /** Natural width / height of the asset, as on an image layer. */
      aspect: number
    }
  | {
      pattern: FillPattern
      /** Ground, then stripe (or check) colour, as on the base. */
      colors: [Color, Color]
    }

/**
 * A pattern covering its whole panel (reader R2), drawn in layer order and
 * clipped to the panel. It has no position: it is selected from the layer
 * list, never dragged on the panel.
 */
export type CanonicalFillLayer = LayerCommon & {
  kind: 'fill'
  source: FillSource
  /** One repeat, as a fraction of the panel's width. */
  tile: number
  /** Radians in (−π, π], positive clockwise, about the panel's centre. */
  rotation: number
  /** Phase along the pattern's own axes, as a fraction of one repeat; left out when 0. */
  offsetX?: number
  offsetY?: number
}

export type CanonicalLayer =
  | CanonicalPaintLayer
  | CanonicalImageLayer
  | CanonicalTextLayer
  | CanonicalFillLayer

/** Layers are ordered bottom to top. */
export type CanonicalPanel = {
  layers: CanonicalLayer[]
}

/**
 * Parametric shape (v1): the template's fields (`shapeSpecFor`; the tee's
 * five), each a fraction, 0 neutral, within the template's limits. Stored
 * only when one is off neutral, and only on a template with a shape map
 * (`templateHasShape`), so an unshaped design hashes as it always did.
 */
export type CanonicalShape = GarmentShape

export type CanonicalDocument = {
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION
  template: TemplateRef
  base: GarmentBase
  panels: Record<CanonicalPanelId, CanonicalPanel>
  /** Left out when neutral; see `CanonicalShape`. */
  shape?: CanonicalShape
  /**
   * Pattern mode (pattern v1): the garment as sewing-pattern pieces, draped
   * into the 3D garment. Present only on a design that uses it, and never
   * alongside `shape`: entering pattern mode folds the shape into the pieces.
   */
  pattern?: CanonicalPattern
}

/** The panels this document's template prints on, in template order. */
export function panelIdsOf({ document }: { document: Pick<CanonicalDocument, 'panels'> }) {
  return Object.keys(document.panels)
}

/** The panels a template prints on; the tee's when the template is unknown. */
export function templatePanelIds({ template }: { template: { id: string; version: number } }) {
  const resolved = resolveTemplate(template)

  if (resolved.ok) {
    return Object.keys(resolved.manifest.regions)
  }

  // A version a later release bakes keeps its template's panels (reader R2).
  return isUpcomingTemplateVersion(template)
    ? Object.keys(currentTemplateFor({ templateId: template.id }).regions)
    : [...CANONICAL_PANEL_IDS]
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

  checkEnum({ context, value: template.id, path: `${path}.id`, options: READABLE_TEMPLATE_IDS })
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

  if ('fabric' in value && (value.kind === 'solid' || value.kind === 'stripes' || value.kind === 'check' || value.kind === 'motif')) {
    checkEnum({ context, value: value.fabric, path: `${path}.fabric`, options: CANONICAL_FABRIC_IDS })
  }

  if (value.kind === 'solid') {
    if (checkRecord({ context, value, path, required: ['kind', 'color'], optional: ['fabric'] })) {
      checkColor({ context, value: value.color, path: `${path}.color` })
    }
    return
  }

  if (value.kind === 'motif') {
    if (!checkRecord({ context, value, path, required: ['kind', 'motif', 'colors', 'period'], optional: ['fabric'] })) {
      return
    }

    checkEnum({ context, value: value.motif, path: `${path}.motif`, options: MOTIF_IDS })
    checkColorPair({ context, value: value.colors, path: `${path}.colors` })
    checkNumber({
      context,
      value: value.period,
      path: `${path}.period`,
      min: CANONICAL_LIMITS.minPatternPeriod,
      max: CANONICAL_LIMITS.maxPatternPeriod,
    })
    return
  }

  if (value.kind === 'stripes' || value.kind === 'check') {
    const required =
      value.kind === 'stripes'
        ? ['kind', 'colors', 'period', 'angle']
        : ['kind', 'colors', 'period']

    if (!checkRecord({ context, value, path, required, optional: ['fabric'] })) {
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

  if (!checkRecord({ context, value, path, required, optional: ['pressures'] })) {
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

  if ('pressures' in value) {
    checkPressures({ context, value: value.pressures, points: value.points, path: `${path}.pressures` })
  }

  if (value.tool === 'brush') {
    checkColor({ context, value: value.color, path: `${path}.color` })
    checkNumber({ context, value: value.opacity, path: `${path}.opacity`, min: 0, max: 1 })
  }
}

/** One pressure per point, each in [0, 1]. */
function checkPressures({
  context,
  value,
  points,
  path,
}: {
  context: Context
  value: unknown
  points: unknown
  path: string
}) {
  const pressures = checkArray({ context, value, path, max: CANONICAL_LIMITS.pointsPerStroke })

  if (!pressures) {
    return
  }

  if (!Array.isArray(points) || pressures.length * 2 !== points.length) {
    report({ context, path, message: 'expected one pressure per point' })
    return
  }

  const bad = pressures.findIndex(
    (pressure) => typeof pressure !== 'number' || !Number.isFinite(pressure) || pressure < 0 || pressure > 1,
  )

  if (bad !== -1) {
    report({ context, path: `${path}[${bad}]`, message: 'expected a finite number in [0, 1]' })
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

  if ('scaleY' in value) {
    checkNumber({
      context,
      value: value.scaleY,
      path: `${path}.scaleY`,
      min: 0,
      max: CANONICAL_LIMITS.maxObjectScale,
      minExclusive: true,
    })

    // One form per look: a uniform object leaves `scaleY` out.
    if (value.scaleY === value.scale) {
      report({ context, path: `${path}.scaleY`, message: 'equal to scale; leave it out' })
    }
  }
}

/** A fill's repeat: an uploaded image, or one of the base's two patterns. */
function checkFillSource({
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

  if ('assetId' in value) {
    if (!checkRecord({ context, value, path, required: ['assetId', 'aspect'] })) {
      return
    }

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

  if ('pattern' in value) {
    if (!checkRecord({ context, value, path, required: ['pattern', 'colors'] })) {
      return
    }

    checkEnum({ context, value: value.pattern, path: `${path}.pattern`, options: FILL_PATTERNS })
    checkColorPair({ context, value: value.colors, path: `${path}.colors` })
    return
  }

  report({ context, path, message: 'expected an assetId or a pattern' })
}

function checkFill({
  context,
  value,
  path,
}: {
  context: Context
  value: Record<string, unknown>
  path: string
}) {
  checkFillSource({ context, value: value.source, path: `${path}.source` })
  checkNumber({
    context,
    value: value.tile,
    path: `${path}.tile`,
    min: CANONICAL_LIMITS.minFillTile,
    max: CANONICAL_LIMITS.maxFillTile,
  })
  checkNumber({
    context,
    value: value.rotation,
    path: `${path}.rotation`,
    min: -MAX_ANGLE,
    max: MAX_ANGLE,
    minExclusive: true,
  })

  // A phase of 0 is written as no phase, and a whole repeat is 0 again.
  for (const offset of ['offsetX', 'offsetY'] as const) {
    if (offset in value) {
      checkNumber({ context, value: value[offset], path: `${path}.${offset}`, min: 0, max: 1, minExclusive: true })

      if (value[offset] === 1) {
        report({ context, path: `${path}.${offset}`, message: 'a whole repeat; leave it out' })
      }
    }
  }
}

const LAYER_COMMON_FIELDS = ['id', 'kind', 'visible', 'opacity'] as const
const PLACEMENT_FIELDS = ['x', 'y', 'scale', 'rotation'] as const

const LAYER_FIELDS: Record<CanonicalLayerKind, readonly string[]> = {
  paint: [...LAYER_COMMON_FIELDS, 'strokes'],
  image: [...LAYER_COMMON_FIELDS, ...PLACEMENT_FIELDS, 'assetId', 'aspect'],
  text: [...LAYER_COMMON_FIELDS, ...PLACEMENT_FIELDS, 'content', 'face', 'color'],
  fill: [...LAYER_COMMON_FIELDS, 'source', 'tile', 'rotation'],
}

/** The richest colour an image may be given (`saturation`); 0 is black and white. */
export const IMAGE_SATURATION_MAX = 2

const LAYER_OPTIONAL_FIELDS: Record<CanonicalLayerKind, readonly string[]> = {
  paint: ['name', 'locked'],
  image: ['name', 'locked', 'flipX', 'flipY', 'scaleY', 'saturation'],
  text: ['name', 'locked', 'flipX', 'flipY', 'scaleY'],
  fill: ['name', 'locked', 'offsetX', 'offsetY'],
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

  if (kind !== 'paint' && kind !== 'image' && kind !== 'text' && kind !== 'fill') {
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
      optional: LAYER_OPTIONAL_FIELDS[kind],
    })
  ) {
    return
  }

  // Flags are written only when on, so a document has one form per look.
  for (const flag of ['locked', 'flipX', 'flipY'] as const) {
    if (flag in value && value[flag] !== true) {
      report({ context, path: `${path}.${flag}`, message: 'expected true, or left out' })
    }
  }

  if (kind === 'image' && 'saturation' in value) {
    checkNumber({ context, value: value.saturation, path: `${path}.saturation`, min: 0, max: IMAGE_SATURATION_MAX })

    // One form per look: an image as uploaded leaves it out.
    if (value.saturation === 1) {
      report({ context, path: `${path}.saturation`, message: 'equal to 1; leave it out' })
    }
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

  if (kind === 'fill') {
    checkFill({ context, value, path })
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
  panelIds,
}: {
  context: Context
  value: unknown
  path: string
  panelIds: readonly string[]
}) {
  const panels = checkRecord({ context, value, path, required: panelIds })

  if (!panels) {
    return
  }

  for (const panelId of panelIds) {
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

function checkShape({
  context,
  value,
  path,
  template,
}: {
  context: Context
  value: unknown
  path: string
  template: unknown
}) {
  const ref = template as { id?: unknown; version?: unknown } | undefined
  const known = typeof ref?.id === 'string' && typeof ref.version === 'number'
  const spec = known ? shapeSpecFor({ template: { id: ref.id as string, version: ref.version as number } }) : null
  // Without a shape map, the fields are checked as the tee's (shape v1).
  const fields: readonly ShapeField[] = spec?.fields ?? SHAPE_FIELDS
  const limits: ShapeLimits = spec?.limits ?? SHAPE_LIMITS
  const shape = checkRecord({ context, value, path, required: fields })

  if (!shape) {
    return
  }

  for (const field of fields) {
    if (field in shape) {
      checkNumber({ context, value: shape[field], path: `${path}.${field}`, ...limits[field]! })
    }
  }

  // One form per look: a neutral shape is written as no shape.
  if (isNeutralShape({ shape: shape as GarmentShape })) {
    report({ context, path, message: 'neutral; leave it out' })
  }

  if (known && !spec) {
    report({ context, path, message: 'this template has no shape' })
  }
}

/**
 * The template's panels when its id and version resolve, else the tee's. An
 * upcoming template's panels aren't known to this build, so the document's
 * own are taken, as long as there are 1 to `upcomingPanels` of them with
 * stable ids.
 */
function panelIdsForValidation({ context, template, panels }: { context: Context; template: unknown; panels: unknown }) {
  const ref = template as { id?: unknown; version?: unknown } | undefined

  if (isUpcomingTemplate({ templateId: ref?.id }) && isRecord(panels)) {
    const ids = Object.keys(panels)

    if (ids.length === 0 || ids.length > CANONICAL_LIMITS.upcomingPanels) {
      report({ context, path: '$.panels', message: `expected 1 to ${CANONICAL_LIMITS.upcomingPanels} panels` })
    }

    for (const panelId of ids) {
      if (panelId.length > CANONICAL_LIMITS.idLength || !ID_PATTERN.test(panelId)) {
        report({ context, path: `$.panels.${panelId}`, message: 'expected a stable panel id' })
      }
    }

    return ids
  }

  return typeof ref?.id === 'string' && typeof ref.version === 'number'
    ? templatePanelIds({ template: { id: ref.id, version: ref.version } })
    : [...CANONICAL_PANEL_IDS]
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
    optional: ['shape', 'pattern'],
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
      checkPanels({
        context,
        value: root.panels,
        path: '$.panels',
        panelIds: panelIdsForValidation({ context, template: root.template, panels: root.panels }),
      })
    }

    if ('shape' in root) {
      checkShape({ context, value: root.shape, path: '$.shape', template: root.template })
    }

    if ('pattern' in root) {
      if ('shape' in root) {
        report({ context, path: '$.pattern', message: 'a pattern replaces the shape; store one or the other' })
      }

      checkPattern({
        value: root.pattern,
        path: '$.pattern',
        panels: isRecord(root.panels) ? Object.keys(root.panels) : [],
        templateId: (root.template as { id?: unknown } | undefined)?.id,
        report: (path, message) => report({ context, path, message }),
      })
    }
  }

  if (context.issues.length > 0) {
    return { ok: false, issues: context.issues }
  }

  return { ok: true, document: value as CanonicalDocument }
}

export function createEmptyCanonicalDocument({
  templateId = 'tee-crew-short',
  version,
}: {
  templateId?: TemplateId
  /** A specific version (tests of an older template); default: the current one. */
  version?: number
} = {}): CanonicalDocument {
  const pinned = version === undefined ? null : resolveTemplate({ id: templateId, version })
  const manifest = pinned?.ok ? pinned.manifest : currentTemplateFor({ templateId })

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    template: { id: manifest.id, version: manifest.version },
    // The template's own material colour, so an untouched garment renders as before.
    base: { kind: 'solid', color: manifest.material.color as `#${string}` },
    panels: Object.fromEntries(
      Object.keys(manifest.regions).map((panel) => [panel, { layers: [] }]),
    ),
  }
}

/**
 * Bring a stored document to the current form before validating it (shape
 * v1). Documents saved before shapes have no `shape`, which reads as
 * neutral, so they pass through unchanged; a neutral or partial `shape`
 * block (as an older writer or hand edit could leave) is folded to the one
 * stored form: dropped when neutral, missing fields filled with 0. Anything
 * else is left for the validator to refuse. Pure: returns a new object only
 * when something changed.
 */
export function migrateCanonicalDocument({ value }: { value: unknown }): unknown {
  if (!isRecord(value) || !('shape' in value)) {
    return value
  }

  const shape = value.shape

  if (shape === null || shape === undefined) {
    const { shape: _dropped, ...rest } = value
    return rest
  }

  const template = isRecord(value.template) ? value.template : null
  const spec =
    template && typeof template.id === 'string' && typeof template.version === 'number'
      ? shapeSpecFor({ template: { id: template.id, version: template.version } })
      : null
  // Without a shape map, the fields are read as the tee's (shape v1).
  const fields: readonly string[] = spec?.fields ?? SHAPE_FIELDS

  if (!isRecord(shape) || Object.keys(shape).some((key) => !fields.includes(key))) {
    return value
  }

  if (isNeutralShape({ shape: shape as GarmentShape })) {
    const { shape: _dropped, ...rest } = value
    return rest
  }

  const filled = Object.fromEntries(fields.map((field) => [field, field in shape ? shape[field] : 0]))
  return { ...value, shape: filled }
}

/** Migrate, then validate: how every stored document is read. */
export function readCanonicalDocument({ value }: { value: unknown }): ValidationResult {
  return validateCanonicalDocument({ value: migrateCanonicalDocument({ value }) })
}

/** The document's shape, its template's neutral one (the tee's without a map) when it stores none. */
export function shapeOf({ document }: { document: Pick<CanonicalDocument, 'shape' | 'template'> }): CanonicalShape {
  const spec = shapeSpecFor({ template: document.template })
  return document.shape ?? (spec ? neutralShapeFor({ spec }) : Object.fromEntries(SHAPE_FIELDS.map((field) => [field, 0])))
}

/**
 * Atlas-relative size of an image layer: contained in a `scale`-sided
 * square, longest side equal to `scale`. Aspect 1 is the legacy square.
 * A stretched image (`scaleY`, reader R2) takes its height from `scaleY`
 * by the same rule, its width still from `scale`.
 */
export function imageBox({
  scale,
  scaleY = scale,
  aspect,
}: {
  scale: number
  scaleY?: number
  aspect: number
}) {
  return aspect >= 1
    ? { width: scale, height: scaleY / aspect }
    : { width: scale * aspect, height: scaleY }
}

/** The asset a layer draws, if any: an image's, or an image fill's (reader R2). */
export function layerAssetId({ layer }: { layer: CanonicalLayer }): string | null {
  if (layer.kind === 'image') {
    return layer.assetId
  }

  if (layer.kind === 'fill' && 'assetId' in layer.source) {
    return layer.source.assetId
  }

  return null
}
