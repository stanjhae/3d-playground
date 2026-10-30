import {
  type BrushStroke,
  type CanonicalDocument,
  type CanonicalLayer,
  type CanonicalPanelId,
  type CanonicalStroke,
  type Color,
  type ValidationIssue,
  CANONICAL_LIMITS,
  MAX_ANGLE,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document.ts'
import {
  type ContentHash,
  hashCanonicalDocument,
  normalizeCanonicalDocument,
} from './canonical-hash.ts'
import { TEE_CREW_SHORT_V1 } from './template-manifest.ts'

/**
 * Explicit legacy → canonical v2 import (FLP F06 #141).
 *
 * Reads v1 documents, editor drafts (`flv:draft:current`) and snapshots
 * (`flv:draft:mornings` entries) without the permissive v1 parsers. Every
 * lossy step is visible: `warnings` for content imported with a change,
 * `unsupported` for content left out, and an explicit rejection for
 * corrupt or out-of-scope sources. The result always passes
 * `validateCanonicalDocument`. Mapping table: docs/canonical-document.md.
 */

export type ImportSource = 'document' | 'draft' | 'snapshot'

export type ImportNote = {
  path: string
  message: string
}

/** A v1 graphic awaiting upload (S01 #170) under its reserved asset id. */
export type PendingAsset = {
  assetId: string
  src: string
}

export type ImportResult =
  | {
      ok: true
      source: ImportSource
      title?: string
      document: CanonicalDocument
      contentHash: ContentHash
      warnings: ImportNote[]
      unsupported: ImportNote[]
      pendingAssets: PendingAsset[]
      /** Exact original input, kept so nothing is lost by importing. */
      backup: string
      /** Deterministic UUID; use as the create mutation key. */
      importKey: string
    }
  | {
      ok: false
      reason: 'corrupt' | 'already-v2' | 'unsupported-garment' | 'invalid'
      message: string
      issues?: ValidationIssue[]
    }

/**
 * v1 panel ids name the render panel (`DEFAULT_PANEL_UV`), not the
 * wearer's side: v1 `left` is the sleeve built at −x, the wearer's right.
 * The template manifest records each canonical panel's render panel, so
 * the same physical sleeve keeps its print.
 */
const CANONICAL_BY_RENDER_PANEL = Object.fromEntries(
  Object.entries(TEE_CREW_SHORT_V1.regions).map(([canonical, region]) => [
    region.renderPanel,
    canonical as CanonicalPanelId,
  ]),
) as Record<CanonicalPanelId, CanonicalPanelId>

/** Legacy panel id from drafts made before four-sided panels. */
const LEGACY_PANEL_ALIASES: Record<string, CanonicalPanelId> = {
  sleeve: 'left',
}

const PANELS = new Set<string>(['front', 'back', 'left', 'right'])
const SUPPORTED_STRUCTURAL: Record<string, string> = {
  neck: 'crew',
  sleeve: 'short',
}
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const V1_DEFAULT_PRESSURE = 0.7
const V1_TEXT_RENDER_CHARS = 32

type Context = {
  warnings: ImportNote[]
  unsupported: ImportNote[]
  pendingAssets: Map<string, PendingAsset>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

async function sha256Hex({ text }: { text: string }) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function uuidFromHex({ hex }: { hex: string }) {
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

function toColor({ value }: { value: unknown }): Color | null {
  if (typeof value !== 'string') {
    return null
  }

  const raw = value.trim().toLowerCase()

  if (/^#[0-9a-f]{6}$/.test(raw)) {
    return raw as Color
  }

  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` as Color
  }

  return null
}

function toPanel({
  value,
  path,
  context,
}: {
  value: unknown
  path: string
  context: Context
}): CanonicalPanelId | null {
  if (typeof value === 'string' && PANELS.has(value)) {
    return CANONICAL_BY_RENDER_PANEL[value as CanonicalPanelId]
  }

  if (typeof value === 'string' && LEGACY_PANEL_ALIASES[value]) {
    const panel = CANONICAL_BY_RENDER_PANEL[LEGACY_PANEL_ALIASES[value]]
    context.warnings.push({
      path,
      message: `legacy panel "${value}" mapped to the wearer's ${panel} sleeve`,
    })
    return panel
  }

  return null
}

function clampUnit({
  value,
  path,
  context,
}: {
  value: number
  path: string
  context: Context
}) {
  if (value >= 0 && value <= 1) {
    return value
  }

  context.warnings.push({
    path,
    message: `position ${value} was outside the panel; kept where it was drawn (clamped)`,
  })
  return Math.min(1, Math.max(0, value))
}

