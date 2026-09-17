import { describe, expect, test } from 'vitest'

import { createEmptyDocument, createObjectId } from './design-document'
import {
  applyLayerEdit,
  canvasLayerFrame,
  hitLayerHandle,
  hitPlaceableLayer,
  layerBox,
  layerHandleLocal,
  layerVoice,
  placedType,
  wordEditShouldCommit,
} from './layer-hit'

describe('layer hit', () => {
  test('finds a word you can move', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const layerId = createObjectId({ prefix: 'word' })
    document.layers.push({
      id: layerId,
      kind: 'text',
      panel: 'front',
      content: 'FLV',
      face: 'display',
      color: '#1a1c22',
      x: 0.5,
      y: 0.4,
      scale: 0.12,
      rotation: 0,
      visible: true,
    })

    const hit = hitPlaceableLayer({
      document,
      panel: 'front',
      x: 0.5,
      y: 0.4,
    })

    expect(hit?.id).toBe(layerId)
    expect(
      hitLayerHandle({
        layer: hit!,
        x: 0.5,
        y: 0.4,
      }),
    ).toBe('move')
    expect(layerVoice({ layer: hit! })).toBe('FLV')
  })

  test('applies a live edit without flattening the document', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const layerId = createObjectId({ prefix: 'mark' })
    document.layers.push({
      id: layerId,
      kind: 'graphic',
      panel: 'front',
      src: 'data:image/png;base64,abc',
      x: 0.5,
      y: 0.5,
      scale: 0.2,
      rotation: 0,
      visible: true,
    })

    const next = applyLayerEdit({
      document,
      edit: {
        layerId,
        x: 0.3,
        y: 0.6,
        scale: 0.25,
        rotation: 0.1,
      },
    })
    const edited = next.layers.find((layer) => layer.id === layerId)
    const original = document.layers.find((layer) => layer.id === layerId)

    expect(edited && edited.kind === 'graphic' ? edited.x : null).toBe(0.3)
    expect(original && original.kind === 'graphic' ? original.x : null).toBe(0.5)
  })

  test('drawn frame and hit handles share one box', () => {
    const layer = {
      id: 'word-long',
      kind: 'text' as const,
      panel: 'front' as const,
      content: 'MIDNIGHT',
      face: 'display' as const,
      color: '#1a1c22',
      x: 0.5,
      y: 0.4,
      scale: 0.12,
      rotation: 0,
      visible: true,
    }
    const box = layerBox({ layer })
    const frame = canvasLayerFrame({
      layer,
      width: 360,
      height: 420,
    })
    const handles = layerHandleLocal({ layer })

    expect(frame.width / 360).toBeCloseTo(box.width)
    expect(frame.height / 420).toBeCloseTo(box.height)
    expect(
      hitLayerHandle({
        layer,
        x: layer.x + handles.scale.x,
        y: layer.y + handles.scale.y,
      }),
    ).toBe('scale')
    expect(
      hitLayerHandle({
        layer,
        x: layer.x + handles.rotate.x,
        y: layer.y + handles.rotate.y,
      }),
    ).toBe('rotate')
  })

  test('type only places a word that was written', () => {
    expect(placedType({ typeDraft: '' })).toBeNull()
    expect(placedType({ typeDraft: '   ' })).toBeNull()
    expect(placedType({ typeDraft: 'FLV' })).toBe('FLV')
    expect(placedType({ typeDraft: '  house  ' })).toBe('house')
  })

  test('a word edit does not write back after undo', () => {
    expect(
      wordEditShouldCommit({
        layerContent: 'FLV',
        editStartContent: 'FLV',
      }),
    ).toBe(true)
    expect(
      wordEditShouldCommit({
        layerContent: 'HOUSE',
        editStartContent: 'FLV',
      }),
    ).toBe(false)
  })
})
