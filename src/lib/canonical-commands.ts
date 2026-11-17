import type { CanonicalPattern } from './pattern/pattern-document.ts'
import {
  type CanonicalDocument,
  type CanonicalFabricId,
  type CanonicalLayer,
  type CanonicalPanelId,
  type CanonicalShape,
  type CanonicalStroke,
  type CanonicalTextFace,
  type Color,
  type GarmentBase,
  type ValidationIssue,
  panelIdsOf,
  shapeOf,
  validateCanonicalDocument,
} from './canonical-document.ts'
import { isNeutralShape } from './garment-shape-params.ts'

/**
 * Editor commands on the canonical v2 document (FLP E01 #152).
 *
 * Commands are pure: the caller supplies any new ids, so the same command
 * on the same document always yields the same result. Every result is
 * checked with `validateCanonicalDocument`; a command that would produce an
 * invalid document is rejected and the stack is unchanged, never clamped.
 * `revision` increases on every change, including undo and redo, so the 2D
 * editor, renderer, history and save controller can agree on which content
 * they are showing. Selection, tool and camera are not part of this.
 */

/** E09 #160 asks for at least 50 undoable commands. */
export const MAX_HISTORY = 100

export type CanonicalLayerPatch = {
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  visible?: boolean
  name?: string
  content?: string
  face?: CanonicalTextFace
  color?: Color
  /** true stores the flag; false removes it, as flips are stored only when on. */
  flipX?: boolean
  flipY?: boolean
  /** true locks the layer; false removes the flag, as locks are stored only when on. */
  locked?: boolean
}

/**
 * A fill's own settings (writer W). An offset of 0 removes it, as a phase
 * is stored only when off 0; `colors` is for a stripe or check fill only.
 */
export type CanonicalFillPatch = {
  tile?: number
  rotation?: number
  offsetX?: number
  offsetY?: number
  colors?: [Color, Color]
}

export type CanonicalCommand =
  | {
      type: 'addStroke'
      panel: CanonicalPanelId
      stroke: CanonicalStroke
      /** Paint layer to draw on; created on top of the panel if missing. */
      layerId: string
    }
  | { type: 'removeStroke'; strokeId: string }
  | { type: 'clearPaintLayer'; layerId: string }
  | { type: 'addLayer'; panel: CanonicalPanelId; layer: CanonicalLayer }
  | { type: 'updateLayer'; layerId: string; patch: CanonicalLayerPatch }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'moveLayer'; layerId: string; toIndex: number }
  | {
      type: 'copyLayer'
      layerId: string
      panel: CanonicalPanelId
      newId: string
    }
  /** The base's kind and colours; a base naming no fabric keeps the current one. */
  | { type: 'setBase'; base: GarmentBase }
  /**
   * The garment's cloth (writer W): a base preset id, or null to leave it
   * out. The base's kind and colours stay as they are.
   */
  | { type: 'setFabric'; fabric: CanonicalFabricId | null }
  /** A fill's repeat, turn, phase or colours (writer W); the rest stay. */
  | { type: 'updateFill'; layerId: string; patch: CanonicalFillPatch }
  /**
   * Change some shape fields; the rest keep their values. A shape that comes
   * out neutral is removed, as shapes are stored only when off neutral.
   * Out-of-range values are refused, not clamped: the UI clamps.
   */
  | { type: 'setShape'; shape: Partial<CanonicalShape> }
  /** Pattern mode: a pattern replaces the shape; null leaves Pattern mode. */
  | { type: 'setPattern'; pattern: CanonicalPattern | null }
  /** Several commands as one undo step, e.g. clearing every paint layer. */
  | { type: 'batch'; commands: CanonicalCommand[] }

export type CanonicalStack = {
  document: CanonicalDocument
  revision: number
  past: CanonicalDocument[]
  future: CanonicalDocument[]
}

export type CommandResult =
  | { ok: true; stack: CanonicalStack; changed: boolean }
  | { ok: false; stack: CanonicalStack; issues: ValidationIssue[] }

export function createCanonicalStack({
  document,
  revision = 0,
}: {
  document: CanonicalDocument
  revision?: number
}): CanonicalStack {
  return { document: structuredClone(document), revision, past: [], future: [] }
}

