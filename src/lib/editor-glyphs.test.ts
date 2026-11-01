import { beforeEach, describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type CanonicalLayer,
  createEmptyCanonicalDocument,
} from './canonical-document'
import { createEmptyDesign } from './design-schema'
import { glyphNotice, glyphRefusal } from './editor-canonical'
import { getCanonicalDocument, useEditorStore } from './editor-store'

/** #155: a word its face can't draw is refused or explained, never drawn in a stand-in font. */

const store = () => useEditorStore.getState()

function word(id: string, content: string, face: 'display' | 'sans' = 'display'): CanonicalLayer {
  return {
    id,
    kind: 'text',
    visible: true,
    opacity: 1,
    x: 0.5,
    y: 0.5,
    scale: 0.1,
    rotation: 0,
    content,
    face,
    color: '#1a1c22',
  }
}

function documentWith({ back }: { back: CanonicalLayer[] }): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.panels.back.layers = back
  return document
}

function frontWords() {
  return getCanonicalDocument().panels.front.layers.flatMap((layer) =>
    layer.kind === 'text' ? [{ content: layer.content, face: layer.face }] : [],
  )
}

describe('glyph validation in the editor (#155)', () => {
  beforeEach(() => {
    store().reset()
    store().setPaintPanel({ paintPanel: 'front' })
  })

  test('typing an undrawable word is refused through the limit message, naming the characters', () => {
    const { revision, undoCount } = store()

    store().addText({ content: 'Hi 字', face: 'display' })

    expect(frontWords()).toEqual([])
    expect(store().limitNotice).toBe('The display face can\'t draw “字”. Remove it.')
    expect(store()).toMatchObject({ revision, undoCount })
  })

  test('the message offers the face that can draw it', () => {
    store().addText({ content: 'Жар', face: 'sans' })

    expect(frontWords()).toEqual([])
    expect(store().limitNotice).toBe('The sans face can\'t draw “Ж”, “а” or “р”. Remove them or switch to Display.')

    store().addText({ content: 'Жар', face: 'display' })
    expect(frontWords()).toEqual([{ content: 'Жар', face: 'display' }])
    expect(store().limitNotice).toBeNull()
  })

  test('editing a word, or switching it to a face that lacks its characters, is refused', () => {
    store().addText({ content: 'Жар', face: 'display' })
    const id = store().selectedLayerId!

    store().updateLayer({ layerId: id, patch: { face: 'sans' } })
    expect(frontWords()).toEqual([{ content: 'Жар', face: 'display' }])
    expect(store().limitNotice).toContain('The sans face can\'t draw “Ж”')

    store().updateLayer({ layerId: id, patch: { content: 'Жар 😀' } })
    expect(frontWords()).toEqual([{ content: 'Жар', face: 'display' }])
    expect(store().limitNotice).toBe('The display face can\'t draw “😀”. Remove it.')

    store().updateLayer({ layerId: id, patch: { content: 'Bar' } })
    store().updateLayer({ layerId: id, patch: { face: 'sans' } })
    expect(frontWords()).toEqual([{ content: 'Bar', face: 'sans' }])
    expect(store().limitNotice).toBeNull()
  })

  test('a recovered cloud document with undrawable text opens with a message and stays editable', () => {
    const document = documentWith({ back: [word('w', 'Love 字'), word('ok', 'FLP', 'sans')] })

    expect(() =>
      store().loadCanonical({
        document,
        cloud: { designId: 'd-1', title: 'Old', headSeq: 1 } as Parameters<
          ReturnType<typeof store>['loadCanonical']
        >[0]['cloud'],
      }),
    ).not.toThrow()

    expect(store().limitNotice).toBe(
      'A word on the back has characters its face can\'t draw. The display face can\'t draw “字”. Remove it.',
    )

    // Moving it or editing other words is fine; fixing the word clears the notice.
    store().updateLayer({ layerId: 'w', patch: { color: '#c4a15a' } })
    store().updateLayer({ layerId: 'ok', patch: { content: 'FLV' } })
    expect(getCanonicalDocument().panels.back.layers.map((layer) => layer.kind === 'text' && layer.content)).toEqual([
      'Love 字',
      'FLV',
    ])

    store().updateLayer({ layerId: 'w', patch: { content: 'Love' } })
    expect(store().limitNotice).toBeNull()
  })

  test('an imported legacy design with undrawable text opens with the message, not a crash', () => {
    expect(() =>
      store().loadDesign({
        design: {
          ...createEmptyDesign({ id: 'look-glyphs' }),
          garmentId: 'tee',
          document: {
            garmentId: 'tee',
            garmentVersion: 2,
            structural: {},
            overrides: [],
            layers: [
              {
                id: 'w0',
                kind: 'text',
                panel: 'front',
                content: '😀 hi',
                face: 'sans',
                color: '#c4a15a',
                x: 0.5,
                y: 0.5,
                scale: 0.1,
                rotation: 0,
                opacity: 1,
                visible: true,
              },
            ],
          },
        },
      }),
    ).not.toThrow()

    expect(frontWords()).toEqual([{ content: '😀 hi', face: 'sans' }])
    expect(store().limitNotice).toContain('The sans face can\'t draw “😀”')
  })

  test('copying an undrawable word is refused; other commands pass', () => {
    const document = documentWith({ back: [word('w', '字')] })

    expect(glyphRefusal({ document, command: { type: 'copyLayer', layerId: 'w', panel: 'front', newId: 'w2' } })).toContain('“字”')
    expect(glyphRefusal({ document, command: { type: 'updateLayer', layerId: 'w', patch: { x: 0.2 } } })).toBeNull()
    expect(glyphRefusal({ document, command: { type: 'removeLayer', layerId: 'w' } })).toBeNull()
    expect(
      glyphRefusal({
        document,
        command: { type: 'batch', commands: [{ type: 'addLayer', panel: 'front', layer: word('n', 'ok 😀') }] },
      }),
    ).toContain('“😀”')
    expect(glyphNotice({ document: createEmptyCanonicalDocument() })).toBeNull()
  })
})
