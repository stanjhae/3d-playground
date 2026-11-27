import { describe, expect, test } from 'vitest'

import type { DesignLayer } from './design-document'
import {
  focusAfterDelete,
  hiddenLayerIds,
  hideOthersIds,
  LAYER_NAME_MAX,
  layersVisibilityMessage,
  renamedLayer,
  layerDeletedMessage,
  layerEdgeMessage,
  layerListGroups,
  layerMovedMessage,
  visibilityToggleLabel,
} from './layer-list'

const panels = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
] as const

function word(id: string, panel: 'front' | 'back', content = id): DesignLayer {
  return {
    id,
    kind: 'text',
    panel,
    content,
    face: 'display',
    color: '#000000',
    x: 0.5,
    y: 0.5,
    scale: 0.3,
    rotation: 0,
    opacity: 1,
    visible: true,
  }
}

const stack: Record<string, { panel: 'front' | 'back'; index: number; count: number }> = {
  a: { panel: 'front', index: 0, count: 3 },
  b: { panel: 'front', index: 1, count: 3 },
  c: { panel: 'front', index: 2, count: 3 },
  d: { panel: 'back', index: 0, count: 1 },
}

describe('layerListGroups (#157)', () => {
  const groups = layerListGroups({
    layers: [word('a', 'front'), word('b', 'front'), word('c', 'front'), word('d', 'back')],
    panels,
    placement: ({ layerId }) => stack[layerId] ?? null,
  })

  test('groups by panel, top layer first', () => {
    expect(groups.map((group) => group.label)).toEqual(['Front', 'Back'])
    expect(groups[0]!.rows.map((row) => row.layer.id)).toEqual(['c', 'b', 'a'])
  })

  test('only offers moves that stay inside the panel', () => {
    const [top, middle, bottom] = groups[0]!.rows
    expect([top!.canMoveUp, top!.canMoveDown]).toEqual([false, true])
    expect([middle!.canMoveUp, middle!.canMoveDown]).toEqual([true, true])
    expect([bottom!.canMoveUp, bottom!.canMoveDown]).toEqual([true, false])
    expect([groups[1]!.rows[0]!.canMoveUp, groups[1]!.rows[0]!.canMoveDown]).toEqual([false, false])
  })

  test('names rows by the layer voice', () => {
    const named = layerListGroups({
      layers: [word('w', 'front', 'HELLO')],
      panels,
      placement: () => null,
    })
    expect(named[0]!.rows[0]!.name).toBe('HELLO')
    expect(named[0]!.rows[0]!.canMoveUp).toBe(false)
  })
})

describe('layer announcements (#157)', () => {
  test('a move says where the layer now is, counted from the top', () => {
    expect(
      layerMovedMessage({
        name: 'HELLO',
        direction: 'up',
        placement: { panel: 'front', index: 2, count: 3 },
        panelLabel: 'Front',
      }),
    ).toBe('HELLO moved up, 1 of 3 on the front.')
    expect(layerEdgeMessage({ name: 'HELLO', direction: 'down' })).toBe('HELLO is already at the bottom.')
    expect(layerDeletedMessage({ name: 'Mark' })).toContain('Mark deleted')
  })
})

describe('focusAfterDelete', () => {
  test('focuses the row that took its place, else the one above, else nothing', () => {
    expect(focusAfterDelete({ orderedIds: ['a', 'b', 'c'], deletedId: 'b' })).toBe('c')
    expect(focusAfterDelete({ orderedIds: ['a', 'b', 'c'], deletedId: 'c' })).toBe('b')
    expect(focusAfterDelete({ orderedIds: ['a'], deletedId: 'a' })).toBeNull()
  })
})

describe('Hide others and Unhide all', () => {
  const hiddenWord = { ...word('b', 'front'), visible: false } as DesignLayer
  const groups = layerListGroups({
    layers: [word('a', 'front'), hiddenWord, word('c', 'front'), word('d', 'back')],
    panels,
    placement: ({ layerId }) => stack[layerId] ?? null,
  })

  test('hides every other visible layer, on every panel', () => {
    expect(hideOthersIds({ groups, keepId: 'c' }).sort()).toEqual(['a', 'd'])
  })

  test('shows every hidden layer', () => {
    expect(hiddenLayerIds({ groups })).toEqual(['b'])
  })

  test('says how many changed', () => {
    expect(layersVisibilityMessage({ count: 1, visible: false })).toBe('1 layer hidden.')
    expect(layersVisibilityMessage({ count: 3, visible: true })).toBe('3 layers shown.')
  })
})

describe('renamedLayer', () => {
  test('trims and keeps at most the length the document stores', () => {
    expect(renamedLayer({ draft: '  Logo  ', current: 'Mark' })).toBe('Logo')
    expect(renamedLayer({ draft: 'x'.repeat(60), current: 'Mark' })).toHaveLength(LAYER_NAME_MAX)
  })

  test('saves nothing for an empty or unchanged name', () => {
    expect(renamedLayer({ draft: '   ', current: 'Mark' })).toBeNull()
    expect(renamedLayer({ draft: 'Mark ', current: 'Mark' })).toBeNull()
  })
})

describe('the eye says what a press does (tester pass 3)', () => {
  test('"Hide" while the layer shows, "Show" while it is hidden', () => {
    expect(visibilityToggleLabel({ name: 'Logo', visible: true })).toBe('Hide Logo')
    expect(visibilityToggleLabel({ name: 'Logo', visible: false })).toBe('Show Logo')
  })
})
