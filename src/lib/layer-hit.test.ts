import { describe, expect, test } from 'vitest'

import { type GraphicLayer, createEmptyDocument, createObjectId } from './design-document'
import {
  applyLayerEdit,
  canvasLayerFrame,
  hitLayerHandle,
  hitPlaceableLayer,
  layerBox,
  layerHandleLocal,
  layerMostlyOffPanel,
  layerShareOnPanel,
  layerVoice,
  placedType,
  wordEditorWidth,
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
      opacity: 1,
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
      opacity: 1,
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
      opacity: 1,
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

  test('names a stripe you can move', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const layerId = createObjectId({ prefix: 'print' })
    document.layers.push({
      id: layerId,
      kind: 'pattern',
      patternId: 'stripe',
      panel: 'front',
      color: '#1a1c22',
      x: 0.5,
      y: 0.5,
      scale: 0.4,
      rotation: 0,
      opacity: 1,
      visible: true,
    })

    const hit = hitPlaceableLayer({
      document,
      panel: 'front',
      x: 0.5,
      y: 0.5,
    })

    expect(hit?.kind).toBe('pattern')
    expect(layerVoice({ layer: hit! })).toBe('Stripe')
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

  test('a wide image selects its own box, not a square (#154)', () => {
    const image = {
      id: 'mark-wide',
      kind: 'graphic' as const,
      panel: 'front' as const,
      src: 'blob:wide',
      x: 0.5,
      y: 0.5,
      scale: 0.4,
      rotation: 0,
      opacity: 1,
      visible: true,
      aspect: 2,
    }

    expect(layerBox({ layer: image })).toEqual({ width: 0.4, height: 0.2 })
    expect(layerBox({ layer: { ...image, aspect: 0.5 } })).toEqual({ width: 0.2, height: 0.4 })
    expect(layerBox({ layer: { ...image, aspect: undefined } })).toEqual({ width: 0.4, height: 0.4 })
  })
})

describe('wordEditorWidth', () => {
  test('fits the word being edited, within the panel', () => {
    // A short word in large type: its frame is narrow, the box still fits it.
    expect(wordEditorWidth({ frameShare: 0.1, length: 4 })).toBe('min(100%, max(18%, calc(5ch + 1.5rem)))')
    expect(wordEditorWidth({ frameShare: 0.5, length: 12 })).toBe('min(100%, max(50%, calc(13ch + 1.5rem)))')
    expect(wordEditorWidth({ frameShare: 0, length: 0 })).toBe('min(100%, max(18%, calc(4ch + 1.5rem)))')
  })
})

describe('how much of a layer is on its panel', () => {
  const graphic = (extra: Partial<GraphicLayer> = {}): GraphicLayer => ({
    id: 'g',
    kind: 'graphic',
    panel: 'front',
    src: 'x',
    x: 0.5,
    y: 0.5,
    scale: 0.2,
    rotation: 0,
    opacity: 1,
    visible: true,
    surface: { stretchY: 0.879, panelAspect: 0.611 },
    ...extra,
  })

  test('all of it in the middle, and about a quarter in a corner', () => {
    expect(layerShareOnPanel({ layer: graphic() })).toBe(1)
    expect(layerShareOnPanel({ layer: graphic({ x: 0, y: 0 }) })).toBeCloseTo(0.25, 1)
    expect(layerShareOnPanel({ layer: graphic({ x: 0.5, y: 0 }) })).toBeCloseTo(0.5, 1)
  })

  test('warns in a corner, not at an edge or in the middle', () => {
    expect(layerMostlyOffPanel({ layer: graphic({ x: 0, y: 1 }) })).toBe(true)
    expect(layerMostlyOffPanel({ layer: graphic({ x: 0, y: 0.5 }) })).toBe(false)
    expect(layerMostlyOffPanel({ layer: graphic() })).toBe(false)
  })

  test('a turn counts on the cloth, so a layer turned in a corner is still counted', () => {
    const turned = layerShareOnPanel({ layer: graphic({ x: 0, y: 0, rotation: Math.PI / 4 }) })
    expect(turned).toBeGreaterThan(0.15)
    expect(turned).toBeLessThan(0.35)
  })
})