/** Same angle in (-π, π]; lossless. */
function wrapAngle({ value }: { value: number }) {
  const turn = Math.PI * 2
  let angle = value % turn

  if (angle <= -Math.PI) {
    angle += turn
  } else if (angle > Math.PI) {
    angle -= turn
  }

  return Math.min(MAX_ANGLE, angle)
}

function layerName({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return {}
  }

  const name = value.trim().slice(0, CANONICAL_LIMITS.nameLength)
  return name ? { name } : {}
}

function layerOpacity({ value }: { value: unknown }) {
  return isFiniteNumber(value) ? Math.min(1, Math.max(0, value)) : 1
}

function convertStroke({
  value,
  path,
  context,
}: {
  value: unknown
  path: string
  context: Context
}): { panel: CanonicalPanelId; stroke: CanonicalStroke } | null {
  if (!isRecord(value) || !Array.isArray(value.points)) {
    context.unsupported.push({ path, message: 'unreadable stroke left out' })
    return null
  }

  if (value.points.length === 0) {
    return null
  }

  const panel = toPanel({ value: value.panel ?? 'front', path: `${path}.panel`, context })
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const tool = value.tool ?? 'brush'
  const width = value.width ?? 0.02

  if (!panel) {
    context.unsupported.push({ path: `${path}.panel`, message: 'unknown panel; stroke left out' })
    return null
  }

  if (!ID_PATTERN.test(id)) {
    context.unsupported.push({ path: `${path}.id`, message: 'stroke has no usable id; left out' })
    return null
  }

  if (tool === 'fill') {
    context.unsupported.push({ path, message: 'fill strokes are not in v2; left out' })
    return null
  }

  if (tool !== 'brush' && tool !== 'eraser') {
    context.unsupported.push({ path: `${path}.tool`, message: 'unknown stroke tool; left out' })
    return null
  }

  if (
    !isFiniteNumber(width) ||
    width < CANONICAL_LIMITS.minStrokeWidth ||
    width > CANONICAL_LIMITS.maxStrokeWidth
  ) {
    context.unsupported.push({ path: `${path}.width`, message: 'stroke width out of range; left out' })
    return null
  }

  if (value.points.length > CANONICAL_LIMITS.pointsPerStroke) {
    context.unsupported.push({ path: `${path}.points`, message: 'stroke has too many points; left out' })
    return null
  }

  const points: number[] = []
  let hasPressure = false

  for (const [index, point] of value.points.entries()) {
    const pointPath = `${path}.points[${index}]`

    if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
      context.unsupported.push({ path: pointPath, message: 'unreadable point; stroke left out' })
      return null
    }

    if (isFiniteNumber(point.p) && point.p !== V1_DEFAULT_PRESSURE) {
      hasPressure = true
    }

    points.push(
      clampUnit({ value: point.x, path: `${pointPath}.x`, context }),
      clampUnit({ value: point.y, path: `${pointPath}.y`, context }),
    )
  }

  if (hasPressure) {
    context.warnings.push({
      path,
      message: 'pen pressure is not in v2; stroke width is now even',
    })
  }

  if (tool === 'eraser') {
    return { panel, stroke: { id, tool: 'eraser', width, points } }
  }

  const color = toColor({ value: value.color })

  if (!color) {
    context.unsupported.push({ path: `${path}.color`, message: 'stroke color is not a hex color; left out' })
    return null
  }

  const stroke: BrushStroke = { id, tool: 'brush', color, width, opacity: 1, points }
  return { panel, stroke }
}

function convertPaintLayer({
  record,
  id,
  path,
  context,
}: {
  record: Record<string, unknown>
  id: string
  path: string
  context: Context
}): Array<{ panel: CanonicalPanelId; layer: CanonicalLayer }> {
  const strokes = Array.isArray(record.strokes) ? record.strokes : []
  const byPanel = new Map<CanonicalPanelId, CanonicalStroke[]>()

  strokes.forEach((value, index) => {
    const converted = convertStroke({ value, path: `${path}.strokes[${index}]`, context })

    if (converted) {
      byPanel.set(converted.panel, [
        ...(byPanel.get(converted.panel) ?? []),
        converted.stroke,
      ])
    }
  })

  const split = byPanel.size > 1

  return [...byPanel.entries()].map(([panel, panelStrokes]) => ({
    panel,
    layer: {
      id: split ? `${id}--${panel}`.slice(0, CANONICAL_LIMITS.idLength) : id,
      kind: 'paint',
      visible: record.visible !== false,
      opacity: 1,
      ...layerName({ value: record.label }),
      strokes: panelStrokes,
    },
  }))
}

