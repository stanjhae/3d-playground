import { beforeEach, describe, expect, test } from 'vitest'

import { type GraphicLayer, createEmptyDocument } from './design-document'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import {
  LAYER_SCALE_RANGE,
  type LayerEdge,
  applyLayerEdit,
  hitLayerHandle,
  layerBox,
  layerHandleLocal,
  scaleCorner,
  stretchEdge,
} from './layer-hit'

/** Stretch one side (W): edge handles, the corner, and Shift for a free corner. */

const image = (patch: Partial<GraphicLayer> = {}): GraphicLayer => ({
  id: 'img',
  kind: 'graphic',
  panel: 'front',
  src: 'data:image/png;base64,abc',
  aspect: 1,
  x: 0.5,
  y: 0.5,
  scale: 0.3,
  rotation: 0,
  opacity: 1,
  visible: true,
  // A panel wider than it is tall, so the cloth's true proportions matter.
  surface: { stretchY: 1, panelAspect: 1.6 },
  ...patch,
})

/** Where a local point of the layer (panel units, before its turn) lies on the panel. */
function onPanel({ layer, local }: { layer: GraphicLayer; local: { x: number; y: number } }) {
  const aspect = layer.surface?.panelAspect ?? 1
  const cos = Math.cos(layer.rotation)
  const sin = Math.sin(layer.rotation)
  const dx = local.x * aspect
  return { x: layer.x + (dx * cos - local.y * sin) / aspect, y: layer.y + dx * sin + local.y * cos }
}

function edgeOf({ layer, edge }: { layer: GraphicLayer; edge: LayerEdge }) {
  return onPanel({ layer, local: layerHandleLocal({ layer })[edge]! })
}

const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const

describe('edge handles', () => {
  test('words and images get one on each side; a pattern gets none', () => {
    const layer = image()
    const box = layerBox({ layer })

    expect(layerHandleLocal({ layer })).toMatchObject({
      left: { x: -box.width / 2, y: 0 },
      right: { x: box.width / 2, y: 0 },
      top: { x: 0, y: box.height / 2 },
      bottom: { x: 0, y: -box.height / 2 },
    })

    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      expect(hitLayerHandle({ layer, ...edgeOf({ layer, edge }) })).toBe(edge)
    }

    const stripe = { id: 'p', kind: 'pattern', patternId: 'stripe', panel: 'front', color: '#000000', x: 0.5, y: 0.5, scale: 0.3, rotation: 0, opacity: 1, visible: true } as const
    expect(layerHandleLocal({ layer: stripe })).not.toHaveProperty('left')
  })

  test('the corner and the rotate handle just above the top edge keep their own', () => {
    const layer = image()
    const local = layerHandleLocal({ layer })

    expect(hitLayerHandle({ layer, ...onPanel({ layer, local: local.rotate }) })).toBe('rotate')
    expect(hitLayerHandle({ layer, ...onPanel({ layer, local: local.scale }) })).toBe('scale')
    expect(hitLayerHandle({ layer, x: 0.5, y: 0.5 })).toBe('move')
  })
})