/** Loading or importing replaces the document and drops undo history. */
export function replaceDocument({
  stack,
  document,
}: {
  stack: CanonicalStack
  document: CanonicalDocument
}): CanonicalStack {
  return createCanonicalStack({ document, revision: stack.revision + 1 })
}

export function findLayer({
  document,
  layerId,
}: {
  document: CanonicalDocument
  layerId: string
}) {
  for (const panel of panelIdsOf({ document: document })) {
    const index = document.panels[panel].layers.findIndex(
      (layer) => layer.id === layerId,
    )

    if (index >= 0) {
      return { panel, index, layer: document.panels[panel].layers[index]! }
    }
  }

  return null
}

/** What a locked layer says when a command would change it (W3). */
const LOCKED_MESSAGE = 'locked; unlock it to edit'

/** The only change a locked layer takes is being unlocked. */
function isUnlockOnly({ patch }: { patch: CanonicalLayerPatch }) {
  const keys = Object.entries(patch).filter(([, value]) => value !== undefined)
  return keys.length > 0 && keys.every(([key, value]) => key === 'locked' && value === false)
}

/**
 * Why `command` would change a locked layer, or null. A locked layer can't
 * be moved, restyled, restacked, removed or drawn into until it is
 * unlocked; copying it is fine. A batch is checked command by command
 * against the document as the batch leaves it.
 */
export function lockedIssues({
  document,
  command,
}: {
  document: CanonicalDocument
  command: CanonicalCommand
}): ValidationIssue[] | null {
  const lockedLayer = (layerId: string) => findLayer({ document, layerId })?.layer.locked === true
  const refuse = (layerId: string): ValidationIssue[] => [{ path: '$', message: `${layerId} is ${LOCKED_MESSAGE}` }]

  if (command.type === 'batch') {
    let current = document

    for (const inner of command.commands) {
      const issues = lockedIssues({ document: current, command: inner })

      if (issues) {
        return issues
      }

      const applied = applyToDocument({ document: current, command: inner })

      if (!applied.ok) {
        return null
      }

      current = applied.document
    }

    return null
  }

  if (command.type === 'updateLayer') {
    return lockedLayer(command.layerId) && !isUnlockOnly({ patch: command.patch }) ? refuse(command.layerId) : null
  }

  if (
    command.type === 'addStroke' ||
    command.type === 'updateFill' ||
    command.type === 'clearPaintLayer' ||
    command.type === 'removeLayer' ||
    command.type === 'moveLayer'
  ) {
    return lockedLayer(command.layerId) ? refuse(command.layerId) : null
  }

  if (command.type === 'removeStroke') {
    for (const panel of panelIdsOf({ document: document })) {
      for (const layer of document.panels[panel].layers) {
        if (layer.kind === 'paint' && layer.locked && layer.strokes.some((stroke) => stroke.id === command.strokeId)) {
          return refuse(layer.id)
        }
      }
    }
  }

  return null
}

function missing({ id }: { id: string }): ValidationIssue[] {
  return [{ path: '$', message: `no layer ${id}` }]
}

function withNewIds({
  layer,
  newId,
}: {
  layer: CanonicalLayer
  newId: string
}): CanonicalLayer {
  const copy = structuredClone(layer)
  copy.id = newId
  // A copy is a new item to place, so it starts unlocked.
  delete copy.locked

  if (copy.kind === 'paint') {
    copy.strokes = copy.strokes.map((stroke, index) => ({
      ...stroke,
      id: `${newId}-s${index}`,
    }))
  }

  return copy
}

