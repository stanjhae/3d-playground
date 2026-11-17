import { beforeEach, describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack, findLayer, undoCanonical } from './canonical-commands'
import { createEmptyCanonicalDocument } from './canonical-document'
import { getCanonicalDocument, useEditorStore } from './editor-store'
import { LIMIT_MAX } from './editor-canonical'

/**
 * Moving a placed item to another panel (S-B drag-and-drop): a canonical
 * command, a store action, and a drag that crosses a seam on the cloth, each
 * one undo step. The document keeps its shape.
 */

const store = () => useEditorStore.getState()

const word = (id: string) => ({
  id,
  kind: 'text' as const,
  visible: true,
  opacity: 1,
  x: 0.25,
  y: 0.6,
  scale: 0.12,
  rotation: 0,
  content: 'FLP',
  face: 'display' as const,
  color: '#c4a15a' as const,
})

function placed(id: string) {
  const layer = store().document.layers.find((entry) => entry.id === id)
  return layer && 'panel' in layer ? layer : null
}

describe('moveLayerToPanel, canonical', () => {
  const start = () => {
    const added = applyCanonicalCommand({
      stack: createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      command: { type: 'addLayer', panel: 'front', layer: word('w1') },
    })
    return added.stack
  }

  test('moves the layer onto the top of the other panel, keeping its fields, as one step', () => {
    const stack = start()
    const moved = applyCanonicalCommand({ stack, command: { type: 'moveLayerToPanel', layerId: 'w1', panel: 'left' } })

    expect(moved.ok && moved.changed).toBe(true)
    expect(moved.stack.document.panels.front.layers).toEqual([])
    expect(findLayer({ document: moved.stack.document, layerId: 'w1' })).toMatchObject({
      panel: 'left',
      layer: { x: 0.25, y: 0.6, content: 'FLP' },
    })
    expect(moved.stack.past).toHaveLength(stack.past.length + 1)
    expect(undoCanonical({ stack: moved.stack }).document).toEqual(stack.document)
  })

  test('the same panel changes nothing; ink, missing and locked layers are refused', () => {
    const stack = start()
    const same = applyCanonicalCommand({ stack, command: { type: 'moveLayerToPanel', layerId: 'w1', panel: 'front' } })
    expect(same).toMatchObject({ ok: true, changed: false })

    expect(applyCanonicalCommand({ stack, command: { type: 'moveLayerToPanel', layerId: 'nope', panel: 'back' } }).ok).toBe(false)

    const inked = applyCanonicalCommand({
      stack,
      command: {
        type: 'addStroke',
        panel: 'front',
        layerId: 'p1',
        stroke: { id: 's1', tool: 'brush', color: '#1a1c22', width: 0.02, opacity: 1, points: [0.2, 0.2, 0.3, 0.3] },
      },
    }).stack
    expect(applyCanonicalCommand({ stack: inked, command: { type: 'moveLayerToPanel', layerId: 'p1', panel: 'back' } }).ok).toBe(false)

    const locked = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'w1', patch: { locked: true } } }).stack
    expect(applyCanonicalCommand({ stack: locked, command: { type: 'moveLayerToPanel', layerId: 'w1', panel: 'back' } }).ok).toBe(false)
  })
})