describe('stretchEdge', () => {
  test.each([0, 0.7, -2.1])('moves only the dragged side; the opposite one stays put (turned %s rad)', (rotation) => {
    const layer = image({ rotation })

    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const from = edgeOf({ layer, edge })
      // Pull the edge out along the layer's own axis, by a fifth of the side's length.
      const outward = layerHandleLocal({ layer })[edge]!
      const to = onPanel({ layer, local: { x: outward.x * 1.4, y: outward.y * 1.4 } })
      const stretched = { ...layer, ...stretchEdge({ layer, edge, from, to }) }
      const horizontal = edge === 'left' || edge === 'right'

      // Left and right change the width, top and bottom the height.
      expect(stretched.scale !== layer.scale, edge).toBe(horizontal)
      expect(stretched.scaleY !== layer.scale, edge).toBe(!horizontal)
      expect(horizontal ? stretched.scale : stretched.scaleY!).toBeCloseTo(layer.scale * 1.2, 6)

      const fixedBefore = edgeOf({ layer, edge: OPPOSITE[edge] })
      const fixedAfter = edgeOf({ layer: stretched, edge: OPPOSITE[edge] })
      expect(fixedAfter.x, edge).toBeCloseTo(fixedBefore.x, 6)
      expect(fixedAfter.y, edge).toBeCloseTo(fixedBefore.y, 6)
      // The dragged edge lands under the pointer.
      const moved = edgeOf({ layer: stretched, edge })
      expect(moved.x, edge).toBeCloseTo(to.x, 6)
      expect(moved.y, edge).toBeCloseTo(to.y, 6)
      expect(stretched.rotation).toBe(rotation)
    }
  })

  test('shrinking stops at the smallest a side may be, still keeping the other side put', () => {
    const layer = image()
    const from = edgeOf({ layer, edge: 'right' })
    const edit = stretchEdge({ layer, edge: 'right', from, to: { x: 0, y: from.y } })

    expect(edit.scale).toBe(LAYER_SCALE_RANGE.min)
    expect(edgeOf({ layer: { ...layer, ...edit }, edge: 'left' }).x).toBeCloseTo(edgeOf({ layer, edge: 'left' }).x, 6)
  })

  test('a stretched layer keeps its width when its height changes', () => {
    const layer = image({ scaleY: 0.4 })
    const from = edgeOf({ layer, edge: 'top' })
    const edit = stretchEdge({ layer, edge: 'top', from, to: { x: from.x, y: from.y - 0.05 } })

    expect(edit.scale).toBe(0.3)
    expect(edit.scaleY).toBeLessThan(0.4)
  })
})

describe('scaleCorner', () => {
  test('scales uniformly about the centre; a stretched layer keeps its proportions', () => {
    const layer = image()
    const corner = onPanel({ layer, local: layerHandleLocal({ layer }).scale })
    const twice = { x: 0.5 + (corner.x - 0.5) * 2, y: 0.5 + (corner.y - 0.5) * 2 }

    expect(scaleCorner({ layer, from: corner, to: twice })).toEqual({ x: 0.5, y: 0.5, rotation: 0, scale: 0.6 })

    const tall = image({ scale: 0.2, scaleY: 0.25 })
    const tallCorner = onPanel({ layer: tall, local: layerHandleLocal({ layer: tall }).scale })
    const edit = scaleCorner({ layer: tall, from: tallCorner, to: { x: 0.5 + (tallCorner.x - 0.5) * 1.5, y: 0.5 + (tallCorner.y - 0.5) * 1.5 } })
    expect(edit.scale).toBeCloseTo(0.3, 6)
    expect(edit.scaleY).toBeCloseTo(0.375, 6)
  })

  test('the larger side stops at the limit, and the proportions still hold', () => {
    const tall = image({ scale: 0.2, scaleY: 0.4 })
    const corner = onPanel({ layer: tall, local: layerHandleLocal({ layer: tall }).scale })
    const edit = scaleCorner({ layer: tall, from: corner, to: { x: 0.5 + (corner.x - 0.5) * 4, y: 0.5 + (corner.y - 0.5) * 4 } })

    expect(edit.scaleY).toBeCloseTo(LAYER_SCALE_RANGE.max, 6)
    expect(edit.scaleY! / edit.scale).toBeCloseTo(2, 6)
  })

  test('with Shift, width and height follow the pointer on their own', () => {
    const layer = image()
    const corner = onPanel({ layer, local: layerHandleLocal({ layer }).scale })
    const edit = scaleCorner({ layer, from: corner, to: { x: 0.5 + (corner.x - 0.5) * 2, y: corner.y }, free: true })

    expect(edit.scale).toBeCloseTo(0.6, 6)
    expect(edit.scaleY).toBeCloseTo(0.3, 6)
  })
})

describe('applyLayerEdit with a height', () => {
  test('draws a live stretch; back to square it is uniform again; no height keeps the layer\'s own', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    document.layers.push(image())
    const stretched = applyLayerEdit({ document, edit: { layerId: 'img', x: 0.5, y: 0.5, scale: 0.3, rotation: 0, scaleY: 0.45 } })

    expect(stretched.layers.find((layer) => layer.id === 'img')).toMatchObject({ scale: 0.3, scaleY: 0.45 })
    expect(applyLayerEdit({ document: stretched, edit: { layerId: 'img', x: 0.5, y: 0.5, scale: 0.3, rotation: 0, scaleY: 0.3 } }).layers.find((layer) => layer.id === 'img')).not.toHaveProperty('scaleY')
    expect(applyLayerEdit({ document: stretched, edit: { layerId: 'img', x: 0.4, y: 0.5, scale: 0.3, rotation: 0 } }).layers.find((layer) => layer.id === 'img')).toMatchObject({ scaleY: 0.45 })
  })
})

