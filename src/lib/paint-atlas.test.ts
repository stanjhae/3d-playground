import { describe, expect, test } from 'vitest'

import { createEmptyDocument, createObjectId } from './design-document'
import {
  atlasPixelAtPanel,
  createAtlasBuffer,
  paintOverCloth,
  rasterizeLayers,
} from './paint-atlas'
import { atlasPixelForUv, panelPointToUv } from './panel-uv'

describe('rasterizeLayers', () => {
  test('a front stroke lands on a known pixel', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const paint = document.layers[0]

    if (paint?.kind === 'paint') {
      paint.strokes.push({
        id: createObjectId({ prefix: 'ink' }),
        panel: 'front',
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.52, y: 0.5 },
        ],
        color: '#c41e3a',
        width: 0.04,
        tool: 'brush',
      })
    }

    const buffer = rasterizeLayers({ document, width: 64, height: 64 })
    const pixel = atlasPixelAtPanel({
      buffer,
      panel: 'front',
      x: 0.5,
      y: 0.5,
    })

    expect(pixel.a).toBeGreaterThan(0)
    expect(pixel.r).toBeGreaterThan(pixel.g)
  })

  test('baked art lands on the atlas', () => {
    const art = createAtlasBuffer({ width: 16, height: 16 })
    const uv = panelPointToUv({ panel: 'front', x: 0.5, y: 0.5 })
    const { index } = atlasPixelForUv({
      u: uv.u,
      v: uv.v,
      width: 16,
      height: 16,
    })
    art.pixels[index] = 200
    art.pixels[index + 3] = 255

    const document = createEmptyDocument({ garmentId: 'tee' })
    document.layers.unshift({
      id: 'art-1',
      kind: 'art',
      src: 'data:image/png;base64,abc',
      locked: true,
      visible: true,
    })

    const buffer = rasterizeLayers({
      document,
      width: 16,
      height: 16,
      images: { 'data:image/png;base64,abc': art },
    })

    expect(buffer.pixels[index]).toBe(200)
    expect(buffer.pixels[index + 3]).toBeGreaterThan(0)
  })

  test('a stripe sits on the front and misses the sleeve', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    document.layers.push({
      id: 'print-1',
      kind: 'pattern',
      patternId: 'stripe',
      panel: 'front',
      color: '#1a1c22',
      x: 0.5,
      y: 0.5,
      scale: 0.4,
      rotation: 0,
      visible: true,
    })

    const buffer = rasterizeLayers({ document, width: 64, height: 64 })
    const chest = atlasPixelAtPanel({
      buffer,
      panel: 'front',
      x: 0.5,
      y: 0.5,
    })
    const sleeve = atlasPixelAtPanel({
      buffer,
      panel: 'sleeve',
      x: 0.5,
      y: 0.5,
    })

    expect(chest.a).toBeGreaterThan(0)
    expect(sleeve.a).toBe(0)
  })

  test('a front stroke does not land on a sleeve', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const paint = document.layers[0]

    if (paint?.kind === 'paint') {
      paint.strokes.push({
        id: createObjectId({ prefix: 'ink' }),
        panel: 'front',
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.52, y: 0.5 },
        ],
        color: '#c41e3a',
        width: 0.04,
        tool: 'brush',
      })
    }

    const buffer = rasterizeLayers({ document, width: 64, height: 64 })
    const sleeve = atlasPixelAtPanel({
      buffer,
      panel: 'sleeve',
      x: 0.5,
      y: 0.5,
    })

    expect(sleeve.a).toBe(0)
  })

  test('ink composites over cloth instead of replacing it', () => {
    expect(
      paintOverCloth({
        cloth: { r: 244, g: 234, b: 212 },
        ink: { r: 26, g: 28, b: 34, a: 128 },
      }),
    ).toEqual({
      r: 135,
      g: 131,
      b: 123,
    })
  })
})