describe('moveLayerToPanel, in the store', () => {
  beforeEach(() => {
    store().reset()
  })

  test('moves a graphic to a sleeve at the given place, and one undo puts it back', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'front' })
    const id = store().selectedLayerId!
    const before = JSON.stringify(getCanonicalDocument())
    const undos = store().undoCount

    store().moveLayerToPanel({ layerId: id, panel: 'left', x: 0.3, y: 0.7 })

    expect(placed(id)).toMatchObject({ panel: 'left', x: 0.3, y: 0.7 })
    expect(store().selectedLayerId).toBe(id)
    expect(store().paintPanel).toBe('left')
    expect(store().undoCount).toBe(undos + 1)

    store().undoLast()
    expect(JSON.stringify(getCanonicalDocument())).toBe(before)
    expect(placed(id)).toMatchObject({ panel: 'front' })

    store().redoLast()
    expect(placed(id)).toMatchObject({ panel: 'left', x: 0.3, y: 0.7 })
  })

  test('a mirrored panel gets the place as shown, not as stored', () => {
    store().addText({ content: 'BACK', panel: 'front', x: 0.2, y: 0.5 })
    const id = store().selectedLayerId!

    store().moveLayerToPanel({ layerId: id, panel: 'back', x: 0.2, y: 0.5 })

    // The render document shows x as asked; the canonical back stores it mirrored.
    expect(placed(id)?.panel).toBe('back')
    expect(placed(id)?.x).toBeCloseTo(0.2)
    const stored = findLayer({ document: getCanonicalDocument(), layerId: id })
    expect(stored?.panel).toBe('back')
    expect(stored?.layer.kind === 'text' ? stored.layer.x : null).toBeCloseTo(0.8)
  })

  test('a locked item stays where it is', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'front' })
    const id = store().selectedLayerId!
    store().updateLayer({ layerId: id, patch: { locked: true } })
    const undos = store().undoCount

    store().moveLayerToPanel({ layerId: id, panel: 'back' })

    expect(placed(id)).toMatchObject({ panel: 'front' })
    expect(store().undoCount).toBe(undos)
  })

  test('a full panel refuses the move with a message, and the drag ends', () => {
    for (let index = 0; index < LIMIT_MAX.layers; index += 1) {
      store().addText({ content: `W${index}`, panel: 'left' })
    }

    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'front' })
    const id = store().selectedLayerId!
    store().startLayerEdit({ edit: { layerId: id, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 } })

    store().moveLayerToPanel({ layerId: id, panel: 'left' })

    expect(placed(id)).toMatchObject({ panel: 'front' })
    expect(store().limitNotice).toBeTruthy()
    expect(store().activeLayerEdit).toBeNull()
  })

  test('a drag carried onto another panel commits the move and the place as one undo step', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'front' })
    const id = store().selectedLayerId!
    const start = { layerId: id, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 }
    const undos = store().undoCount

    store().startLayerEdit({ edit: start })
    store().moveLayerEdit({ edit: { ...start, x: 0.8 } })
    store().moveLayerEdit({ edit: { ...start, x: 0.1, y: 0.6, panel: 'left' } })

    // Live, it already shows on the sleeve, measured on the sleeve's surface.
    expect(store().activeLayerEdit).toMatchObject({ panel: 'left' })
    expect(store().activeLayerEdit?.surface).toBeDefined()

    store().moveLayerEdit({ edit: { ...start, x: 0.2, y: 0.6, panel: 'left' } })
    store().endLayerEdit()

    expect(placed(id)).toMatchObject({ panel: 'left', x: 0.2, y: 0.6 })
    expect(store().paintPanel).toBe('left')
    expect(store().undoCount).toBe(undos + 1)

    store().undoLast()
    expect(placed(id)).toMatchObject({ panel: 'front', x: 0.5, y: 0.48 })
  })
})

describe('a drag after undo or redo', () => {
  beforeEach(() => {
    store().reset()
  })

  test('moves made after an undo mid-drag are ignored, so release puts nothing back', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'front' })
    const id = store().selectedLayerId!
    const start = { layerId: id, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 }

    store().startLayerEdit({ edit: start })
    store().moveLayerEdit({ edit: { ...start, x: 0.7 } })
    store().undoLast()

    expect(placed(id)).toBeNull()
    store().moveLayerEdit({ edit: { ...start, x: 0.8 } })
    store().endLayerEdit()

    expect(store().activeLayerEdit).toBeNull()
    expect(placed(id)).toBeNull()
    expect(store().redoCount).toBe(1)
  })

  test('a locked item takes no live move', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'front' })
    const id = store().selectedLayerId!
    const start = { layerId: id, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 }
    store().startLayerEdit({ edit: start })
    store().updateLayer({ layerId: id, patch: { locked: true } })

    store().moveLayerEdit({ edit: { ...start, x: 0.9 } })
    expect(store().activeLayerEdit?.x).not.toBe(0.9)
  })
})
