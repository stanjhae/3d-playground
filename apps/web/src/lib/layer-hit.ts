import { MOTIF_LABELS, isMotifId } from './base-motifs'
import { curvedBox } from './text-curve'
import { LAYER_SCALE_RANGE, clampLayerScale } from './layer-scale'
import type {
  DesignDocument,
  DesignLayer,
  GraphicLayer,
  PanelId,
  PanelSurface,
  PatternLayer,
  TextLayer,
} from './design-document'
import { imageBox } from './canonical-document'
import { GRAPHIC_ROWS } from './graphics-catalogue.gen'
import { DEFAULT_PANEL_UV } from './panel-uv'

export type PlaceableLayer = GraphicLayer | TextLayer | PatternLayer

/** A side of the selection box: dragging it stretches only that side (W). */
export type LayerEdge = 'left' | 'right' | 'top' | 'bottom'

export type LayerHandle = 'move' | 'scale' | 'rotate' | LayerEdge

export const LAYER_EDGES: readonly LayerEdge[] = ['left', 'right', 'top', 'bottom']

export function isEdgeHandle(handle: LayerHandle | null): handle is LayerEdge {
  return handle === 'left' || handle === 'right' || handle === 'top' || handle === 'bottom'
}

/** Words and images stretch (canonical `scaleY`); patterns stay square. */
export function layerStretches({ layer }: { layer: PlaceableLayer }) {
  return layer.kind === 'graphic' || layer.kind === 'text'
}

export type LayerEdit = {
  layerId: string
  x: number
  y: number
  scale: number
  rotation: number
  /** Set when a drag carries the layer onto another panel (render space). */
  panel?: PanelId
  /** That panel's surface, so the frame is measured on it while dragged. */
  surface?: PanelSurface
  /** Height scale while stretching; absent keeps the layer's own. */
  scaleY?: number
}

export const LAYER_ROTATE_GAP = 0.04

/** Width / height of the layer's panel on the cloth; 1 on older templates. */
export function panelTrueAspect({ layer }: { layer: PlaceableLayer }) {
  return layer.kind === 'pattern' ? 1 : (layer.surface?.panelAspect ?? 1)
}

/**
 * The most a newly placed image of `aspect` may scale to on a panel: at the
 * template's starting size a square would run off a sleeve, which is short.
 */
export function placementScale({
  panel,
  scale,
  aspect,
  surface,
}: {
  panel: PanelId
  scale: number
  aspect: number
  surface?: PanelSurface
}) {
  if (!surface) {
    return scale
  }

  const rect = surface.uv ?? DEFAULT_PANEL_UV[panel]!
  const box = imageBox({ scale, aspect })
  const fills = Math.max(box.width / (rect.u1 - rect.u0), (box.height * surface.stretchY) / (rect.v1 - rect.v0))
  return fills > 0.9 ? scale * (0.9 / fills) : scale
}

export function layerBox({
  layer,
}: {
  layer: PlaceableLayer
}) {
  const atlas = atlasBox({ layer })
  const surface = layer.kind === 'pattern' ? undefined : layer.surface

  if (!surface) {
    return atlas
  }

  // The panel draws its atlas rectangle at the cloth's shape, so the frame
  // follows what is drawn, in that panel's own units.
  const rect = surface.uv ?? DEFAULT_PANEL_UV[layer.panel]!
  return {
    width: atlas.width / (rect.u1 - rect.u0),
    height: (atlas.height * surface.stretchY) / (rect.v1 - rect.v0),
  }
}

function atlasBox({
  layer,
}: {
  layer: PlaceableLayer
}) {
  if (layer.kind === 'text') {
    const letters = Math.max(1, layer.content.trim().length)
    const straight = {
      width: Math.max(0.1, layer.scale * (0.7 + letters * 0.36)),
      // A stretched word (reader R2) is taller or shorter, never wider.
      height: Math.max(0.06, (layer.scaleY ?? layer.scale) * 0.9),
    }

    // A word on an arc fills the arc's box (tester, 22 Nov).
    return layer.curve ? curvedBox({ ...straight, curve: layer.curve }) : straight
  }

  // Uploaded images keep their natural aspect (E03 #154), so selection
  // matches what is drawn instead of a square around it.
  // A stretched image (reader R2) takes its height from `scaleY`.
  const scaleY = layer.kind === 'graphic' ? (layer.scaleY ?? layer.scale) : layer.scale
  const box =
    layer.kind === 'graphic' && layer.aspect && layer.aspect !== 1
      ? imageBox({ scale: layer.scale, scaleY, aspect: layer.aspect })
      : { width: layer.scale, height: scaleY }

  return {
    width: Math.max(0.08, box.width),
    height: Math.max(0.08, box.height),
  }
}

