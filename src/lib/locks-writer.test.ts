import { beforeEach, describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import { createEmptyCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { hashCanonicalDocument, serializeCanonicalDocument } from './canonical-hash'
import { applyCommand, createCommandStack } from './design-commands'
import { createEmptyDocument, parseDocument } from './design-document'
import { getCanonicalDocument, layerPlacement, useEditorStore } from './editor-store'
import { hitPlaceableLayer } from './layer-hit'
import { studioKeyAction, studioKeyList } from './studio-keys'

/** W3: the rail, inspector and ⌘L write the lock R1 taught every build to read. */

const store = () => useEditorStore.getState()
const GRAPHIC = '/graphics/cross-simple.svg'
const serialized = () => serializeCanonicalDocument({ document: getCanonicalDocument() })

function stored({ id = store().selectedLayerId! }: { id?: string } = {}) {
  const document = getCanonicalDocument()
  const panel = Object.values(document.panels).find((entry) => entry.layers.some((layer) => layer.id === id))!
  return panel.layers.find((layer) => layer.id === id) as unknown as Record<string, unknown>
}

function rendered({ id = store().selectedLayerId! }: { id?: string } = {}) {
  return store().document.layers.find((layer) => layer.id === id) as unknown as Record<string, unknown>
}

function lock({ id = store().selectedLayerId!, locked = true }: { id?: string; locked?: boolean } = {}) {
  store().updateLayer({ layerId: id, patch: { locked } })
}

function brushStroke({ y }: { y: number }) {
  store().startStroke({ panel: 'front', point: { x: 0.2, y } })

  for (let index = 1; index <= 8; index += 1) {
    store().appendStroke({ point: { x: 0.2 + index * 0.05, y } })
  }

  store().endStroke()
}

describe('locking on the tee', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('locking stores the flag, and unlocking removes it; each is one undo step', () => {
    store().addGraphic({ src: GRAPHIC })
    const before = serialized()
    const undoCount = store().undoCount

    lock()
    expect(stored().locked).toBe(true)
    expect(rendered().locked).toBe(true)
    expect(store().undoCount).toBe(undoCount + 1)
    expect(validateCanonicalDocument({ value: getCanonicalDocument() }).ok).toBe(true)

    lock({ locked: false })
    expect(stored()).not.toHaveProperty('locked')
    expect(rendered()).not.toHaveProperty('locked')
    expect(store().undoCount).toBe(undoCount + 2)
    expect(serialized()).toBe(before)

    store().undoLast()
    expect(stored().locked).toBe(true)
    store().undoLast()
    expect(serialized()).toBe(before)
    store().redoLast()
    expect(stored().locked).toBe(true)
  })

  test('a design that was locked and unlocked hashes the same as one that never was', async () => {
    store().addText({ content: 'FLP', x: 0.4, y: 0.5 })
    const id = store().selectedLayerId!
    const never = await hashCanonicalDocument({ document: getCanonicalDocument() })
    expect(serialized()).not.toContain('locked')

    lock({ id })
    expect(serialized()).toContain('"locked":true')
    lock({ id, locked: false })

    expect(serialized()).not.toContain('locked')
    expect(await hashCanonicalDocument({ document: getCanonicalDocument() })).toBe(never)
  })

  test('asking for the lock an item already has changes nothing', () => {
    store().addGraphic({ src: GRAPHIC })
    const { revision, undoCount } = store()
    lock({ locked: false })
    expect(store()).toMatchObject({ revision, undoCount })
  })

  test('a locked item refuses moving, nudging, deleting, flipping and restacking', () => {
    store().addGraphic({ src: GRAPHIC })
    const below = store().selectedLayerId!
    store().addGraphic({ src: GRAPHIC })
    const id = store().selectedLayerId!
    lock({ id })
    const before = serialized()
    const { revision, undoCount } = store()

    store().updateLayer({ layerId: id, patch: { x: 0.2 } })
    store().updateLayer({ layerId: id, patch: { flipX: true } })
    store().updateLayer({ layerId: id, patch: { visible: false } })
    store().updateLayer({ layerId: id, patch: { label: 'Renamed' } })
    store().updateLayer({ layerId: id, patch: { locked: false, x: 0.2 } })
    store().nudgeLayer({ layerId: id, dx: 0.01, dy: 0 })
    store().startLayerEdit({ edit: { layerId: id, x: 0.1, y: 0.1, scale: 0.5, rotation: 1 } })
    store().endLayerEdit()
    store().moveLayer({ layerId: id, direction: 'back' })
    store().removeLayer({ layerId: id })

    expect(serialized()).toBe(before)
    expect(store()).toMatchObject({ revision, undoCount, activeLayerEdit: null })
    expect(layerPlacement({ layerId: id })?.index).toBe(1)

    // Moving the item beside it is still fine, and only unlocking frees it.
    store().moveLayer({ layerId: below, direction: 'front' })
    expect(layerPlacement({ layerId: id })?.index).toBe(0)
    lock({ id, locked: false })
    store().removeLayer({ layerId: id })
    expect(rendered({ id })).toBeUndefined()
  })

  test('a locked item is not picked on the cloth; the click reaches what is under it', () => {
    store().addGraphic({ src: GRAPHIC })
    const below = store().selectedLayerId!
    store().addGraphic({ src: GRAPHIC })
    const top = store().selectedLayerId!
    const at = rendered({ id: top }) as { x: number; y: number }
    const hit = () => hitPlaceableLayer({ document: store().document, panel: 'front', x: at.x, y: at.y })?.id

    expect(hit()).toBe(top)
    lock({ id: top })
    expect(hit()).toBe(below)
    lock({ id: below })
    expect(hit()).toBeUndefined()

    // Still selectable from the layer list, so it can be unlocked.
    store().selectLayer({ selectedLayerId: top })
    expect(store().selectedLayerId).toBe(top)
  })

  test('copies of a locked item start unlocked', () => {
    store().addGraphic({ src: GRAPHIC })
    const original = store().selectedLayerId!
    lock({ id: original })

    store().duplicateLayer({ layerId: original })
    expect(store().selectedLayerId).not.toBe(original)
    expect(stored()).not.toHaveProperty('locked')

    store().copyLayerToOpposite({ layerId: original })
    expect(getCanonicalDocument().panels.back.layers[0]).not.toHaveProperty('locked')
    expect(stored({ id: original }).locked).toBe(true)
  })

  test('locked ink keeps its strokes: new strokes and clearing leave it alone', () => {
    brushStroke({ y: 0.3 })
    const paint = getCanonicalDocument().panels.front.layers[0]!
    expect(paint.kind).toBe('paint')
    lock({ id: paint.id })
    expect(rendered({ id: paint.id }).locked).toBe(true)
    const strokes = JSON.stringify(stored({ id: paint.id }).strokes)

    brushStroke({ y: 0.6 })
    const layers = getCanonicalDocument().panels.front.layers
    expect(layers).toHaveLength(2)
    expect(JSON.stringify(stored({ id: paint.id }).strokes)).toBe(strokes)

    store().clearInk({ panel: 'front' })
    expect(JSON.stringify(stored({ id: paint.id }).strokes)).toBe(strokes)
    expect(stored({ id: layers[1]!.id }).strokes).toEqual([])

    store().updateLayer({ layerId: paint.id, patch: { visible: false } })
    expect(stored({ id: paint.id }).visible).toBe(true)
  })
})

describe('the commands underneath', () => {
  function documentWith({ locked }: { locked: boolean }) {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers = [
      { id: 'paint', kind: 'paint', visible: true, opacity: 1, strokes: [{ id: 's1', tool: 'brush', width: 0.02, color: '#1a1c22', opacity: 1, points: [0.1, 0.1, 0.2, 0.2] }] },
      { id: 'mark', kind: 'image', visible: true, opacity: 1, x: 0.5, y: 0.5, scale: 0.2, rotation: 0, assetId: 'asset_crosssimple', aspect: 1, ...(locked ? { locked: true as const } : {}) },
    ]
    return document
  }

  test('paint, image and text layers take a lock; false removes it', () => {
    const stack = createCanonicalStack({ document: documentWith({ locked: false }) })
    const paint = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'paint', patch: { locked: true } } })
    expect(paint.ok && paint.stack.document.panels.front.layers[0]).toMatchObject({ locked: true })

    const image = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'mark', patch: { locked: true } } })
    expect(image.ok && image.stack.document.panels.front.layers[1]).toMatchObject({ locked: true })

    const unlocked = applyCanonicalCommand({
      stack: image.stack,
      command: { type: 'updateLayer', layerId: 'mark', patch: { locked: false } },
    })
    expect(unlocked.ok && unlocked.stack.document).toEqual(stack.document)
  })

  test('every command that would change a locked layer is refused', () => {
    const stack = createCanonicalStack({ document: documentWith({ locked: true }) })
    stack.document.panels.front.layers[0]!.locked = true

    for (const command of [
      { type: 'updateLayer', layerId: 'mark', patch: { x: 0.1 } },
      { type: 'updateLayer', layerId: 'mark', patch: { flipY: true } },
      { type: 'removeLayer', layerId: 'mark' },
      { type: 'moveLayer', layerId: 'mark', toIndex: 0 },
      { type: 'removeStroke', strokeId: 's1' },
      { type: 'clearPaintLayer', layerId: 'paint' },
      { type: 'addStroke', panel: 'front', layerId: 'paint', stroke: { id: 's2', tool: 'eraser', width: 0.02, points: [0.1, 0.1] } },
      { type: 'batch', commands: [{ type: 'updateLayer', layerId: 'paint', patch: { opacity: 0.5 } }] },
    ] as const) {
      const result = applyCanonicalCommand({ stack, command: structuredClone(command) as never })
      expect(result.ok, command.type).toBe(false)
    }

    // Unlocking first, in the same batch, frees it.
    const freed = applyCanonicalCommand({
      stack,
      command: {
        type: 'batch',
        commands: [
          { type: 'updateLayer', layerId: 'mark', patch: { locked: false } },
          { type: 'updateLayer', layerId: 'mark', patch: { x: 0.1 } },
        ],
      },
    })
    expect(freed.ok && freed.stack.document.panels.front.layers[1]).toMatchObject({ x: 0.1 })
  })

  test('concept garments lock and unlock the same way, and refuse edits while locked', () => {
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
    const locked = applyCommand({ stack, command: { type: 'updateLayer', layerId: 'mark', patch: { locked: true } } })
    expect(locked.document.layers[0]).toMatchObject({ locked: true })
    expect(parseDocument({ value: JSON.parse(JSON.stringify(locked.document)) })?.layers[0]).toMatchObject({ locked: true })

    for (const command of [
      { type: 'updateLayer', layerId: 'mark', patch: { x: 0.1 } },
      { type: 'removeLayer', layerId: 'mark' },
    ] as const) {
      expect(applyCommand({ stack: locked, command })).toBe(locked)
    }

    const back = applyCommand({ stack: locked, command: { type: 'updateLayer', layerId: 'mark', patch: { locked: false } } })
    expect(back.document.layers[0]).not.toHaveProperty('locked')
    expect(back.document).toEqual(stack.document)
  })
})

