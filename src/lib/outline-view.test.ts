import { describe, expect, test } from 'vitest'

import { type DesignDocument, type PatternLayer, createEmptyDocument } from './design-document'
import { outlineViewDocument } from './outline-view'
import { ringOffsets } from './panel-shape'
import { SELECTION_COLOR } from './selection-chrome'

// Tester, 22 Nov: on a patterned dress the garment's shape was hard to see
// while drawing; Hide print shows the shape and the marks, not the print.
const pattern = ({ id, visible = true }: { id: string; visible?: boolean }): PatternLayer => ({
  id,
  kind: 'pattern',
  patternId: 'stripe',
  panel: 'front',
  color: '#111111',
  x: 0.5,
  y: 0.5,
  scale: 1.05,
  rotation: 0,
  opacity: 1,
  visible,
})

const withLayers = (layers: DesignDocument['layers']): DesignDocument => ({
  ...createEmptyDocument({ garmentId: 'tee' }),
  layers,
})

describe('the Hide print view', () => {
  test('leaves out the garment’s own pattern and keeps what was drawn', () => {
    const document = withLayers([pattern({ id: 'base-fill-front' }), pattern({ id: 'placed-stripes' })])
    const view = outlineViewDocument({ document })

    expect(view.layers.map((layer) => [layer.id, layer.visible])).toEqual([
      ['base-fill-front', false],
      ['placed-stripes', true],
    ])
    // A view only: the design itself is untouched.
    expect(document.layers[0]!.visible).toBe(true)
  })

  test('a design with no visible base pattern is the same document', () => {
    const document = withLayers([pattern({ id: 'base-fill', visible: false }), pattern({ id: 'placed' })])
    expect(outlineViewDocument({ document })).toBe(document)
  })
})

describe('the side outline', () => {
  test('grows a line in every direction by its width', () => {
    const offsets = ringOffsets({ lineWidth: 2 })

    expect(offsets).toContainEqual([0, 0])
    expect(offsets).toContainEqual([2, 0])
    expect(offsets).toContainEqual([-2, 0])
    expect(offsets).toContainEqual([0, 2])
    expect(offsets).toContainEqual([0, -2])
    expect(offsets.every(([x, y]) => Math.hypot(x, y) <= 2 * Math.SQRT2)).toBe(true)
  })

  test('selection uses the house accent', () => {
    expect(SELECTION_COLOR).toBe('#e0141f')
  })
})