/** How far inside the panel's edge a handle must sit to be pressed. */
const HANDLE_EDGE = 0.03

/**
 * Whether the rotate handle sits below the box: above it, near the top of
 * the panel, it would be off the panel, where a press can't reach it.
 */
export function rotateHandleBelow({ layer }: { layer: PlaceableLayer }) {
  const box = layerBox({ layer })
  const reach = (box.height / 2 + LAYER_ROTATE_GAP) * Math.cos(layer.rotation)
  const overflow = (y: number) => Math.max(0, y - (1 - HANDLE_EDGE), HANDLE_EDGE - y)
  const above = overflow(layer.y + reach)
  return above > 0 && overflow(layer.y - reach) < above
}

export function layerHandleLocal({
  layer,
}: {
  layer: PlaceableLayer
}) {
  const box = layerBox({ layer })
  const rotateY = box.height / 2 + LAYER_ROTATE_GAP

  return {
    scale: { x: box.width / 2, y: -box.height / 2 },
    rotate: { x: 0, y: rotateHandleBelow({ layer }) ? -rotateY : rotateY },
    // Mid-edge handles (stretch one side, W), only where the layer stretches.
    ...(layerStretches({ layer })
      ? {
          left: { x: -box.width / 2, y: 0 },
          right: { x: box.width / 2, y: 0 },
          top: { x: 0, y: box.height / 2 },
          bottom: { x: 0, y: -box.height / 2 },
        }
      : {}),
  }
}

/** Below this share showing, most of a layer is outside its panel. */
const MOSTLY_OFF_PANEL_SHARE = 0.3

/**
 * How much of a layer's box falls on its panel, from 0 to 1. A layer's centre
 * always stays on the panel, so none is ever wholly off; a corner can still
 * leave most of it unseen.
 */
export function layerShareOnPanel({ layer }: { layer: PlaceableLayer }) {
  const box = layerBox({ layer })
  const aspect = panelTrueAspect({ layer })
  const cos = Math.cos(layer.rotation)
  const sin = Math.sin(layer.rotation)
  const samples = 21
  let inside = 0

  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      const localX = ((column + 0.5) / samples - 0.5) * box.width * aspect
      const localY = ((row + 0.5) / samples - 0.5) * box.height
      const x = layer.x + (localX * cos - localY * sin) / aspect
      const y = layer.y + localX * sin + localY * cos
      inside += x >= 0 && x <= 1 && y >= 0 && y <= 1 ? 1 : 0
    }
  }

  return inside / (samples * samples)
}

export function layerMostlyOffPanel({ layer }: { layer: PlaceableLayer }) {
  return layerShareOnPanel({ layer }) < MOSTLY_OFF_PANEL_SHARE
}

export function canvasLayerFrame({
  layer,
  width,
  height,
}: {
  layer: PlaceableLayer
  width: number
  height: number
}) {
  const box = layerBox({ layer })

  return {
    x: layer.x * width,
    y: (1 - layer.y) * height,
    width: box.width * width,
    height: box.height * height,
    rotateGap: LAYER_ROTATE_GAP * height,
  }
}

/**
 * CSS width of the in-place word editor: the word's own frame, but never so
 * narrow that the word scrolls inside it, and never wider than the panel.
 */
export function wordEditorWidth({ frameShare, length }: { frameShare: number; length: number }) {
  const share = Math.max(18, frameShare * 100)
  return `min(100%, max(${share}%, calc(${Math.max(4, length + 1)}ch + 1.5rem)))`
}

export function placeablePoseMatches({
  layer,
  edit,
}: {
  layer: PlaceableLayer
  edit: LayerEdit
}) {
  return (
    (!edit.panel || edit.panel === layer.panel) &&
    layer.x === edit.x &&
    layer.y === edit.y &&
    layer.scale === edit.scale &&
    layer.rotation === edit.rotation &&
    (edit.scaleY === undefined || layer.kind === 'pattern' || (layer.scaleY ?? layer.scale) === edit.scaleY)
  )
}

