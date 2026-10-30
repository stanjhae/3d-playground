import {
  type CanonicalCommand,
  type CanonicalLayerPatch,
  type CanonicalStack,
  MAX_HISTORY,
  applyCanonicalCommand,
  createCanonicalStack,
  findLayer,
  redoCanonical,
  replaceDocument,
  undoCanonical,
} from './canonical-commands.ts'
import {
  type CanonicalDocument,
  type CanonicalPanelId,
  type Color,
  type ValidationIssue,
  CANONICAL_LIMITS,
  CANONICAL_PANEL_IDS,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document.ts'
import type { DesignCommand, LayerPatch } from './design-commands.ts'
import type { DesignDocument } from './design-document.ts'
import {
  type ImportNote,
  convertLegacyDesign,
  reservedAssetId,
  strokeFromV1,
  toColor,
  wrapAngle,
} from './legacy-import.ts'
import { LIBRARY_ASSET_SOURCES, libraryAssetId } from './library-assets.ts'
import {
  canonicalPanel,
  mirrorToRender,
  rendersMirrored,
  toRenderDocument,
} from './render-projection.ts'

/**
 * The tee studio's v2 engine (FLP E01 #152). The editor store keeps
 * issuing its existing commands; for the tee they are translated here into
 * canonical commands, the canonical stack is the source of truth, and the
 * store's `document` is derived through `toRenderDocument`. Concept
 * garments keep the legacy v1 stack (see docs/canonical-document.md).
 */

export type TeeEngine = {
  stack: CanonicalStack
  /** Asset id → bytes the current renderer can draw (until uploads, #170). */
  assetSources: Record<string, string>
}

export type TeeStep = {
  engine: TeeEngine
  changed: boolean
  issues?: ValidationIssue[]
  /** Why a command was refused at a limit (#162); show it as is. */
  refusal?: string
}

export function createTeeEngine({
  revision = 0,
}: { revision?: number } = {}): TeeEngine {
  return {
    stack: createCanonicalStack({ document: createEmptyCanonicalDocument(), revision }),
    assetSources: {},
  }
}

/** Load a v1 document (draft, snapshot, look) into the tee engine. */
export function loadTeeEngine({
  engine,
  document,
}: {
  engine: TeeEngine
  document: DesignDocument
}): { engine: TeeEngine; notes: ImportNote[]; limitNotice?: string } {
  const converted = convertLegacyDesign({ value: document })

  if (!converted.ok) {
    // The converter refuses a design past the v2 limits as a whole; say
    // which limit, so the empty studio is explained (#162).
    const limit = converted.issues?.find((issue) => issue.message.startsWith('more than'))
    const panel = limit && /^\$\.panels\.(front|back|left|right)\b/.exec(limit.path)?.[1]
    return {
      engine: {
        stack: replaceDocument({ stack: engine.stack, document: createEmptyCanonicalDocument() }),
        assetSources: {},
      },
      notes: [{ path: '$', message: converted.message }],
      ...(limit
        ? {
            limitNotice: `This design is over a studio limit${panel ? ` on the ${PANEL_NAMES[panel as CanonicalPanelId]}` : ''} (${limit.message}), so it opened empty. Trim it where it was made and open it again.`,
          }
        : {}),
    }
  }

  return {
    engine: {
      stack: replaceDocument({ stack: engine.stack, document: converted.document }),
      assetSources: Object.fromEntries(
        converted.pendingAssets.map((asset) => [asset.assetId, asset.src]),
      ),
    },
    notes: [...converted.warnings, ...converted.unsupported],
  }
}

// Keyed by document, checked against the sources: an upload resolving
// later changes what renders without changing the document.
const projectionCache = new WeakMap<
  CanonicalDocument,
  { assetSources: TeeEngine['assetSources']; document: DesignDocument }
>()

export function teeRenderDocument({ engine }: { engine: TeeEngine }) {
  const cached = projectionCache.get(engine.stack.document)

  if (cached && cached.assetSources === engine.assetSources) {
    return cached.document
  }

  const { document } = toRenderDocument({
    document: engine.stack.document,
    assetSources: { ...LIBRARY_ASSET_SOURCES, ...engine.assetSources },
  })
  projectionCache.set(engine.stack.document, { assetSources: engine.assetSources, document })
  return document
}

function baseGround({ document }: { document: CanonicalDocument }) {
  return document.base.kind === 'solid' ? document.base.color : document.base.colors[0]
}

export function basePatternCommand({
  engine,
  patternId,
  fillColor,
}: {
  engine: TeeEngine
  patternId: string
  fillColor: string
}): CanonicalCommand | null {
  const ground = baseGround({ document: engine.stack.document })
  const fill = toColor({ value: fillColor }) ?? ground

  if (patternId === 'solid') {
    return { type: 'setBase', base: { kind: 'solid', color: ground } }
  }

  if (patternId === 'stripe') {
    return { type: 'setBase', base: { kind: 'stripes', colors: [ground, fill], period: 0.08, angle: 0 } }
  }

  if (patternId === 'check') {
    return { type: 'setBase', base: { kind: 'check', colors: [ground, fill], period: 0.08 } }
  }

  return null
}

function paintLayerFor({
  document,
  panel,
  strokeId,
}: {
  document: CanonicalDocument
  panel: CanonicalPanelId
  strokeId: string
}) {
  const layers = document.panels[panel].layers
  const top = [...layers].reverse().find((layer) => layer.kind === 'paint' && layer.visible)

  // A full paint layer overflows into a new one; the panel's layer limit
  // then decides whether the stroke fits (#162).
  if (top?.kind === 'paint' && top.strokes.length < CANONICAL_LIMITS.strokesPerLayer) {
    return top.id
  }

  const preferred = `paint-${panel}`
  return findLayer({ document, layerId: preferred }) ? `paint-${panel}-${strokeId}` : preferred
}

function unit({ value }: { value: number }) {
  return Math.min(1, Math.max(0, value))
}

/**
 * Translate a store patch. Pointer and slider input is normalised here:
 * a drag past the panel edge pins to the edge and angles wrap. Values the
 * user cannot produce by dragging are passed through for the validator.
 */
function translatePatch({
  patch,
  kind,
}: {
  patch: LayerPatch
  kind: 'paint' | 'image' | 'text'
}): CanonicalLayerPatch {
  const next: CanonicalLayerPatch = {}

  if (patch.visible !== undefined) next.visible = patch.visible
  if (patch.opacity !== undefined) next.opacity = unit({ value: patch.opacity })

  if (patch.label !== undefined) {
    const name = patch.label.trim().slice(0, CANONICAL_LIMITS.nameLength)

    if (name) {
      next.name = name
    }
  }

  if (kind === 'paint') {
    return next
  }

  if (patch.x !== undefined) next.x = unit({ value: patch.x })
  if (patch.y !== undefined) next.y = unit({ value: patch.y })
  if (patch.scale !== undefined) {
    next.scale = Math.min(CANONICAL_LIMITS.maxObjectScale, Math.max(0.01, patch.scale))
  }
  if (patch.rotation !== undefined) next.rotation = wrapAngle({ value: patch.rotation })

  if (kind === 'text') {
    // Over-long text is refused with a message, never cut (#162).
    if (patch.content !== undefined) next.content = patch.content
    if (patch.face !== undefined) next.face = patch.face
    if (patch.color !== undefined) {
      const color = toColor({ value: patch.color })

      if (color) {
        next.color = color
      }
    }
  }

  return next
}

/** Map one store command to a canonical command, or null to skip it. */
export function translateCommand({
  engine,
  command,
}: {
  engine: TeeEngine
  command: DesignCommand
}): { command: CanonicalCommand; assetSources: Record<string, string> } | null {
  const document = engine.stack.document
  const same = engine.assetSources
  // Store commands are in render space; mirrored panels (the @2 back)
  // map back to canonical x here. Mirroring is its own inverse.
  const mirrored = (panel: CanonicalPanelId) =>
    rendersMirrored({ template: document.template, panel })
  const fromRender = <T extends { x?: number; rotation?: number }>(panel: CanonicalPanelId, value: T) =>
    mirrorToRender({ mirrored: mirrored(panel), value })

  if (command.type === 'addStroke') {
    const converted = strokeFromV1({ value: command.stroke })

    if (!converted) {
      return null
    }

    if (mirrored(converted.panel)) {
      converted.stroke.points = converted.stroke.points.map((value, index) =>
        index % 2 === 0 ? 1 - value : value,
      )
    }

    return {
      assetSources: same,
      command: {
        type: 'addStroke',
        panel: converted.panel,
        layerId: paintLayerFor({ document, panel: converted.panel, strokeId: converted.stroke.id }),
        stroke: converted.stroke,
      },
    }
  }

  if (command.type === 'eraseStroke') {
    return { assetSources: same, command: { type: 'removeStroke', strokeId: command.strokeId } }
  }

  if (command.type === 'clearPaint') {
    const panels = command.panel ? [canonicalPanel({ renderPanel: command.panel })] : CANONICAL_PANEL_IDS
    const commands: CanonicalCommand[] = panels.flatMap((panel) =>
      document.panels[panel].layers
        .filter((layer) => layer.kind === 'paint')
        .map((layer) => ({ type: 'clearPaintLayer' as const, layerId: layer.id })),
    )
    return commands.length > 0 ? { assetSources: same, command: { type: 'batch', commands } } : null
  }

  if (command.type === 'addGraphic') {
    const layer = fromRender(canonicalPanel({ renderPanel: command.layer.panel }), command.layer)
    const libraryId = libraryAssetId({ src: layer.src })
    // A copy of a placed upload keeps its finalized asset id (S01 #170).
    const knownId = Object.keys(same).find((id) => same[id] === layer.src)
    const assetId = libraryId ?? knownId ?? reservedAssetId({ src: layer.src })

    return {
      assetSources: libraryId || knownId ? same : { ...same, [assetId]: layer.src },
      command: {
        type: 'addLayer',
        panel: canonicalPanel({ renderPanel: layer.panel }),
        layer: {
          id: layer.id,
          kind: 'image',
          visible: layer.visible,
          opacity: unit({ value: layer.opacity }),
          ...(layer.label ? { name: layer.label.slice(0, CANONICAL_LIMITS.nameLength) } : {}),
          x: unit({ value: layer.x }),
          y: unit({ value: layer.y }),
          scale: Math.min(CANONICAL_LIMITS.maxObjectScale, Math.max(0.01, layer.scale)),
          rotation: wrapAngle({ value: layer.rotation }),
          assetId,
          aspect: layer.aspect ?? 1,
        },
      },
    }
  }

  if (command.type === 'addText') {
    const layer = fromRender(canonicalPanel({ renderPanel: command.layer.panel }), command.layer)
    const color = toColor({ value: layer.color })

    if (!layer.content.trim() || !color) {
      return null
    }

    return {
      assetSources: same,
      command: {
        type: 'addLayer',
        panel: canonicalPanel({ renderPanel: layer.panel }),
        layer: {
          id: layer.id,
          kind: 'text',
          visible: layer.visible,
          opacity: unit({ value: layer.opacity }),
          ...(layer.label ? { name: layer.label.slice(0, CANONICAL_LIMITS.nameLength) } : {}),
          x: unit({ value: layer.x }),
          y: unit({ value: layer.y }),
          scale: Math.min(CANONICAL_LIMITS.maxObjectScale, Math.max(0.01, layer.scale)),
          rotation: wrapAngle({ value: layer.rotation }),
          content: layer.content,
          face: layer.face,
          color,
        },
      },
    }
  }

  if (command.type === 'updateText') {
    return {
      assetSources: same,
      command: { type: 'updateLayer', layerId: command.layerId, patch: { content: command.content } },
    }
  }

  if (command.type === 'updateLayer' || command.type === 'removeLayer') {
    // The base pattern shows up as `base-fill-*` stamps in the projection.
    if (command.layerId.startsWith('base-fill')) {
      const base = document.base

      if (base.kind === 'solid') {
        return null
      }

      if (command.type === 'removeLayer') {
        return { assetSources: same, command: { type: 'setBase', base: { kind: 'solid', color: base.colors[0] } } }
      }

      const fill = command.patch.color ? toColor({ value: command.patch.color }) : null
      return fill
        ? { assetSources: same, command: { type: 'setBase', base: { ...base, colors: [base.colors[0], fill] } } }
        : null
    }

    if (command.type === 'removeLayer') {
      return { assetSources: same, command: { type: 'removeLayer', layerId: command.layerId } }
    }

    const found = findLayer({ document, layerId: command.layerId })

    if (!found) {
      return null
    }

    return {
      assetSources: same,
      command: {
        type: 'updateLayer',
        layerId: command.layerId,
        patch: translatePatch({ patch: fromRender(found.panel, command.patch), kind: found.layer.kind }),
      },
    }
  }

  if (command.type === 'applyFabric') {
    const color = toColor({ value: command.override.color })

    if (!color) {
      return null
    }

    const base = document.base
    return {
      assetSources: same,
      command: {
        type: 'setBase',
        base: base.kind === 'solid' ? { kind: 'solid', color } : { ...base, colors: [color as Color, base.colors[1]] },
      },
    }
  }

  // addPattern and setStructural are concept-only: the tee template is fixed.
  return null
}

export function runTeeCommand({
  engine,
  command,
}: {
  engine: TeeEngine
  command: CanonicalCommand
}): TeeStep {
  const document = engine.stack.document
  const over = limitOverages({ document })

  // A document that is already over a limit (a recovered or imported one)
  // only takes commands that bring it back under (#162).
  if (over.length > 0) {
    const relieved = relieveCommand({ document, command })

    if (!relieved) {
      return { engine, changed: false, refusal: limitMessage({ counter: over[0]! }) }
    }

    if (JSON.stringify(relieved) === JSON.stringify(document)) {
      return { engine, changed: false }
    }

    // Removals cannot add excess; the check guards any later relief kind.
    if (
      !validateCanonicalDocument({ value: relieved }).ok &&
      limitExcess({ document: relieved }) > limitExcess({ document })
    ) {
      return { engine, changed: false, refusal: limitMessage({ counter: over[0]! }) }
    }

    return {
      changed: true,
      engine: {
        ...engine,
        stack: {
          document: relieved,
          revision: engine.stack.revision + 1,
          past: [...engine.stack.past, document].slice(-MAX_HISTORY),
          future: [],
        },
      },
    }
  }

  const refused = limitRefusal({ document, command })

  if (refused) {
    return { engine, changed: false, refusal: limitMessage({ counter: refused, refused: true }) }
  }

  const result = applyCanonicalCommand({ stack: engine.stack, command })

  if (!result.ok) {
    return { engine, changed: false, issues: result.issues }
  }

  return { engine: { ...engine, stack: result.stack }, changed: result.changed }
}

export function runTranslated({
  engine,
  command,
}: {
  engine: TeeEngine
  command: DesignCommand
}): TeeStep {
  const translated = translateCommand({ engine, command })

  if (!translated) {
    return { engine, changed: false }
  }

  const step = runTeeCommand({ engine, command: translated.command })
  return step.changed
    ? { ...step, engine: { ...step.engine, assetSources: translated.assetSources } }
    : step
}

export function undoTee({ engine }: { engine: TeeEngine }): TeeEngine {
  return { ...engine, stack: undoCanonical({ stack: engine.stack }) }
}

export function redoTee({ engine }: { engine: TeeEngine }): TeeEngine {
  return { ...engine, stack: redoCanonical({ stack: engine.stack }) }
}

// Limits (E09 #162). The numbers are the validator's own `CANONICAL_LIMITS`;
// the editor refuses a command before it reaches them so a save never fails
// on a limit, and the studio shows counters as a panel nears one.

export type LimitKind = 'layers' | 'strokes' | 'points' | 'text'

export type LimitCounter = {
  kind: LimitKind
  panel: CanonicalPanelId
  used: number
  max: number
}

/** Counters show from this share of a limit up. */
export const LIMIT_WARNING_SHARE = 0.8

export const LIMIT_MAX: Record<LimitKind, number> = {
  layers: CANONICAL_LIMITS.layersPerPanel,
  strokes: CANONICAL_LIMITS.strokesPerLayer,
  points: CANONICAL_LIMITS.pointsPerStroke,
  text: CANONICAL_LIMITS.textLength,
}

const PANEL_NAMES: Record<CanonicalPanelId, string> = {
  front: 'front',
  back: 'back',
  left: "wearer's left sleeve",
  right: "wearer's right sleeve",
}

/**
 * `refused` words it as the command that would cross the limit; otherwise
 * it describes a document at (or, recovered or imported, over) it.
 */
export function limitMessage({
  counter,
  refused = false,
}: {
  counter: LimitCounter
  refused?: boolean
}) {
  const { kind, used, max } = counter
  const where = PANEL_NAMES[counter.panel]
  const excess = used - max

  if (refused && kind === 'points') {
    return `A stroke holds up to ${max} points; this one has ${used}. Draw it as shorter strokes.`
  }

  if (refused && kind === 'text') {
    return `Text holds up to ${max} characters; this would be ${used}. Shorten it and try again.`
  }

  if (kind === 'layers') {
    return excess > 0
      ? `The ${where} has ${used} layers; the limit is ${max}. Delete ${excess} to keep editing and saving.`
      : `The ${where} has ${used} of ${max} layers. Delete one to add more.`
  }

  if (kind === 'strokes') {
    return excess > 0
      ? `A paint layer on the ${where} has ${used} strokes; the limit is ${max}. Erase ${excess} or clear the ink to keep editing and saving.`
      : `A paint layer on the ${where} has ${used} of ${max} strokes. Erase some or clear the ink to draw more.`
  }

  if (kind === 'points') {
    return excess > 0
      ? `A stroke on the ${where} has ${used} points; the limit is ${max}. Erase it to keep editing and saving.`
      : `This stroke has ${used} of ${max} points. Lift and start a new stroke to keep drawing.`
  }

  return `A word on the ${where} has ${used} characters; the limit is ${max}. Shorten or delete it to keep editing and saving.`
}

/** The fullest layer, paint layer, stroke and word on one panel. */
export function panelLimitCounters({
  document,
  panel,
}: {
  document: CanonicalDocument
  panel: CanonicalPanelId
}): LimitCounter[] {
  const layers = document.panels[panel].layers
  let strokes = 0
  let points = 0
  let text = 0

  for (const layer of layers) {
    if (layer.kind === 'paint') {
      strokes = Math.max(strokes, layer.strokes.length)

      for (const stroke of layer.strokes) {
        points = Math.max(points, stroke.points.length / 2)
      }
    }

    if (layer.kind === 'text') {
      text = Math.max(text, layer.content.length)
    }
  }

  return [
    { kind: 'layers', panel, used: layers.length, max: LIMIT_MAX.layers },
    { kind: 'strokes', panel, used: strokes, max: LIMIT_MAX.strokes },
    { kind: 'points', panel, used: points, max: LIMIT_MAX.points },
    { kind: 'text', panel, used: text, max: LIMIT_MAX.text },
  ]
}

export function nearLimit({ counter }: { counter: LimitCounter }) {
  return counter.used >= counter.max * LIMIT_WARNING_SHARE
}

/** Every limit the document is already over, front panel first. */
export function limitOverages({ document }: { document: CanonicalDocument }) {
  return CANONICAL_PANEL_IDS.flatMap((panel) =>
    panelLimitCounters({ document, panel }).filter((counter) => counter.used > counter.max),
  )
}

/** What a document that is over its limits shows on load, or null. */
export function overLimitNotice({ document }: { document: CanonicalDocument }) {
  const first = limitOverages({ document })[0]
  return first ? limitMessage({ counter: first }) : null
}

function limitExcess({ document }: { document: CanonicalDocument }) {
  let excess = 0

  for (const panel of CANONICAL_PANEL_IDS) {
    for (const layer of document.panels[panel].layers) {
      if (layer.kind === 'paint') {
        excess += Math.max(0, layer.strokes.length - LIMIT_MAX.strokes)

        for (const stroke of layer.strokes) {
          excess += Math.max(0, stroke.points.length / 2 - LIMIT_MAX.points)
        }
      }

      if (layer.kind === 'text') {
        excess += Math.max(0, layer.content.length - LIMIT_MAX.text)
      }
    }

    excess += Math.max(0, document.panels[panel].layers.length - LIMIT_MAX.layers)
  }

  return excess
}

/** The limit `command` would take `document` past, or null if it fits. */
export function limitRefusal({
  document,
  command,
}: {
  document: CanonicalDocument
  command: CanonicalCommand
}): LimitCounter | null {
  const layersOn = (panel: CanonicalPanelId): LimitCounter | null => {
    const used = document.panels[panel].layers.length
    return used >= LIMIT_MAX.layers ? { kind: 'layers', panel, used, max: LIMIT_MAX.layers } : null
  }
  const textOf = (panel: CanonicalPanelId, content: string | undefined): LimitCounter | null =>
    content !== undefined && content.length > LIMIT_MAX.text
      ? { kind: 'text', panel, used: content.length, max: LIMIT_MAX.text }
      : null

  if (command.type === 'batch') {
    for (const inner of command.commands) {
      const refused = limitRefusal({ document, command: inner })

      if (refused) {
        return refused
      }
    }

    return null
  }

  if (command.type === 'addLayer') {
    return (
      layersOn(command.panel) ??
      (command.layer.kind === 'text' ? textOf(command.panel, command.layer.content) : null)
    )
  }

  if (command.type === 'copyLayer') {
    return layersOn(command.panel)
  }

  if (command.type === 'updateLayer') {
    const found = findLayer({ document, layerId: command.layerId })
    return found ? textOf(found.panel, command.patch.content) : null
  }

  if (command.type === 'addStroke') {
    const points = command.stroke.points.length / 2

    if (points > LIMIT_MAX.points) {
      return { kind: 'points', panel: command.panel, used: points, max: LIMIT_MAX.points }
    }

    const found = findLayer({ document, layerId: command.layerId })

    if (!found) {
      return layersOn(command.panel)
    }

    const used = found.layer.kind === 'paint' ? found.layer.strokes.length : 0
    return used >= LIMIT_MAX.strokes
      ? { kind: 'strokes', panel: found.panel, used, max: LIMIT_MAX.strokes }
      : null
  }

  return null
}

/**
 * Apply a command that can only shrink the document — removing a layer or
 * stroke, clearing ink, shortening a word — or null for anything else.
 */
function relieveCommand({
  document,
  command,
}: {
  document: CanonicalDocument
  command: CanonicalCommand
}): CanonicalDocument | null {
  if (command.type === 'batch') {
    let current: CanonicalDocument | null = document

    for (const inner of command.commands) {
      current = current ? relieveCommand({ document: current, command: inner }) : null
    }

    return current
  }

  const next = structuredClone(document)

  if (command.type === 'removeLayer') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found) {
      return null
    }

    next.panels[found.panel].layers.splice(found.index, 1)
    return next
  }

  if (command.type === 'removeStroke' || command.type === 'clearPaintLayer') {
    for (const panel of CANONICAL_PANEL_IDS) {
      for (const layer of next.panels[panel].layers) {
        if (layer.kind !== 'paint') {
          continue
        }

        layer.strokes =
          command.type === 'clearPaintLayer'
            ? layer.id === command.layerId
              ? []
              : layer.strokes
            : layer.strokes.filter((stroke) => stroke.id !== command.strokeId)
      }
    }

    return next
  }

  if (command.type === 'updateLayer') {
    const keys = Object.keys(command.patch).filter(
      (key) => command.patch[key as keyof CanonicalLayerPatch] !== undefined,
    )
    const found = findLayer({ document: next, layerId: command.layerId })
    const content = command.patch.content

    if (
      found?.layer.kind !== 'text' ||
      keys.length !== 1 ||
      content === undefined ||
      !content.trim() ||
      content.length >= found.layer.content.length
    ) {
      return null
    }

    found.layer.content = content
    return next
  }

  return null
}