function applyToDocument({
  document,
  command,
}: {
  document: CanonicalDocument
  command: CanonicalCommand
}): { ok: true; document: CanonicalDocument } | { ok: false; issues: ValidationIssue[] } {
  if (command.type !== 'batch') {
    const locked = lockedIssues({ document, command })

    if (locked) {
      return { ok: false, issues: locked }
    }
  }

  const next = structuredClone(document)

  if (command.type === 'batch') {
    let current = next

    for (const inner of command.commands) {
      const applied = applyToDocument({ document: current, command: inner })

      if (!applied.ok) {
        return applied
      }

      current = applied.document
    }

    return { ok: true, document: current }
  }

  if (command.type === 'addStroke') {
    const layers = next.panels[command.panel].layers
    const found = findLayer({ document: next, layerId: command.layerId })

    if (found && (found.panel !== command.panel || found.layer.kind !== 'paint')) {
      return {
        ok: false,
        issues: [{ path: '$', message: `${command.layerId} is not a paint layer on ${command.panel}` }],
      }
    }

    if (found?.layer.kind === 'paint') {
      found.layer.strokes.push(structuredClone(command.stroke))
    } else {
      layers.push({
        id: command.layerId,
        kind: 'paint',
        visible: true,
        opacity: 1,
        strokes: [structuredClone(command.stroke)],
      })
    }

    return { ok: true, document: next }
  }

  if (command.type === 'removeStroke') {
    for (const panel of panelIdsOf({ document: next })) {
      for (const layer of next.panels[panel].layers) {
        if (layer.kind === 'paint') {
          layer.strokes = layer.strokes.filter((stroke) => stroke.id !== command.strokeId)
        }
      }
    }

    return { ok: true, document: next }
  }

  if (command.type === 'clearPaintLayer') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found || found.layer.kind !== 'paint') {
      return { ok: false, issues: missing({ id: command.layerId }) }
    }

    found.layer.strokes = []
    return { ok: true, document: next }
  }

  if (command.type === 'addLayer') {
    next.panels[command.panel].layers.push(structuredClone(command.layer))
    return { ok: true, document: next }
  }

  if (command.type === 'updateLayer') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found) {
      return { ok: false, issues: missing({ id: command.layerId }) }
    }

    const allowed =
      found.layer.kind === 'paint' || found.layer.kind === 'fill'
        ? ['opacity', 'visible', 'name', 'locked']
        : found.layer.kind === 'image'
          ? ['x', 'y', 'scale', 'rotation', 'opacity', 'visible', 'name', 'flipX', 'flipY', 'locked']
          : ['x', 'y', 'scale', 'rotation', 'opacity', 'visible', 'name', 'content', 'face', 'color', 'flipX', 'flipY', 'locked']

    for (const [key, value] of Object.entries(command.patch)) {
      if (value === undefined) {
        continue
      }

      if (!allowed.includes(key)) {
        return {
          ok: false,
          issues: [{ path: `$.patch.${key}`, message: `not editable on a ${found.layer.kind} layer` }],
        }
      }

      if ((key === 'flipX' || key === 'flipY' || key === 'locked') && value === false) {
        delete (found.layer as Record<string, unknown>)[key]
        continue
      }

      ;(found.layer as Record<string, unknown>)[key] = value
    }

    // Scaling a stretched layer back to square makes it uniform (reader R2):
    // one form per look, so `scaleY` goes.
    if ('scaleY' in found.layer && found.layer.scaleY === found.layer.scale) {
      delete found.layer.scaleY
    }

    return { ok: true, document: next }
  }

  if (command.type === 'removeLayer') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found) {
      return { ok: false, issues: missing({ id: command.layerId }) }
    }

    next.panels[found.panel].layers.splice(found.index, 1)
    return { ok: true, document: next }
  }

  if (command.type === 'moveLayer') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found) {
      return { ok: false, issues: missing({ id: command.layerId }) }
    }

    const layers = next.panels[found.panel].layers

    if (!Number.isInteger(command.toIndex) || command.toIndex < 0 || command.toIndex >= layers.length) {
      return { ok: false, issues: [{ path: '$.toIndex', message: `expected 0–${layers.length - 1}` }] }
    }

    const [layer] = layers.splice(found.index, 1)
    layers.splice(command.toIndex, 0, layer!)
    return { ok: true, document: next }
  }

  if (command.type === 'copyLayer') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found) {
      return { ok: false, issues: missing({ id: command.layerId }) }
    }

    const copy = withNewIds({ layer: found.layer, newId: command.newId })
    const target = next.panels[command.panel].layers

    if (command.panel === found.panel) {
      target.splice(found.index + 1, 0, copy)
    } else {
      target.push(copy)
    }

    return { ok: true, document: next }
  }

  if (command.type === 'setFabric') {
    if (command.fabric) {
      next.base.fabric = command.fabric
    } else {
      delete next.base.fabric
    }

    return { ok: true, document: next }
  }

  if (command.type === 'updateFill') {
    const found = findLayer({ document: next, layerId: command.layerId })

    if (!found) {
      return { ok: false, issues: missing({ id: command.layerId }) }
    }

    const fill = found.layer

    if (fill.kind !== 'fill') {
      return { ok: false, issues: [{ path: '$', message: `${command.layerId} is not a fill layer` }] }
    }

    const { tile, rotation, offsetX, offsetY, colors } = command.patch

    if (tile !== undefined) fill.tile = tile
    if (rotation !== undefined) fill.rotation = rotation

    // A phase of 0 is stored as none (reader R2).
    for (const [key, value] of [['offsetX', offsetX], ['offsetY', offsetY]] as const) {
      if (value === 0) {
        delete fill[key]
      } else if (value !== undefined) {
        fill[key] = value
      }
    }

    if (colors !== undefined) {
      if (!('pattern' in fill.source)) {
        return { ok: false, issues: [{ path: '$.patch.colors', message: 'not editable on an image fill' }] }
      }

      fill.source = { ...fill.source, colors: [colors[0], colors[1]] }
    }

    return { ok: true, document: next }
  }

  if (command.type === 'setPattern') {
    if (command.pattern) {
      next.pattern = structuredClone(command.pattern)
      // One or the other: the shape was folded into the pattern.
      delete next.shape
    } else {
      delete next.pattern
    }

    return { ok: true, document: next }
  }

  if (command.type === 'setShape') {
    const merged = { ...shapeOf({ document: next }) }

    for (const [field, value] of Object.entries(command.shape)) {
      if (value === undefined) {
        continue
      }

      if (!(field in merged)) {
        return { ok: false, issues: [{ path: `$.shape.${field}`, message: 'unknown field' }] }
      }

      merged[field as keyof CanonicalShape] = value
    }

    if (isNeutralShape({ shape: merged })) {
      delete next.shape
    } else {
      next.shape = merged
    }

    return { ok: true, document: next }
  }

  // A new colour or pattern keeps the cloth: only `setFabric` changes it.
  const fabric = command.base.fabric ?? document.base.fabric
  next.base = { ...structuredClone(command.base), ...(fabric ? { fabric } : {}) }
  return { ok: true, document: next }
}

