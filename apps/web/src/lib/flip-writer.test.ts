import { beforeEach, describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import { createEmptyCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { applyCommand, createCommandStack } from './design-commands'
import { createEmptyDocument } from './design-document'
import { getCanonicalDocument, useEditorStore } from './editor-store'

/** W1: the inspector writes the flips R1 taught every build to read. */

const store = () => useEditorStore.getState()
const GRAPHIC = '/graphics/cross-simple.svg'

function stored() {
  const id = store().selectedLayerId!
  const document = getCanonicalDocument()
  const panel = Object.values(document.panels).find((entry) => entry.layers.some((layer) => layer.id === id))!
  return panel.layers.find((layer) => layer.id === id) as Record<string, unknown>
}

function rendered() {
  return store().document.layers.find((layer) => layer.id === store().selectedLayerId) as Record<string, unknown>
}

describe('flipping on the tee', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('an item that was never flipped stores no flip at all', () => {
    store().addGraphic({ src: GRAPHIC })
    expect(stored()).not.toHaveProperty('flipX')
    expect(stored()).not.toHaveProperty('flipY')
    expect(serializeCanonicalDocument({ document: getCanonicalDocument() })).not.toContain('flip')
  })

  test('flipping stores the flag, draws it, and undoes as one step', () => {
    store().addGraphic({ src: GRAPHIC })
    const before = serializeCanonicalDocument({ document: getCanonicalDocument() })
    const undoCount = store().undoCount

    store().updateLayer({ layerId: store().selectedLayerId!, patch: { flipX: true } })

    expect(stored().flipX).toBe(true)
    expect(stored()).not.toHaveProperty('flipY')
    expect(rendered().flipX).toBe(true)
    expect(store().undoCount).toBe(undoCount + 1)
    expect(validateCanonicalDocument({ value: getCanonicalDocument() }).ok).toBe(true)

    store().undoLast()
    expect(serializeCanonicalDocument({ document: getCanonicalDocument() })).toBe(before)
  })

  test('flipping back removes the flag, so the design is as it was', () => {
    store().addText({ content: 'FLP' })
    const before = serializeCanonicalDocument({ document: getCanonicalDocument() })

    store().updateLayer({ layerId: store().selectedLayerId!, patch: { flipY: true } })
    expect(stored().flipY).toBe(true)
    store().updateLayer({ layerId: store().selectedLayerId!, patch: { flipY: false } })

    expect(stored()).not.toHaveProperty('flipY')
    expect(serializeCanonicalDocument({ document: getCanonicalDocument() })).toBe(before)
  })

  test('asking for the flip an item already has changes nothing', () => {
    store().addGraphic({ src: GRAPHIC })
    const { revision, undoCount } = store()
    store().updateLayer({ layerId: store().selectedLayerId!, patch: { flipX: false } })
    expect(store()).toMatchObject({ revision, undoCount })
  })

  test('a flip on the back is kept as chosen, not mirrored with the panel', () => {
    store().setPaintPanel({ paintPanel: 'back' })
    store().addGraphic({ src: GRAPHIC })
    store().updateLayer({ layerId: store().selectedLayerId!, patch: { flipX: true } })
    expect(stored().flipX).toBe(true)
    expect(rendered().flipX).toBe(true)
    expect(rendered().panel).toBe('back')
  })

  test('duplicates and copies to the other side keep their flips', () => {
    store().addGraphic({ src: GRAPHIC })
    const original = store().selectedLayerId!
    store().updateLayer({ layerId: original, patch: { flipX: true, flipY: true } })

    store().duplicateLayer({ layerId: original })
    expect(store().selectedLayerId).not.toBe(original)
    expect(stored()).toMatchObject({ flipX: true, flipY: true })

    store().copyLayerToOpposite({ layerId: original })
    const back = getCanonicalDocument().panels.back.layers
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ flipX: true, flipY: true })
  })
})

describe('the commands underneath', () => {
  test('paint layers cannot be flipped', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers = [{ id: 'paint', kind: 'paint', visible: true, opacity: 1, strokes: [] }]
    const result = applyCanonicalCommand({
      stack: createCanonicalStack({ document }),
      command: { type: 'updateLayer', layerId: 'paint', patch: { flipX: true } },
    })
    expect(result.ok).toBe(false)
  })

  test('concept garments flip and unflip the same way', () => {
    const graphic = {
      id: 'mark',
      kind: 'graphic' as const,
      panel: 'front' as const,
      src: GRAPHIC,
      x: 0.5,
      y: 0.5,
      scale: 0.2,
      rotation: 0,
      opacity: 1,
      visible: true,
    }
    const stack = createCommandStack({ document: { ...createEmptyDocument({ garmentId: 'tee' }), layers: [graphic] } })
    const flipped = applyCommand({ stack, command: { type: 'updateLayer', layerId: 'mark', patch: { flipY: true } } })
    expect(flipped.document.layers[0]).toMatchObject({ flipY: true })

    const back = applyCommand({ stack: flipped, command: { type: 'updateLayer', layerId: 'mark', patch: { flipY: false } } })
    expect(back.document.layers[0]).not.toHaveProperty('flipY')
  })
})