function convertPlacement({
  record,
  path,
  context,
}: {
  record: Record<string, unknown>
  path: string
  context: Context
}) {
  const x = isFiniteNumber(record.x) ? record.x : 0.5
  const y = isFiniteNumber(record.y) ? record.y : 0.5
  const scale = record.scale
  const rotation = isFiniteNumber(record.rotation) ? record.rotation : 0

  if (
    !isFiniteNumber(scale) ||
    scale <= 0 ||
    scale > CANONICAL_LIMITS.maxObjectScale
  ) {
    context.unsupported.push({ path: `${path}.scale`, message: 'size out of range; layer left out' })
    return null
  }

  return {
    x: clampUnit({ value: x, path: `${path}.x`, context }),
    y: clampUnit({ value: y, path: `${path}.y`, context }),
    scale,
    rotation: wrapAngle({ value: rotation }),
  }
}

async function convertGraphicLayer({
  record,
  id,
  path,
  context,
}: {
  record: Record<string, unknown>
  id: string
  path: string
  context: Context
}): Promise<CanonicalLayer | null> {
  const src = typeof record.src === 'string' ? record.src.trim() : ''

  if (!src) {
    context.unsupported.push({ path: `${path}.src`, message: 'graphic has no image; left out' })
    return null
  }

  const placement = convertPlacement({ record, path, context })

  if (!placement) {
    return null
  }

  const assetId = `asset_legacy_${(await sha256Hex({ text: src })).slice(0, 32)}`
  context.pendingAssets.set(assetId, { assetId, src })
  context.warnings.push({
    path: `${path}.src`,
    message: `image needs upload before cloud save (reserved ${assetId}); kept square as before`,
  })

  if (typeof record.color === 'string' && record.color.trim()) {
    context.warnings.push({
      path: `${path}.color`,
      message: 'image tint is not in v2; image imported untinted',
    })
  }

  return {
    id,
    kind: 'image',
    visible: record.visible !== false,
    opacity: layerOpacity({ value: record.opacity }),
    ...layerName({ value: record.label }),
    ...placement,
    assetId,
    aspect: 1,
  }
}

function convertTextLayer({
  record,
  id,
  path,
  context,
}: {
  record: Record<string, unknown>
  id: string
  path: string
  context: Context
}): CanonicalLayer | null {
  const content = typeof record.content === 'string' ? record.content : ''

  if (!content.trim()) {
    return null
  }

  if (content.length > CANONICAL_LIMITS.textLength) {
    context.unsupported.push({ path: `${path}.content`, message: 'text too long; layer left out' })
    return null
  }

  if (content.length > V1_TEXT_RENDER_CHARS) {
    context.warnings.push({
      path: `${path}.content`,
      message: `the old preview showed only the first ${V1_TEXT_RENDER_CHARS} characters; all ${content.length} are kept`,
    })
  }

  const color = toColor({ value: record.color ?? '#1a1c22' })
  const face = record.face === 'sans' ? 'sans' : 'display'

  if (!color) {
    context.unsupported.push({ path: `${path}.color`, message: 'text color is not a hex color; layer left out' })
    return null
  }

  if (record.face !== undefined && record.face !== face) {
    context.warnings.push({ path: `${path}.face`, message: 'unknown typeface; using display' })
  }

  const placement = convertPlacement({ record, path, context })

  if (!placement) {
    return null
  }

  return {
    id,
    kind: 'text',
    visible: record.visible !== false,
    opacity: layerOpacity({ value: record.opacity }),
    ...layerName({ value: record.label }),
    ...placement,
    content,
    face,
    color,
  }
}

function convertBase({
  value,
  document,
  context,
}: {
  value: unknown
  document: CanonicalDocument
  context: Context
}) {
  if (!Array.isArray(value)) {
    return
  }

  let baseColor: Color | null = null

  value.forEach((override, index) => {
    const path = `overrides[${index}]`

    if (!isRecord(override)) {
      context.unsupported.push({ path, message: 'unreadable material override left out' })
      return
    }

    const color = toColor({ value: override.color })

    if (override.color !== undefined && color && !baseColor) {
      baseColor = color
      document.base = { kind: 'solid', color }
      context.warnings.push({
        path: `${path}.color`,
        message: `garment color taken from material "${String(override.meshName)}"`,
      })
    } else if (override.color !== undefined && color !== baseColor) {
      context.unsupported.push({
        path: `${path}.color`,
        message: 'v2 has one garment color; this part color was left out',
      })
    }

    for (const key of ['mapId', 'roughness', 'metalness']) {
      if (override[key] !== undefined) {
        context.unsupported.push({
          path: `${path}.${key}`,
          message: 'fabric texture and finish are fixed by the template; left out',
        })
      }
    }
  })
}

