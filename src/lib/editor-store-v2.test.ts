import { beforeEach, describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'
import { useEditorStore } from './editor-store'

const store = () => useEditorStore.getState()

function drawOn({ panel }: { panel: 'front' | 'back' | 'left' | 'right' }) {
  store().setPaintPanel({ paintPanel: panel })
  store().startStroke({ panel, point: { x: 0.3, y: 0.4 } })
  store().appendStroke({ point: { x: 0.5, y: 0.45 } })
  store().endStroke()
}

function contentIds() {
  return store()
    .document.layers.flatMap((layer) =>
      layer.kind === 'paint' ? layer.strokes.map((stroke) => `${stroke.panel}:${stroke.id}`) : [`${layer.kind}:${layer.id}`],
    )
    .sort()
}

describe('editor store on canonical v2 (E01 #152)', () => {
  beforeEach(() => {
    store().reset()
  })

  test('every committed change bumps the revision; drawing works on all four panels', () => {
    const start = store().revision

    for (const panel of ['front', 'back', 'left', 'right'] as const) {
      drawOn({ panel })
    }

    store().addText({ content: 'FLP', panel: 'back' })
    store().addGraphic({ src: '/graphics/cross-simple.svg', panel: 'left' })

    expect(store().revision).toBe(start + 6)
    expect(
      store()
        .document.layers.flatMap((layer) => (layer.kind === 'paint' ? layer.strokes.map((stroke) => stroke.panel) : []))
        .sort(),
    ).toEqual(['back', 'front', 'left', 'right'])
    expect(store().document.layers.map((layer) => layer.kind)).toEqual(
      expect.arrayContaining(['text', 'graphic']),
    )
  })

  test('switching tools, edit modes and views preserves every object and stroke', () => {
    drawOn({ panel: 'front' })
    store().addText({ content: 'KEEP', panel: 'front' })
    const before = contentIds()
    const revision = store().revision

    store().setPaintTool({ paintTool: 'eraser' })
    store().setDesignEditMode({ designEditMode: 'tech' })
    store().setStudioView({ studioView: 'draw' })
    store().setPaintTool({ paintTool: 'brush' })
    store().setDesignEditMode({ designEditMode: 'draw' })

    expect(contentIds()).toEqual(before)
    expect(store().revision).toBe(revision)
  })

  test('undo and redo move the shared revision forward and restore content', () => {
    store().addText({ content: 'ONE' })
    const afterAdd = contentIds()
    const revision = store().revision

    store().undoLast()
    expect(contentIds().some((id) => id.startsWith('text:'))).toBe(false)
    store().redoLast()

    expect(contentIds()).toEqual(afterAdd)
    expect(store().revision).toBe(revision + 2)
  })

  test('invalid edits are refused, not clamped into the document', () => {
    store().addText({ content: 'NAME' })
    const id = store().selectedLayerId!
    const revision = store().revision

    store().updateLayer({ layerId: id, patch: { content: '' } })

    const layer = store().document.layers.find((entry) => entry.id === id)
    expect(layer && layer.kind === 'text' ? layer.content : null).toBe('NAME')
    expect(store().revision).toBe(revision)
  })

  test('loading a design replaces content, resets undo and reports what changed', () => {
    store().addText({ content: 'OLD' })
    expect(store().undoCount).toBeGreaterThan(0)

    store().loadDesign({
      design: {
        ...createEmptyDesign({ id: 'look-1' }),
        garmentId: 'tee',
        title: 'Loaded',
        document: {
          garmentId: 'tee',
          garmentVersion: 2,
          structural: { neck: 'v' },
          overrides: [],
          layers: [
            { id: 'w1', kind: 'text', panel: 'front', content: 'NEW', face: 'sans', color: '#c4a15a', x: 0.5, y: 0.5, scale: 0.1, rotation: 0, opacity: 1, visible: true },
            { id: 'pt', kind: 'pattern', patternId: 'gradient', panel: 'front', color: '#000000', x: 0.5, y: 0.5, scale: 0.4, rotation: 0, opacity: 1, visible: true },
          ],
        },
      },
    })

    expect(contentIds()).toEqual(['text:w1'])
    expect(store()).toMatchObject({ undoCount: 0, redoCount: 0, title: 'Loaded' })
    expect(store().importNotes.map((note) => note.path)).toEqual(
      expect.arrayContaining(['structural.neck', 'layers[1]']),
    )
  })

  test('publishing does not touch document content or history', () => {
    store().addText({ content: 'LOOK' })
    const { revision, undoCount } = store()

    store().publishLook({
      design: { ...createEmptyDesign({ id: 'x' }), title: 'Published', author: 'A' },
    })

    expect(store()).toMatchObject({ revision, undoCount })
  })

  test('a detour to a concept garment keeps the tee work intact', () => {
    store().addText({ content: 'TEE' })
    const teeContent = contentIds()

    store().setGarmentId({ garmentId: 'gown' })
    expect(store().garmentId).toBe('gown')
    store().setGarmentId({ garmentId: 'tee' })

    expect(contentIds()).toEqual(teeContent)
  })

  test('the stripe base is one undoable step and projects onto every panel', () => {
    store().setBasePattern({ patternId: 'stripe' })

    expect(
      store()
        .document.layers.filter((layer) => layer.kind === 'pattern')
        .map((layer) => layer.id)
        .sort(),
    ).toEqual(['base-fill-back', 'base-fill-front', 'base-fill-left', 'base-fill-right'])

    store().undoLast()
    expect(store().document.layers.some((layer) => layer.kind === 'pattern')).toBe(false)
  })
})
