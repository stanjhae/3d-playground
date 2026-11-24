import { describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import { type CanonicalDocument, type CanonicalImageLayer, createEmptyCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { adjustSaturation } from './paint-atlas'

// Tester, 22 Nov: uploaded images need their colour turned down (to black
// and white) or up, to sit naturally in a design.

const image = (extra: Partial<CanonicalImageLayer> = {}): CanonicalImageLayer => ({
  id: 'image-front',
  kind: 'image',
  visible: true,
  opacity: 1,
  assetId: 'asset_3f9a1c22b7',
  aspect: 1,
  x: 0.5,
  y: 0.5,
  scale: 0.3,
  rotation: 0,
  ...extra,
})

const withImage = (layer: CanonicalImageLayer): CanonicalDocument => {
  const document = createEmptyCanonicalDocument()
  document.panels.front!.layers.push(layer)
  return document
}

const valid = (document: CanonicalDocument) => validateCanonicalDocument({ value: document }).ok

describe('an image’s colour strength', () => {
  test('is saved from black and white (0) up to twice the colour', () => {
    expect(valid(withImage(image({ saturation: 0 })))).toBe(true)
    expect(valid(withImage(image({ saturation: 1.5 })))).toBe(true)
    expect(valid(withImage(image({ saturation: 2 })))).toBe(true)
    expect(valid(withImage(image({ saturation: 2.5 })))).toBe(false)
    expect(valid(withImage(image({ saturation: -0.1 })))).toBe(false)
  })

  test('as uploaded is left out, so older designs keep their hash', () => {
    expect(valid(withImage(image({ saturation: 1 })))).toBe(false)
    expect(serializeCanonicalDocument({ document: withImage(image()) })).not.toContain('saturation')
  })

  test('is set by an edit, and back at 1 the field goes', () => {
    let stack = createCanonicalStack({ document: withImage(image()) })
    const set = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'image-front', patch: { saturation: 0 } } })
    expect(set.ok).toBe(true)
    stack = set.stack
    expect((stack.document.panels.front!.layers[0] as CanonicalImageLayer).saturation).toBe(0)

    const back = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'image-front', patch: { saturation: 1 } } })
    expect(back.ok).toBe(true)
    expect('saturation' in back.stack.document.panels.front!.layers[0]!).toBe(false)
  })

  test('only images take it', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front!.layers.push({
      id: 'text-front',
      kind: 'text',
      visible: true,
      opacity: 1,
      content: 'HI',
      face: 'sans',
      color: '#1a1c22',
      x: 0.5,
      y: 0.5,
      scale: 0.2,
      rotation: 0,
      ...({ saturation: 0 } as object),
    } as CanonicalDocument['panels']['front']['layers'][number])
    expect(valid(document)).toBe(false)
  })
})

describe('adjustSaturation', () => {
  const pixel = (r: number, g: number, b: number, a = 255) => ({ width: 1, height: 1, pixels: new Uint8ClampedArray([r, g, b, a]) })

  test('0 turns a colour into its grey, keeping alpha', () => {
    const [r, g, b, a] = adjustSaturation({ image: pixel(224, 20, 31, 128), saturation: 0 }).pixels

    expect(r).toBe(g)
    expect(g).toBe(b)
    // Rec. 709 luminance of the house red.
    expect(r).toBe(Math.round(0.2126 * 224 + 0.7152 * 20 + 0.0722 * 31))
    expect(a).toBe(128)
  })

  test('1 keeps the image as it is; above 1 pushes colours apart', () => {
    expect([...adjustSaturation({ image: pixel(224, 20, 31), saturation: 1 }).pixels]).toEqual([224, 20, 31, 255])

    const [r, g] = adjustSaturation({ image: pixel(160, 100, 100), saturation: 2 }).pixels
    expect(r! - g!).toBeGreaterThan(60)
  })
})