function unwrap({ value }: { value: unknown }):
  | { source: ImportSource; body: Record<string, unknown>; title?: string }
  | null {
  if (!isRecord(value)) {
    return null
  }

  if (isRecord(value.document)) {
    const isSnapshot = typeof value.createdAt === 'string' && typeof value.kind === 'string'

    return {
      source: isSnapshot ? 'snapshot' : 'draft',
      body: {
        ...value.document,
        garmentId: value.garmentId ?? value.document.garmentId,
      },
      ...(isSnapshot && typeof value.title === 'string' && value.title.trim()
        ? { title: value.title.trim().slice(0, 80) }
        : {}),
    }
  }

  return { source: 'document', body: value }
}

export async function importLegacyDesign({
  value,
}: {
  value: unknown
}): Promise<ImportResult> {
  let input = value

  if (typeof value === 'string') {
    try {
      input = JSON.parse(value) as unknown
    } catch {
      return { ok: false, reason: 'corrupt', message: 'Saved design is not readable JSON' }
    }
  }

  const unwrapped = unwrap({ value: input })

  if (!unwrapped) {
    return { ok: false, reason: 'corrupt', message: 'Saved design is not an object' }
  }

  const { source, body, title } = unwrapped

  if ('schemaVersion' in body) {
    return {
      ok: false,
      reason: 'already-v2',
      message: 'Design is already canonical; validate it instead of importing',
    }
  }

  if (!Array.isArray(body.layers)) {
    return { ok: false, reason: 'corrupt', message: 'Saved design has no layer list' }
  }

  if (body.garmentId !== 'tee') {
    return {
      ok: false,
      reason: 'unsupported-garment',
      message: `Only T-shirt designs can be imported (found ${String(body.garmentId ?? 'none')})`,
    }
  }

  const context: Context = { warnings: [], unsupported: [], pendingAssets: new Map() }
  const document = createEmptyCanonicalDocument()

  if (body.garmentVersion !== 2) {
    context.warnings.push({
      path: 'garmentVersion',
      message: `made on tee geometry v${String(body.garmentVersion)}; placed on the current template`,
    })
  }

  if (isRecord(body.structural)) {
    for (const [key, choice] of Object.entries(body.structural)) {
      if (SUPPORTED_STRUCTURAL[key] !== choice) {
        context.unsupported.push({
          path: `structural.${key}`,
          message: `"${String(choice)}" ${key} is not available; the crew-neck short-sleeve template is used`,
        })
      }
    }
  }

  convertBase({ value: body.overrides, document, context })

  for (const [index, layer] of body.layers.entries()) {
    const path = `layers[${index}]`

    if (!isRecord(layer)) {
      context.unsupported.push({ path, message: 'unreadable layer left out' })
      continue
    }

    const id = typeof layer.id === 'string' ? layer.id.trim() : ''

    if (!ID_PATTERN.test(id)) {
      context.unsupported.push({ path: `${path}.id`, message: 'layer has no usable id; left out' })
      continue
    }

    if (layer.kind === 'paint') {
      for (const { panel, layer: converted } of convertPaintLayer({ record: layer, id, path, context })) {
        document.panels[panel].layers.push(converted)
      }
      continue
    }

    if (layer.kind === 'pattern') {
      context.unsupported.push({
        path,
        message: 'pattern stamps are replaced by the garment base pattern; left out',
      })
      continue
    }

    if (layer.kind === 'art') {
      context.unsupported.push({ path, message: 'locked whole-garment art is not in v2; left out' })
      continue
    }

    if (layer.kind !== 'graphic' && layer.kind !== 'text') {
      context.unsupported.push({ path: `${path}.kind`, message: 'unknown layer kind left out' })
      continue
    }

    const panel = toPanel({ value: layer.panel ?? 'front', path: `${path}.panel`, context })

    if (!panel) {
      context.unsupported.push({ path: `${path}.panel`, message: 'unknown panel; layer left out' })
      continue
    }

    const converted =
      layer.kind === 'graphic'
        ? await convertGraphicLayer({ record: layer, id, path, context })
        : convertTextLayer({ record: layer, id, path, context })

    if (converted) {
      document.panels[panel].layers.push(converted)
    }
  }

  const normalized = normalizeCanonicalDocument({ document })
  const checked = validateCanonicalDocument({ value: normalized })

  if (!checked.ok) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Imported design does not meet the v2 contract',
      issues: checked.issues,
    }
  }

  const backup = typeof value === 'string' ? value : JSON.stringify(input)

  return {
    ok: true,
    source,
    ...(title ? { title } : {}),
    document: checked.document,
    contentHash: await hashCanonicalDocument({ document: checked.document }),
    warnings: context.warnings,
    unsupported: context.unsupported,
    pendingAssets: [...context.pendingAssets.values()],
    backup,
    importKey: uuidFromHex({ hex: await sha256Hex({ text: backup }) }),
  }
}
