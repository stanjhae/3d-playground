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
import { DEFAULT_PANEL_UV } from './panel-uv'

export type PlaceableLayer = GraphicLayer | TextLayer | PatternLayer

export type LayerHandle = 'move' | 'scale' | 'rotate'

export type LayerEdit = {
  layerId: string
  x: number
  y: number
  scale: number
  rotation: number
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

    return {
      width: Math.max(0.1, layer.scale * (0.7 + letters * 0.36)),
      height: Math.max(0.06, layer.scale * 0.9),
    }
  }

  // Uploaded images keep their natural aspect (E03 #154), so selection
  // matches what is drawn instead of a square around it.
  const box =
    layer.kind === 'graphic' && layer.aspect && layer.aspect !== 1
      ? imageBox({ scale: layer.scale, aspect: layer.aspect })
      : { width: layer.scale, height: layer.scale }

  return {
    width: Math.max(0.08, box.width),
    height: Math.max(0.08, box.height),
  }
}

export function layerHandleLocal({
  layer,
}: {
  layer: PlaceableLayer
}) {
  const box = layerBox({ layer })

  return {
    scale: { x: box.width / 2, y: -box.height / 2 },
    rotate: { x: 0, y: box.height / 2 + LAYER_ROTATE_GAP },
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
    layer.x === edit.x &&
    layer.y === edit.y &&
    layer.scale === edit.scale &&
    layer.rotation === edit.rotation
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
}: {
  document: DesignDocument
  panel: PanelId
  x: number
  y: number
}): PlaceableLayer | null {
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]

    if (!layer || !layer.visible || !isPlaceable({ layer })) {
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
    if (layer.panel !== panel || (layer.kind !== 'pattern' && layer.locked)) {
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
}: {
  layer: PlaceableLayer
  x: number
  y: number
}): LayerHandle | null {
  const local = toLocal({ layer, x, y })
  const half = layerHalf({ layer })
  const handles = layerHandleLocal({ layer })
  const pad = Math.max(0.03, Math.min(half.width, half.height) * 0.45)

  if (
    Math.hypot(local.x - handles.scale.x, local.y - handles.scale.y) < pad
  ) {
    return 'scale'
  }

  if (Math.hypot(local.x - handles.rotate.x, local.y - handles.rotate.y) < pad) {
    return 'rotate'
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

      return {
        ...layer,
        x: edit.x,
        y: edit.y,
        scale: edit.scale,
        rotation: edit.rotation,
      }
    }),
  }
}

export function layerVoice({
  layer,
}: {
  layer: DesignLayer
}) {
  if (layer.label?.trim()) {
    return layer.label.trim()
  }

  if (layer.kind === 'paint') {
    return 'Ink'
  }

  if (layer.kind === 'graphic') {
    return 'Mark'
  }

  if (layer.kind === 'text') {
    return layer.content.trim() || 'Word'
  }

  if (layer.kind === 'pattern') {
    return layer.patternId === 'check' ? 'Check' : 'Stripe'
  }

  return 'Look'
}