export function placedType({
  typeDraft,
}: {
  typeDraft: string
}) {
  const content = typeDraft.trim()

  if (!content) {
    return null
  }

  return content.slice(0, 32)
}

export function wordEditShouldCommit({
  layerContent,
  editStartContent,
}: {
  layerContent: string
  editStartContent: string
}) {
  return layerContent === editStartContent
}

export function selectedTextLayer({
  document,
  selectedLayerId,
}: {
  document: DesignDocument
  selectedLayerId: string | null
}) {
  const layer = document.layers.find((entry) => entry.id === selectedLayerId)

  if (!layer || layer.kind !== 'text') {
    return null
  }

  return layer
}

/**
 * The base pattern's per-panel stamps (`base-fill-*`, projected from the
 * garment's Colour & Pattern choice). They belong to the cloth, not the
 * surface: a press never picks, moves or resizes them, so drawing over a
 * striped garment draws.
 */
export function isBaseFill({ layer }: { layer: { id: string } }) {
  return layer.id === 'base-fill' || layer.id.startsWith('base-fill-')
}

/** Whether a selected layer shows handles and answers presses on the surface. */
export function movableOnSurface({ layer }: { layer: PlaceableLayer }) {
  return layer.visible && !isBaseFill({ layer }) && (layer.kind === 'pattern' || !layer.locked)
}

function isPlaceable({
  layer,
}: {
  layer: DesignLayer
}) {
  return (
    layer.kind === 'graphic' ||
    layer.kind === 'text' ||
    layer.kind === 'pattern'
  )
}

function layerHalf({
  layer,
}: {
  layer: PlaceableLayer
}) {
  const box = layerBox({ layer })

  return {
    width: box.width / 2,
    height: box.height / 2,
  }
}

function toLocal({
  layer,
  x,
  y,
}: {
  layer: PlaceableLayer
  x: number
  y: number
}) {
  // A turn is a turn on the cloth, so measure it in the panel's true shape.
  const aspect = panelTrueAspect({ layer })
  const dx = (x - layer.x) * aspect
  const dy = y - layer.y
  const cos = Math.cos(-layer.rotation)
  const sin = Math.sin(-layer.rotation)

  return {
    x: (dx * cos - dy * sin) / aspect,
    y: dx * sin + dy * cos,
  }
}

export function hitPlaceableLayer({
  document,
  panel,
  x,
  y,
  withLocked = false,
}: {
  document: DesignDocument
  panel: PanelId
  x: number
  y: number
  /** Also find a locked item, to say why it won't move. */
  withLocked?: boolean
}): PlaceableLayer | null {
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]

    if (!layer || !layer.visible || !isPlaceable({ layer }) || isBaseFill({ layer })) {
      continue
    }

    if (
      layer.kind !== 'graphic' &&
      layer.kind !== 'text' &&
      layer.kind !== 'pattern'
    ) {
      continue
    }

    // A locked item can't be picked on the cloth (W3): the click passes to
    // whatever is under it. It is still selectable from the layer list.
    if (layer.panel !== panel || (!withLocked && layer.kind !== 'pattern' && layer.locked)) {
      continue
    }

    const local = toLocal({ layer, x, y })
    const half = layerHalf({ layer })

    if (Math.abs(local.x) <= half.width && Math.abs(local.y) <= half.height) {
      return layer
    }
  }

  return null
}

