import { beforeEach, describe, expect, test } from 'vitest'

import { CANONICAL_LIMITS } from './canonical-document'
import { getCanonicalDocument, useEditorStore } from './editor-store'

/**
 * E09 #160: grouped undo/redo on the tee. One brush stroke, one drag and
 * one text edit session are each a single step; at least 50 steps undo;
 * a new command clears redo.
 */

const store = () => useEditorStore.getState()
const snapshot = () => JSON.stringify(getCanonicalDocument())

function brushStroke({ y }: { y: number }) {
  store().startStroke({ panel: 'front', point: { x: 0.1, y } })

  for (let index = 1; index <= 24; index += 1) {
    store().appendStroke({ point: { x: 0.1 + index * 0.03, y } })
  }

  store().endStroke()
}

function drag({ layerId, to }: { layerId: string; to: number }) {
  const start = { layerId, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 }
  store().startLayerEdit({ edit: start })

  for (let index = 1; index <= 12; index += 1) {
    store().moveLayerEdit({ edit: { ...start, x: 0.5 + ((to - 0.5) * index) / 12 } })
  }

  store().endLayerEdit()
}

/** The canvas word editor commits once on blur, however many keys were typed. */
function textEditSession({ layerId, word }: { layerId: string; word: string }) {
  store().updateLayer({ layerId, patch: { content: word } })
}

describe('grouped undo and redo on the tee (E09 #160)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('a brush stroke, a drag and a text edit session are one step each', () => {
    brushStroke({ y: 0.3 })
    expect(store().undoCount).toBe(1)

    store().addGraphic({ src: '/graphics/cross-simple.svg' })
    const mark = store().selectedLayerId!
    drag({ layerId: mark, to: 0.7 })
    expect(store().undoCount).toBe(3)

    store().addText({ content: 'A' })
    const word = store().selectedLayerId!
    textEditSession({ layerId: word, word: 'ATELIER' })
    expect(store().undoCount).toBe(5)

    store().undoLast()
    expect(store().document.layers.find((layer) => layer.id === word)).toMatchObject({ content: 'A' })
    store().undoLast()
    store().undoLast()
    expect(store().document.layers.find((layer) => layer.id === mark)).toMatchObject({ x: 0.5 })
    store().undoLast()
    store().undoLast()
    expect(store().document.layers.flatMap((layer) => (layer.kind === 'paint' ? layer.strokes : []))).toEqual([])
    expect(store().undoCount).toBe(0)
  })

  test('50 grouped commands undo back to empty and redo forward again', () => {
    const empty = snapshot()
    const states: string[] = [empty]
    let mark = ''
    let word = ''

    for (let step = 0; states.length <= 50; step += 1) {
      const kind = step % 5

      if (kind === 0) {
        brushStroke({ y: 0.1 + (step % 40) * 0.02 })
      } else if (kind === 1 || !mark) {
        store().addGraphic({ src: '/graphics/cross-simple.svg' })
        mark = store().selectedLayerId!
      } else if (kind === 2) {
        drag({ layerId: mark, to: 0.2 + (step % 3) * 0.1 })
      } else if (kind === 3 || !word) {
        store().addText({ content: `W${step}` })
        word = store().selectedLayerId!
      } else {
        textEditSession({ layerId: word, word: `EDIT ${step}` })
      }

      states.push(snapshot())
      expect(store().undoCount).toBe(states.length - 1)
    }

    expect(store().undoCount).toBe(50)

    for (let index = states.length - 2; index >= 0; index -= 1) {
      store().undoLast()
      expect(snapshot()).toBe(states[index])
    }

    expect(store()).toMatchObject({ undoCount: 0, redoCount: 50 })
    expect(store().canUndo()).toBe(false)

    for (let index = 1; index < states.length; index += 1) {
      store().redoLast()
      expect(snapshot()).toBe(states[index])
    }

    expect(store()).toMatchObject({ undoCount: 50, redoCount: 0 })
  })

  test('a new command after undo clears redo', () => {
    brushStroke({ y: 0.3 })
    brushStroke({ y: 0.5 })
    store().undoLast()
    expect(store().redoCount).toBe(1)

    store().addText({ content: 'NEW' })

    expect(store()).toMatchObject({ undoCount: 2, redoCount: 0 })
    expect(store().canRedo()).toBe(false)
    const before = snapshot()
    store().redoLast()
    expect(snapshot()).toBe(before)
  })

  test('a refused or no-op command keeps redo', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg' })
    const mark = store().selectedLayerId!
    store().addText({ content: 'KEEP' })
    const word = store().selectedLayerId!
    brushStroke({ y: 0.3 })
    store().undoLast()
    expect(store().redoCount).toBe(1)

    store().updateLayer({ layerId: word, patch: { content: 'x'.repeat(CANONICAL_LIMITS.textLength + 1) } })
    expect(store().limitNotice).not.toBeNull()
    store().startLayerEdit({ edit: { layerId: mark, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 } })
    store().endLayerEdit()

    expect(store()).toMatchObject({ undoCount: 2, redoCount: 1 })
  })

  test('a drag cancelled by undo mid-gesture leaves no extra step', () => {
    store().addGraphic({ src: '/graphics/cross-simple.svg' })
    const mark = store().selectedLayerId!
    store().startLayerEdit({ edit: { layerId: mark, x: 0.5, y: 0.48, scale: 0.28, rotation: 0 } })
    store().moveLayerEdit({ edit: { layerId: mark, x: 0.9, y: 0.48, scale: 0.28, rotation: 0 } })

    store().undoLast()
    store().endLayerEdit()

    expect(store()).toMatchObject({ undoCount: 0, redoCount: 1, activeLayerEdit: null })
    expect(getCanonicalDocument().panels.front.layers).toEqual([])
  })
})
