import {
  type CanonicalCommand,
  type CanonicalLayerPatch,
  type CanonicalStack,
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
}): { engine: TeeEngine; notes: ImportNote[] } {
  const converted = convertLegacyDesign({ value: document })

  if (!converted.ok) {
    return {
      engine: {
        stack: replaceDocument({ stack: engine.stack, document: createEmptyCanonicalDocument() }),
        assetSources: {},
      },
      notes: [{ path: '$', message: converted.message }],
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

  if (top) {
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
    if (patch.content !== undefined) next.content = patch.content.slice(0, CANONICAL_LIMITS.textLength)
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
    const commands: CanonicalCommand[] = CANONICAL_PANEL_IDS.flatMap((panel) =>
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
          content: layer.content.slice(0, CANONICAL_LIMITS.textLength),
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