export function hitLayerHandle({
  layer,
  x,
  y,
  zoom = 1,
}: {
  layer: PlaceableLayer
  x: number
  y: number
  /** The panel's zoom (`panel-zoom.ts`): the least reach stays the same on screen. */
  zoom?: number
}): LayerHandle | null {
  const local = toLocal({ layer, x, y })
  const half = layerHalf({ layer })
  const handles = layerHandleLocal({ layer })
  const near = 1 / Math.max(1, zoom)
  const pad = Math.max(0.03 * near, Math.min(half.width, half.height) * 0.45)
  // Edge handles sit between the corner and the rotate handle, so they reach less far.
  const edgePad = Math.max(0.025 * near, Math.min(half.width, half.height) * 0.3)
  // The nearest handle within reach wins, so the top edge and the rotate
  // handle just above it can each be grabbed.
  let nearest: { handle: LayerHandle; distance: number } | null = null
  // Edges answer only near the rim: a press in the middle of a mark always
  // moves it, however small the mark (its edge reaches would cover it).
  const core = Math.abs(local.x) < half.width * 0.6 && Math.abs(local.y) < half.height * 0.6

  for (const handle of ['scale', 'rotate', ...LAYER_EDGES] as const) {
    const at = handles[handle]

    if (!at || (core && isEdgeHandle(handle))) {
      continue
    }

    const distance = Math.hypot(local.x - at.x, local.y - at.y)

    if (distance < (isEdgeHandle(handle) ? edgePad : pad) && (!nearest || distance < nearest.distance)) {
      nearest = { handle, distance }
    }
  }

  if (nearest) {
    return nearest.handle
  }

  if (Math.abs(local.x) <= half.width && Math.abs(local.y) <= half.height) {
    return 'move'
  }

  return null
}

export function applyLayerEdit({
  document,
  edit,
}: {
  document: DesignDocument
  edit: LayerEdit | null
}): DesignDocument {
  if (!edit) {
    return document
  }

  return {
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.id !== edit.layerId) {
        return layer
      }

      if (
        layer.kind !== 'graphic' &&
        layer.kind !== 'text' &&
        layer.kind !== 'pattern'
      ) {
        return layer
      }

      const carried =
        edit.panel && edit.panel !== layer.panel
          ? layer.kind === 'pattern'
            ? { panel: edit.panel }
            : { panel: edit.panel, surface: edit.surface }
          : {}

      const moved = {
        ...layer,
        ...carried,
        x: edit.x,
        y: edit.y,
        scale: edit.scale,
        rotation: edit.rotation,
      } as PlaceableLayer

      if (edit.scaleY === undefined || moved.kind === 'pattern') {
        return moved
      }

      // A stretch drawn live; back to square, it is uniform again.
      const { scaleY: _previous, ...uniform } = moved
      return (edit.scaleY === edit.scale ? uniform : { ...uniform, scaleY: edit.scaleY }) as PlaceableLayer
    }),
  }
}

/** Library graphics by `src`, built on first use so pages that never name a layer skip it. */
let graphicLabels: Map<string, string> | null = null

/**
 * What an unnamed image is called (tester pass 3): a library graphic by its
 * label ("Rising Flame"), anything else (an upload, a placeholder) "Image".
 * Derived when shown, so saved designs need no change.
 */
export function graphicName({ src }: { src: string }) {
  graphicLabels ??= new Map(GRAPHIC_ROWS.map(([id, label]) => [`/graphics/${id}.svg`, label]))
  return graphicLabels.get(src) ?? 'Image'
}

/** The name every image once showed. Nobody chose it, so it is derived again. */
const OLD_GRAPHIC_DEFAULT = 'mark'

export function layerVoice({
  layer,
}: {
  layer: DesignLayer
}) {
  const label = layer.label?.trim()

  if (label && !(layer.kind === 'graphic' && label.toLowerCase() === OLD_GRAPHIC_DEFAULT)) {
    return label
  }

  if (layer.kind === 'paint') {
    return 'Ink'
  }

  if (layer.kind === 'graphic') {
    return graphicName({ src: layer.src })
  }

  if (layer.kind === 'text') {
    return layer.content.trim() || 'Word'
  }

  if (layer.kind === 'pattern') {
    return isMotifId(layer.patternId) ? MOTIF_LABELS[layer.patternId] : layer.patternId === 'check' ? 'Check' : 'Stripe'
  }

  // A whole-panel fill (reader R2), named for what it repeats.
  if (layer.kind === 'fill') {
    return layer.source.kind === 'image' ? 'Image fill' : layer.source.patternId === 'check' ? 'Check fill' : 'Stripe fill'
  }

  return 'Look'
}

export { LAYER_SCALE_RANGE }

const clampScale = clampLayerScale

/**
 * Dragging one edge of a layer (stretch one side, W): only that side moves.
 * The opposite edge stays where it was, so the centre moves half as far,
 * along the layer's own axis (its rotation measured on the cloth). Left and
 * right change `scale` (the width), top and bottom `scaleY` (the height).
 * `from` and `to` are the pointer at the start and now, in panel units.
 */