export function applyCanonicalCommand({
  stack,
  command,
}: {
  stack: CanonicalStack
  command: CanonicalCommand
}): CommandResult {
  const applied = applyToDocument({ document: stack.document, command })

  if (!applied.ok) {
    return { ok: false, stack, issues: applied.issues }
  }

  const checked = validateCanonicalDocument({ value: applied.document })

  if (!checked.ok) {
    return { ok: false, stack, issues: checked.issues }
  }

  if (JSON.stringify(checked.document) === JSON.stringify(stack.document)) {
    return { ok: true, stack, changed: false }
  }

  return { ok: true, changed: true, stack: pushHistory({ stack, document: checked.document }) }
}

/** `document` becomes the head; the old head is one undo step back. */
function pushHistory({ stack, document }: { stack: CanonicalStack; document: CanonicalDocument }): CanonicalStack {
  return {
    document,
    revision: stack.revision + 1,
    past: [...stack.past, stack.document].slice(-MAX_HISTORY),
    future: [],
  }
}

/**
 * Swaps in a whole new document as one undoable step, for changes no single
 * command describes (moving a design onto a newer template). It is
 * validated like any command's result.
 */
export function replaceDocumentUndoable({
  stack,
  document,
}: {
  stack: CanonicalStack
  document: CanonicalDocument
}): { ok: true; stack: CanonicalStack } | { ok: false; issues: ValidationIssue[] } {
  const checked = validateCanonicalDocument({ value: document })
  return checked.ok ? { ok: true, stack: pushHistory({ stack, document: checked.document }) } : { ok: false, issues: checked.issues }
}

export function undoCanonical({ stack }: { stack: CanonicalStack }): CanonicalStack {
  const previous = stack.past[stack.past.length - 1]

  if (!previous) {
    return stack
  }

  return {
    document: previous,
    revision: stack.revision + 1,
    past: stack.past.slice(0, -1),
    future: [stack.document, ...stack.future],
  }
}

export function redoCanonical({ stack }: { stack: CanonicalStack }): CanonicalStack {
  const next = stack.future[0]

  if (!next) {
    return stack
  }

  return {
    document: next,
    revision: stack.revision + 1,
    past: [...stack.past, stack.document].slice(-MAX_HISTORY),
    future: stack.future.slice(1),
  }
}