describe('⌘L', () => {
  test('toggles the lock on a lockable selection', () => {
    expect(studioKeyAction({ key: 'l', metaKey: true, hasSelection: true, canLock: true })).toEqual({ type: 'lock' })
    expect(studioKeyAction({ key: 'L', ctrlKey: true, hasSelection: false, canLock: true })).toEqual({ type: 'lock' })
  })

  test('keeps its browser meaning without a selection, in a text box, or with other modifiers', () => {
    expect(studioKeyAction({ key: 'l', metaKey: true, hasSelection: false })).toBeNull()
    expect(studioKeyAction({ key: 'l', metaKey: true, hasSelection: true, canLock: false })).toBeNull()
    expect(studioKeyAction({ key: 'l', metaKey: true, hasSelection: true, canLock: true, target: { tagName: 'INPUT' } })).toBeNull()
    expect(studioKeyAction({ key: 'l', metaKey: true, shiftKey: true, hasSelection: true, canLock: true })).toBeNull()
    expect(studioKeyAction({ key: 'l', metaKey: true, altKey: true, hasSelection: true, canLock: true })).toBeNull()
    expect(studioKeyAction({ key: 'l', hasSelection: true, canLock: true })).toBeNull()
  })

  test('is in the keyboard help', () => {
    expect(studioKeyList({ mod: 'Ctrl' }).map((entry) => entry.keys)).toContain('Ctrl + L')
  })
})
