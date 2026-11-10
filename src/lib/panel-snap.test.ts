import { describe, expect, test } from 'vitest'

import { type DesignDocument, createEmptyDocument } from './design-document'
import { SNAP_ROTATION, chestLineY, snapMove, snapRotation, snapTargets } from './panel-snap'

const mark = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'graphic' as const,
  panel: 'front' as const,
  src: 'src:one',
  x: 0.3,
  y: 0.4,
  scale: 0.2,
  rotation: 0,
  opacity: 1,
  visible: true,
  ...extra,
})
const withLayers = (layers: unknown[]) => ({ ...createEmptyDocument({ garmentId: 'tee' }), layers }) as DesignDocument

describe('snap targets', () => {
  test('the centre line, the chest line and the other visible items on the panel', () => {
    const document = withLayers([
      mark('moving'),
      mark('other', { x: 0.7, y: 0.2 }),
      mark('hidden', { x: 0.1, y: 0.1, visible: false }),
      mark('back', { panel: 'back', x: 0.9, y: 0.9 }),
    ])
    const chest = chestLineY({ panel: 'front' })!

    expect(chest).toBeGreaterThan(0.5)
    expect(snapTargets({ document, panel: 'front', layerId: 'moving' })).toEqual({ xs: [0.5, 0.7], ys: [chest, 0.2] })
  })

  test('sleeves and concept garments have no chest line', () => {
    const document = withLayers([mark('moving', { panel: 'left' })])
    expect(snapTargets({ document, panel: 'left', layerId: 'moving' })).toEqual({ xs: [0.5], ys: [] })
    expect(snapTargets({ document, panel: 'front', layerId: 'moving', withChest: false })).toEqual({ xs: [0.5], ys: [] })
  })
})

describe('snapping a move', () => {
  const targets = { xs: [0.5, 0.7], ys: [0.62] }

  test('pulls to the nearest target within reach and says where', () => {
    expect(snapMove({ x: 0.51, y: 0.6, targets, withinX: 0.02, withinY: 0.03 })).toEqual({
      x: 0.5,
      y: 0.62,
      guides: [
        { axis: 'x', value: 0.5 },
        { axis: 'y', value: 0.62 },
      ],
    })
  })

  test('leaves a centre alone when nothing is near', () => {
    expect(snapMove({ x: 0.6, y: 0.4, targets, withinX: 0.02, withinY: 0.02 })).toEqual({ x: 0.6, y: 0.4, guides: [] })
  })

  test('picks the closer of two targets', () => {
    expect(snapMove({ x: 0.69, y: 0.4, targets: { xs: [0.66, 0.7], ys: [] }, withinX: 0.05, withinY: 0.01 }).x).toBe(0.7)
  })
})

describe('snapping a rotation', () => {
  test('to a quarter turn when close, not otherwise', () => {
    expect(snapRotation({ rotation: 0.03 })).toBe(0)
    expect(snapRotation({ rotation: Math.PI / 2 - 0.05 })).toBeCloseTo(Math.PI / 2, 10)
    expect(snapRotation({ rotation: -Math.PI + 0.02 })).toBeCloseTo(-Math.PI, 10)
    expect(snapRotation({ rotation: SNAP_ROTATION * 2 })).toBe(SNAP_ROTATION * 2)
  })
})
