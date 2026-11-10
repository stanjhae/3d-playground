import { beforeEach, describe, expect, test } from 'vitest'

import { CANONICAL_LIMITS, validateCanonicalDocument } from './canonical-document'
import { COPY_OFFSET, getCanonicalDocument, hasCopiedLayer, useEditorStore } from './editor-store'

/** A3: duplicate steps aside, copy and paste within a session, Esc drops a stroke. */

const store = () => useEditorStore.getState()
const GRAPHIC = '/graphics/cross-simple.svg'

function placed() {
  return store().document.layers.filter((layer) => layer.kind === 'graphic' || layer.kind === 'text')
}

function selected() {
  return store().document.layers.find((layer) => layer.id === store().selectedLayerId)
}

function at({ x, y }: { x: number; y: number }) {
  store().updateLayer({ layerId: store().selectedLayerId!, patch: { x, y } })
}

function position() {
  const layer = selected()
  return layer && 'x' in layer ? { x: layer.x, y: layer.y } : null
}

function close({ x, y }: { x: number; y: number }) {
  const now = position()!
  expect(now.x).toBeCloseTo(x, 6)
  expect(now.y).toBeCloseTo(y, 6)
}

describe('duplicate, copy and paste (A3)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('a duplicate lands down and to the right of its original, selected, as one undo step', () => {
    store().addGraphic({ src: GRAPHIC })
    at({ x: 0.5, y: 0.5 })
    const original = store().selectedLayerId!
    const undoCount = store().undoCount

    store().duplicateLayer({ layerId: original })

    expect(placed()).toHaveLength(2)
    expect(store().selectedLayerId).not.toBe(original)
    // Panel y runs bottom-up: down is a smaller y.
    close({ x: 0.5 + COPY_OFFSET, y: 0.5 - COPY_OFFSET })
    expect(store().undoCount).toBe(undoCount + 1)

    store().undoLast()
    expect(placed()).toHaveLength(1)
  })

  test('near an edge the duplicate steps the other way, so it stays on the panel', () => {
    store().addGraphic({ src: GRAPHIC })
    at({ x: 0.99, y: 0.01 })

    store().duplicateLayer({ layerId: store().selectedLayerId! })

    close({ x: 0.99 - COPY_OFFSET, y: 0.01 + COPY_OFFSET })
  })

  test('paste copies what was copied, not later edits, and steps on from each paste', () => {
    store().addText({ content: 'ONE' })
    at({ x: 0.4, y: 0.6 })
    const original = store().selectedLayerId!

    expect(hasCopiedLayer()).toBe(false)
    store().copyLayer({ layerId: original })
    expect(hasCopiedLayer()).toBe(true)
    store().updateLayer({ layerId: original, patch: { content: 'CHANGED' } })

    store().pasteLayer()
    const first = selected()
    expect(first?.kind === 'text' ? first.content : null).toBe('ONE')
    close({ x: 0.4 + COPY_OFFSET, y: 0.6 - COPY_OFFSET })

    store().pasteLayer()
    close({ x: 0.4 + 2 * COPY_OFFSET, y: 0.6 - 2 * COPY_OFFSET })
    expect(placed()).toHaveLength(3)
    expect(validateCanonicalDocument({ value: getCanonicalDocument() }).ok).toBe(true)
  })

  test('paste onto another side keeps the place it had', () => {
    store().addGraphic({ src: GRAPHIC })
    at({ x: 0.3, y: 0.7 })
    store().copyLayer({ layerId: store().selectedLayerId! })

    store().setPaintPanel({ paintPanel: 'back' })
    store().pasteLayer()

    const pasted = selected()
    expect(pasted?.kind === 'graphic' ? pasted.panel : null).toBe('back')
    close({ x: 0.3, y: 0.7 })
    expect(getCanonicalDocument().panels.back.layers).toHaveLength(1)
  })

  test('paste is refused with the limit message on a full panel', () => {
    for (let index = 0; index < CANONICAL_LIMITS.layersPerPanel; index += 1) {
      store().addGraphic({ src: GRAPHIC })
    }

    store().copyLayer({ layerId: store().selectedLayerId! })
    store().pasteLayer()

    expect(getCanonicalDocument().panels.front.layers).toHaveLength(CANONICAL_LIMITS.layersPerPanel)
    expect(store().limitNotice).toContain('Delete one to add more')
  })
})

describe('Esc drops a stroke (A3)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('a discarded pen stroke saves nothing, and the lift that follows does nothing', () => {
    const { revision, undoCount } = store()

    store().startStroke({ panel: 'front', point: { x: 0.2, y: 0.2 }, pressure: 0.5 })
    store().appendStroke({ point: { x: 0.6, y: 0.6 }, pressure: 0.5 })
    store().discardStroke()

    expect(store().activeStroke).toBeNull()
    store().appendStroke({ point: { x: 0.7, y: 0.7 } })
    store().endStroke()

    expect(store()).toMatchObject({ revision, undoCount, activeStroke: null })
    expect(getCanonicalDocument().panels.front.layers).toHaveLength(0)
  })
})
