import type {
  DesignDocument,
  DesignLayer,
  GraphicLayer,
  PanelId,
  PatternLayer,
  TextLayer,
} from './design-document'

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

export function layerBox({
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

  return {
    width: Math.max(0.08, layer.scale),
    height: Math.max(0.08, layer.scale),
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
  const dx = x - layer.x
  const dy = y - layer.y
  const cos = Math.cos(-layer.rotation)
  const sin = Math.sin(-layer.rotation)

  return {
    x: dx * cos - dy * sin,
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

    if (layer.panel !== panel) {
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
