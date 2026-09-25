import {
  activePaintLayer,
  cloneDocument,
  createObjectId,
  type DesignDocument,
  type DesignLayer,
  type GraphicLayer,
  type PatternLayer,
  type Stroke,
  type StructuralParams,
  type TextFace,
  type TextLayer,
} from './design-document'

export type LayerPatch = {
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  color?: string
  visible?: boolean
  content?: string
  face?: TextFace
  label?: string
}
import type { MaterialOverride } from './design-schema'

export type DesignCommand =
  | { type: 'addStroke'; stroke: Stroke }
  | { type: 'eraseStroke'; strokeId: string }
  | { type: 'clearPaint' }
  | { type: 'addGraphic'; layer: GraphicLayer }
  | { type: 'addPattern'; layer: PatternLayer }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'addText'; layer: TextLayer }
  | { type: 'updateText'; layerId: string; content: string }
  | {
      type: 'updateLayer'
      layerId: string
      patch: LayerPatch
    }
  | { type: 'setStructural'; structural: StructuralParams }
  | { type: 'applyFabric'; override: MaterialOverride }

export type CommandStack = {
  document: DesignDocument
  past: DesignDocument[]
  future: DesignDocument[]
}

export function createCommandStack({
  document,
}: {
  document: DesignDocument
}): CommandStack {
  return {
    document: cloneDocument({ document }),
    past: [],
    future: [],
  }
}

function applyToDocument({
  document,
  command,
}: {
  document: DesignDocument
  command: DesignCommand
}): DesignDocument {
  const next = cloneDocument({ document })

  if (command.type === 'addStroke') {
    activePaintLayer({ document: next }).strokes.push({
      ...command.stroke,
      points: command.stroke.points.map((point) => ({ ...point })),
    })
    return next
  }

  if (command.type === 'eraseStroke') {
    for (const layer of next.layers) {
      if (layer.kind === 'paint') {
        layer.strokes = layer.strokes.filter(
          (stroke) => stroke.id !== command.strokeId,
        )
      }
    }
    return next
  }

  if (command.type === 'clearPaint') {
    for (const layer of next.layers) {
      if (layer.kind === 'paint') {
        layer.strokes = []
      }
    }
    return next
  }

  if (command.type === 'addGraphic') {
    next.layers.push({ ...command.layer })
    return next
  }

  if (command.type === 'addPattern') {
    next.layers.push({ ...command.layer })
    return next
  }

  if (command.type === 'addText') {
    next.layers.push({ ...command.layer })
    return next
  }

  if (command.type === 'updateText') {
    for (const layer of next.layers) {
      if (layer.kind === 'text' && layer.id === command.layerId) {
        layer.content = command.content
      }
    }
    return next
  }

  if (command.type === 'updateLayer') {
    for (const layer of next.layers) {
      if (layer.id !== command.layerId) {
        continue
      }

      if (
        layer.kind === 'graphic' ||
        layer.kind === 'text' ||
        layer.kind === 'pattern'
      ) {
        if (command.patch.x !== undefined) {
          layer.x = command.patch.x
        }

        if (command.patch.y !== undefined) {
          layer.y = command.patch.y
        }

        if (command.patch.scale !== undefined) {
          layer.scale = command.patch.scale
        }

        if (command.patch.rotation !== undefined) {
          layer.rotation = command.patch.rotation
        }

        if (command.patch.visible !== undefined) {
          layer.visible = command.patch.visible
        }

        if (command.patch.opacity !== undefined) {
          layer.opacity = Math.min(1, Math.max(0, command.patch.opacity))
        }

        if (command.patch.color !== undefined) {
          if (layer.kind === 'text' || layer.kind === 'pattern') {
            layer.color = command.patch.color
          }

          if (layer.kind === 'graphic') {
            layer.color = command.patch.color
          }
        }
      }

      if (layer.kind === 'text') {
        if (command.patch.content !== undefined) {
          layer.content = command.patch.content
        }

        if (command.patch.face !== undefined) {
          layer.face = command.patch.face
        }
      }

      if (command.patch.label !== undefined) {
        const nextLabel = command.patch.label.trim().slice(0, 40)
        layer.label = nextLabel.length > 0 ? nextLabel : undefined
      }

      if (layer.kind === 'paint' && command.patch.visible !== undefined) {
        layer.visible = command.patch.visible
      }
    }
    return next
  }

  if (command.type === 'removeLayer') {
    next.layers = next.layers.filter((layer) => layer.id !== command.layerId)
    if (!next.layers.some((layer) => layer.kind === 'paint')) {
      next.layers.push({
        id: createObjectId({ prefix: 'paint' }),
        kind: 'paint',
        visible: true,
        strokes: [],
      })
    }
    return next
  }

  if (command.type === 'setStructural') {
    next.structural = { ...next.structural, ...command.structural }
    return next
  }

  next.overrides = [...next.overrides, { ...command.override }]
  return next
}

export function applyCommand({
  stack,
  command,
}: {
  stack: CommandStack
  command: DesignCommand
}): CommandStack {
  return {
    document: applyToDocument({ document: stack.document, command }),
    past: [...stack.past, cloneDocument({ document: stack.document })],
    future: [],
  }
}

export function undoCommand({
  stack,
}: {
  stack: CommandStack
}): CommandStack {
  const previous = stack.past[stack.past.length - 1]

  if (!previous) {
    return stack
  }

  return {
    document: cloneDocument({ document: previous }),
    past: stack.past.slice(0, -1),
    future: [cloneDocument({ document: stack.document }), ...stack.future],
  }
}

export function redoCommand({
  stack,
}: {
  stack: CommandStack
}): CommandStack {
  const next = stack.future[0]

  if (!next) {
    return stack
  }

  return {
    document: cloneDocument({ document: next }),
    past: [...stack.past, cloneDocument({ document: stack.document })],
    future: stack.future.slice(1),
  }
}

export function canUndo({ stack }: { stack: CommandStack }) {
  return stack.past.length > 0
}

export function canRedo({ stack }: { stack: CommandStack }) {
  return stack.future.length > 0
}

export function isDesignLayer({ layer }: { layer: DesignLayer }) {
  return Boolean(layer.id && layer.kind)
}
