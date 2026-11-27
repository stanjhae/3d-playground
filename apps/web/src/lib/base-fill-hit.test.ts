import { describe, expect, test } from 'vitest'

import { type DesignDocument, type PatternLayer, createEmptyDocument } from './design-document'
import { hitPlaceableLayer, isBaseFill, movableOnSurface } from './layer-hit'

// Tester pass 2: on a striped garment, Draw dragged the stripes instead of
// drawing, Undo stayed off, and hiding the stripes didn't help.
const stripe = ({ id, visible = true }: { id: string; visible?: boolean }): PatternLayer => ({
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

describe('the garment base pattern on the surface', () => {
  test('a press on a striped garment never picks the base stripes', () => {
    const document = withLayers([stripe({ id: 'base-fill-front' })])

    expect(hitPlaceableLayer({ document, panel: 'front', x: 0.5, y: 0.5, withLocked: true })).toBeNull()
  })

  test('a placed pattern (not the base) can still be picked', () => {
    const document = withLayers([stripe({ id: 'pattern-1' })])

    expect(hitPlaceableLayer({ document, panel: 'front', x: 0.5, y: 0.5 })?.id).toBe('pattern-1')
  })

  test('a selected base stripe or hidden layer offers no handles', () => {
    expect(isBaseFill({ layer: { id: 'base-fill-front' } })).toBe(true)
    expect(isBaseFill({ layer: { id: 'base-fill' } })).toBe(true)
    expect(isBaseFill({ layer: { id: 'graphic-1' } })).toBe(false)
    expect(movableOnSurface({ layer: stripe({ id: 'base-fill-front' }) })).toBe(false)
    expect(movableOnSurface({ layer: stripe({ id: 'pattern-1', visible: false }) })).toBe(false)
    expect(movableOnSurface({ layer: stripe({ id: 'pattern-1' }) })).toBe(true)
  })
})
