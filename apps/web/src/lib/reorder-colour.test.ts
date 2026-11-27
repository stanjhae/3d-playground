import { beforeEach, describe, expect, test } from 'vitest'

import { RECENT_LIMIT, normalizeHex, withRecent } from './colour-input'
import { getCanonicalDocument, layerPlacement, useEditorStore } from './editor-store'
import { layerEdgeMessage, layerMovedMessage } from './layer-list'
import { studioKeyAction } from './studio-keys'

/** A5: restacking in one step, and Pro colour entry. */

const store = () => useEditorStore.getState()
const GRAPHIC = '/graphics/cross-simple.svg'

function frontIds() {
  return getCanonicalDocument().panels.front.layers.map((layer) => layer.id)
}

describe('restacking (A5)', () => {
  let ids: string[] = []

  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
    ids = []
    for (let index = 0; index < 4; index += 1) {
      store().addGraphic({ src: GRAPHIC })
      ids.push(store().selectedLayerId!)
    }
  })

  test('to the front and to the back, each one undo step', () => {
    const undoCount = store().undoCount
    store().moveLayer({ layerId: ids[0]!, direction: 'front' })
    expect(frontIds().at(-1)).toBe(ids[0])
    expect(store().undoCount).toBe(undoCount + 1)

    store().moveLayer({ layerId: ids[0]!, direction: 'back' })
    expect(frontIds()[0]).toBe(ids[0])

    store().undoLast()
    expect(frontIds().at(-1)).toBe(ids[0])
  })

  test('a drag puts the item where it was dropped', () => {
    const target = layerPlacement({ layerId: ids[1]! })!.index
    store().moveLayerTo({ layerId: ids[3]!, toIndex: target })
    expect(layerPlacement({ layerId: ids[3]! })!.index).toBe(target)
    expect(frontIds()).toHaveLength(4)
  })

  test('moving to where it already is, or off the stack, changes nothing', () => {
    const { revision, undoCount } = store()
    store().moveLayer({ layerId: ids[3]!, direction: 'front' })
    store().moveLayerTo({ layerId: ids[0]!, toIndex: 99 })
    store().moveLayerTo({ layerId: ids[0]!, toIndex: -1 })
    expect(store()).toMatchObject({ revision, undoCount })
  })

  test('the messages say where it went', () => {
    const placement = { panel: 'front' as const, index: 3, count: 4 }
    expect(layerMovedMessage({ name: 'Mark', direction: 'front', placement, panelLabel: 'Front' })).toBe(
      'Mark moved to the front, 1 of 4 on the front.',
    )
    expect(layerMovedMessage({ name: 'Mark', direction: 'drag', placement, panelLabel: 'Front' })).toBe('Mark moved, 1 of 4 on the front.')
    expect(layerEdgeMessage({ name: 'Mark', direction: 'back' })).toBe('Mark is already at the bottom.')
  })
})

describe('restacking keys (A5)', () => {
  const press = (key: string, extra: Partial<Parameters<typeof studioKeyAction>[0]> = {}) =>
    studioKeyAction({
      key,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      target: null,
      hasSelection: true,
      ...extra,
    } as Parameters<typeof studioKeyAction>[0])

  test('Mod+] and Mod+[ move one place; with Shift, all the way', () => {
    expect(press(']')).toEqual({ type: 'arrange', direction: 'up' })
    expect(press('[')).toEqual({ type: 'arrange', direction: 'down' })
    expect(press('}', { shiftKey: true })).toEqual({ type: 'arrange', direction: 'front' })
    expect(press('{', { shiftKey: true })).toEqual({ type: 'arrange', direction: 'back' })
  })

  test('without a selection they keep the browser meaning', () => {
    expect(press(']', { hasSelection: false })).toBeNull()
  })
})

describe('colour entry (A5)', () => {
  test('hex in any usual form becomes #rrggbb', () => {
    expect(normalizeHex({ text: '#C4A15A' })).toBe('#c4a15a')
    expect(normalizeHex({ text: ' c4a15a ' })).toBe('#c4a15a')
    expect(normalizeHex({ text: '#fa0' })).toBe('#ffaa00')
    expect(normalizeHex({ text: 'red' })).toBeNull()
    expect(normalizeHex({ text: '#c4a15' })).toBeNull()
    expect(normalizeHex({ text: '#c4a15a80' })).toBeNull()
  })

  test('recents put the newest first, without repeats, up to the limit', () => {
    let recents: string[] = []
    for (let index = 0; index < RECENT_LIMIT + 2; index += 1) {
      recents = withRecent({ recents, color: `#00000${index}` })
    }
    expect(recents).toHaveLength(RECENT_LIMIT)
    expect(recents[0]).toBe(`#00000${RECENT_LIMIT + 1}`)

    recents = withRecent({ recents, color: '#000003' })
    expect(recents[0]).toBe('#000003')
    expect(recents.filter((color) => color === '#000003')).toHaveLength(1)
    expect(withRecent({ recents, color: 'nope' })).toBe(recents)
  })
})
