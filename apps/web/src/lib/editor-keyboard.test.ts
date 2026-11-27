import { beforeEach, describe, expect, test } from 'vitest'

import { getCanonicalDocument, layerPlacement, useEditorStore } from './editor-store'
import { NUDGE_MERGE_MS, NUDGE_STEP } from './studio-keys'

/** Keyboard nudges (#163) and layer reordering (#157) on the tee's canonical stack. */

const store = () => useEditorStore.getState()
const frontIds = () => getCanonicalDocument().panels.front.layers.map((layer) => layer.id)
const placed = (layerId: string) => {
  const layer = store().document.layers.find((entry) => entry.id === layerId)
  return layer && 'x' in layer ? { x: layer.x, y: layer.y } : null
}

describe('keyboard nudge (#163)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('a nudge is one undo step', () => {
    store().addText({ content: 'NUDGE' })
    const word = store().selectedLayerId!
    const start = placed(word)!
    const steps = store().undoCount

    store().nudgeLayer({ layerId: word, dx: NUDGE_STEP, dy: 0, now: 1_000 })
    expect(store().undoCount).toBe(steps + 1)
    expect(placed(word)!.x).toBeCloseTo(start.x + NUDGE_STEP)

    store().undoLast()
    expect(placed(word)!.x).toBeCloseTo(start.x)
    expect(store().undoCount).toBe(steps)
  })

  test('quick nudges of one object merge into one step; a pause starts another', () => {
    store().addText({ content: 'HOLD' })
    const word = store().selectedLayerId!
    const start = placed(word)!
    const steps = store().undoCount

    for (let index = 0; index < 5; index += 1) {
      store().nudgeLayer({ layerId: word, dx: 0, dy: NUDGE_STEP, now: 1_000 + index * 50 })
    }

    expect(store().undoCount).toBe(steps + 1)
    expect(placed(word)!.y).toBeCloseTo(start.y + 5 * NUDGE_STEP)

    store().nudgeLayer({ layerId: word, dx: 0, dy: NUDGE_STEP, now: 1_200 + NUDGE_MERGE_MS })
    expect(store().undoCount).toBe(steps + 2)

    store().undoLast()
    expect(placed(word)!.y).toBeCloseTo(start.y + 5 * NUDGE_STEP)
    store().undoLast()
    expect(placed(word)!.y).toBeCloseTo(start.y)
    expect(store().selectedLayerId).toBe(word)
  })

  test('a nudge after an undo does not merge into the undone step', () => {
    store().addText({ content: 'A' })
    const word = store().selectedLayerId!
    const start = placed(word)!

    store().nudgeLayer({ layerId: word, dx: NUDGE_STEP, dy: 0, now: 1_000 })
    store().undoLast()
    store().nudgeLayer({ layerId: word, dx: -NUDGE_STEP, dy: 0, now: 1_010 })
    store().undoLast()
    expect(placed(word)!.x).toBeCloseTo(start.x)
  })

  test('nudges stop at the panel edge without adding steps', () => {
    store().addText({ content: 'EDGE', x: 1, y: 0.5 })
    const word = store().selectedLayerId!
    const steps = store().undoCount

    store().nudgeLayer({ layerId: word, dx: NUDGE_STEP, dy: 0, now: 1_000 })
    expect(store().undoCount).toBe(steps)
  })
})

describe('layer reorder (#157)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('moves a layer up and down within its panel as one undo step each', () => {
    store().addText({ content: 'ONE' })
    const one = store().selectedLayerId!
    store().addText({ content: 'TWO' })
    const two = store().selectedLayerId!
    const order = frontIds()
    expect(order.indexOf(one)).toBeLessThan(order.indexOf(two))

    const steps = store().undoCount
    store().moveLayer({ layerId: one, direction: 'up' })
    expect(frontIds().indexOf(one)).toBeGreaterThan(frontIds().indexOf(two))
    expect(store().undoCount).toBe(steps + 1)
    expect(layerPlacement({ layerId: one })).toMatchObject({ panel: 'front', index: order.length - 1 })

    store().undoLast()
    expect(frontIds()).toEqual(order)

    store().moveLayer({ layerId: two, direction: 'down' })
    expect(frontIds().indexOf(two)).toBeLessThan(frontIds().indexOf(one))
  })

  test('does nothing past the top or bottom', () => {
    store().addText({ content: 'SOLO' })
    const solo = store().selectedLayerId!
    const placement = layerPlacement({ layerId: solo })!
    const steps = store().undoCount

    store().moveLayer({ layerId: solo, direction: placement.index === placement.count - 1 ? 'up' : 'down' })
    expect(store().undoCount).toBe(steps)
  })
})