describe('the editor commits a stretch', () => {
  const store = () => useEditorStore.getState()
  const stored = (id: string) => getCanonicalDocument().panels.front.layers.find((layer) => layer.id === id)

  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('an edge drag is one undo step and saves scaleY; undo puts it back', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg' })
    const id = store().selectedLayerId!
    const before = stored(id)!
    const steps = store().undoCount
    const start = { layerId: id, x: 0.5, y: 0.5, scale: 0.2, rotation: 0 }
    store().startLayerEdit({ edit: start })

    for (let index = 1; index <= 8; index += 1) {
      store().moveLayerEdit({ edit: { ...start, y: 0.5 + index * 0.005, scaleY: 0.2 + index * 0.01 } })
    }

    store().endLayerEdit()
    expect(store().undoCount).toBe(steps + 1)
    expect(stored(id)).toMatchObject({ scale: 0.2, scaleY: 0.28, y: 0.54 })

    store().undoLast()
    expect(stored(id)).toEqual(before)
  })

  test('a height from the inspector, and back to uniform', () => {
    store().addText({ content: 'WIDE' })
    const id = store().selectedLayerId!
    const scale = (stored(id) as { scale: number }).scale

    store().updateLayer({ layerId: id, patch: { scaleY: scale * 2 } })
    expect(stored(id)).toMatchObject({ scale, scaleY: scale * 2 })
    // Given its width as its height again, it is uniform: one form per look.
    store().updateLayer({ layerId: id, patch: { scaleY: scale } })
    expect(stored(id)).not.toHaveProperty('scaleY')
  })
})

describe('review fixes: small marks and panel edges', () => {
  test('a press inside a small mark moves it, however close its edge handles reach', () => {
    const small = image({ scale: LAYER_SCALE_RANGE.min })
    const half = layerBox({ layer: small })
    // Points well inside the box, short of the rim on each axis.
    for (const local of [
      { x: 0, y: 0 },
      { x: half.width * 0.25, y: 0 },
      { x: 0, y: half.height * 0.25 },
      { x: -half.width * 0.25, y: -half.height * 0.25 },
    ]) {
      expect(hitLayerHandle({ layer: small, ...onPanel({ layer: small, local }) })).toBe('move')
    }

    // At the rim the edge still answers.
    expect(hitLayerHandle({ layer: small, ...onPanel({ layer: small, local: { x: half.width / 2, y: 0 } }) })).toBe('right')
  })

  test('stretching towards the panel edge stops where the far side would have to move', () => {
    const near = image({ x: 0.85, scale: 0.2 })
    const box = layerBox({ layer: near })
    const leftBefore = near.x - box.width / 2
    const edit = stretchEdge({ layer: near, edge: 'right', from: { x: 0.9, y: 0.5 }, to: { x: 1.4, y: 0.5 } })
    const after = layerBox({ layer: { ...near, ...edit } as GraphicLayer })

    expect(edit.x).toBeLessThanOrEqual(1)
    expect(edit.scale).toBeGreaterThan(near.scale)
    // The left side stays where it was.
    expect(edit.x - after.width / 2).toBeCloseTo(leftBefore, 4)
  })

  test('every resize keeps to one range', async () => {
    const { LAYER_SCALE_RANGE: twoFinger } = await import('./two-finger')
    const { TRANSFORM_FIELDS } = await import('./transform-fields')
    expect(twoFinger).toBe(LAYER_SCALE_RANGE)
    for (const key of ['scale', 'width', 'height'] as const) {
      expect([TRANSFORM_FIELDS[key].min, TRANSFORM_FIELDS[key].max]).toEqual([LAYER_SCALE_RANGE.min * 100, LAYER_SCALE_RANGE.max * 100])
    }
  })
})