export function stretchEdge({
  layer,
  edge,
  from,
  to,
}: {
  layer: PlaceableLayer
  edge: LayerEdge
  from: { x: number; y: number }
  to: { x: number; y: number }
}): Omit<LayerEdit, 'layerId'> {
  const aspect = panelTrueAspect({ layer })
  const box = layerBox({ layer })
  const scaleY = layer.kind === 'pattern' ? layer.scale : (layer.scaleY ?? layer.scale)
  const cos = Math.cos(layer.rotation)
  const sin = Math.sin(layer.rotation)
  // The pointer's travel on the cloth (x in true proportions), along the layer's axes.
  const dx = (to.x - from.x) * aspect
  const dy = to.y - from.y
  const along = edge === 'left' || edge === 'right' ? dx * cos + dy * sin : -dx * sin + dy * cos
  const sign = edge === 'right' || edge === 'top' ? 1 : -1
  const horizontal = edge === 'left' || edge === 'right'
  // The side's length now, in true units; at least the smallest a layer may be.
  const length = horizontal ? box.width * aspect : box.height
  const start = horizontal ? layer.scale : scaleY
  const wanted = clampScale(start * Math.max(0.01, (length + sign * along) / Math.max(1e-6, length)))
  // The centre for a given size: it follows the moving side by half the
  // growth, measured on the new box (a box never gets smaller than its minimum).
  const placed = (size: number) => {
    const after = layerBox({ layer: { ...layer, ...(horizontal ? { scale: size } : layer.kind === 'pattern' ? { scale: size } : { scaleY: size }) } as PlaceableLayer })
    const shift = (sign * ((horizontal ? after.width * aspect : after.height) - length)) / 2
    return {
      x: layer.x + (horizontal ? shift * cos : -shift * sin) / aspect,
      y: layer.y + (horizontal ? shift * sin : shift * cos),
    }
  }
  const fits = ({ x, y }: { x: number; y: number }) => x >= 0 && x <= 1 && y >= 0 && y <= 1
  let next = wanted

  // Past the panel's edge the centre would have to be clamped, which would
  // move the side that should stay put; stretch only as far as it fits.
  if (!fits(placed(wanted)) && fits(placed(start))) {
    let [low, high] = [start, wanted]

    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2
      ;[low, high] = fits(placed(middle)) ? [middle, high] : [low, middle]
    }

    next = low
  }

  const { x, y } = placed(next)

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    rotation: layer.rotation,
    scale: horizontal ? next : layer.scale,
    scaleY: horizontal ? scaleY : next,
  }
}

/**
 * Dragging the corner: uniform, about the centre, so a stretched layer
 * keeps its proportions (`scaleY` follows `scale`). With `free` (Shift),
 * width and height follow the pointer separately.
 */
export function scaleCorner({
  layer,
  from,
  to,
  free = false,
}: {
  layer: PlaceableLayer
  from: { x: number; y: number }
  to: { x: number; y: number }
  free?: boolean
}): Omit<LayerEdit, 'layerId'> {
  const scaleY = layer.kind === 'pattern' ? layer.scale : (layer.scaleY ?? layer.scale)
  const pose = { x: layer.x, y: layer.y, rotation: layer.rotation }

  if (free && layerStretches({ layer })) {
    const start = toLocal({ layer, x: from.x, y: from.y })
    const now = toLocal({ layer, x: to.x, y: to.y })
    const width = clampScale(layer.scale * (Math.abs(now.x) / Math.max(0.01, Math.abs(start.x))))
    const height = clampScale(scaleY * (Math.abs(now.y) / Math.max(0.01, Math.abs(start.y))))
    return { ...pose, scale: width, scaleY: height }
  }

  const ratio = Math.hypot(to.x - layer.x, to.y - layer.y) / Math.max(0.02, Math.hypot(from.x - layer.x, from.y - layer.y))
  // Clamped so neither side leaves the range, and the proportions hold.
  const most = LAYER_SCALE_RANGE.max / Math.max(layer.scale, scaleY)
  const least = LAYER_SCALE_RANGE.min / Math.min(layer.scale, scaleY)
  const k = Math.min(most, Math.max(least, ratio))
  const scale = layer.scale * k

  return layer.kind !== 'pattern' && layer.scaleY !== undefined
    ? { ...pose, scale, scaleY: layer.scaleY * k }
    : { ...pose, scale }
}
