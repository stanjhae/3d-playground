import { describe, expect, test } from 'vitest'

import { type DesignDocument, createEmptyDocument } from './design-document'
import { SVG_RASTER_LONG_EDGE, countUnavailableImages, isSvgSrc, layerRasterSize, loadLayerImages } from './layer-images'
import type { AtlasBuffer } from './paint-atlas'

function documentWith({ layers }: { layers: DesignDocument['layers'] }): DesignDocument {
  return { ...createEmptyDocument({ garmentId: 'tee' }), layers }
}

const image = ({ id, src, visible = true, missing }: { id: string; src: string; visible?: boolean; missing?: true }) =>
  ({
    id,
    kind: 'graphic',
    panel: 'front',
    src,
    visible,
    x: 0.5,
    y: 0.5,
    scale: 0.3,
    rotation: 0,
    ...(missing ? { missing } : {}),
  }) as DesignDocument['layers'][number]

const pixels = { width: 1, height: 1, pixels: new Uint8ClampedArray(4) }

describe('countUnavailableImages (R04)', () => {
  test('counts images with no source and images that fail to decode', async () => {
    const document = documentWith({
      layers: [image({ id: 'ok', src: '/ok.png' }), image({ id: 'bad', src: '/bad.png' }), image({ id: 'gone', src: '', missing: true })],
    })

    const count = await countUnavailableImages({
      document,
      decode: async ({ src }) => (src === '/ok.png' ? pixels : null),
    })

    expect(count).toBe(2)
  })

  test('a hidden image can\'t publish as a placeholder, so it does not count', async () => {
    const document = documentWith({
      layers: [image({ id: 'hidden', src: '', visible: false, missing: true }), image({ id: 'off', src: '/bad.png', visible: false })],
    })

    expect(await countUnavailableImages({ document, decode: async () => null })).toBe(0)
  })

  test('a design whose images all load is clear to publish', async () => {
    const document = documentWith({ layers: [image({ id: 'ok', src: '/ok.png' })] })

    expect(await countUnavailableImages({ document, decode: async () => pixels })).toBe(0)
  })
})

describe('loadLayerImages', () => {
  test('a delayed older decode cannot overwrite a newer one', async () => {
    const older: AtlasBuffer = { width: 1, height: 1, pixels: new Uint8ClampedArray(4) }
    const newer: AtlasBuffer = { width: 2, height: 2, pixels: new Uint8ClampedArray(16) }
    let finishOlder: (image: AtlasBuffer) => void = () => {}
    const loaded: Array<Record<string, AtlasBuffer>> = []
    const onLoaded = (images: Record<string, AtlasBuffer>) => loaded.push(images)

    const cancelOlder = loadLayerImages({
      srcs: ['/old.png'],
      decode: () => new Promise((resolve) => (finishOlder = resolve)),
      onLoaded,
    })
    // What the hook's effect does when the document moves on.
    cancelOlder()
    loadLayerImages({ srcs: ['/new.png'], decode: async () => newer, onLoaded })
    await new Promise((resolve) => setTimeout(resolve))
    expect(loaded).toEqual([{ '/new.png': newer }])

    finishOlder(older)
    await new Promise((resolve) => setTimeout(resolve))
    expect(loaded).toEqual([{ '/new.png': newer }])
  })

  test('an image that fails to decode is left out of the batch', async () => {
    const loaded = await new Promise((resolve) => {
      loadLayerImages({
        srcs: ['/ok.png', '/bad.png'],
        decode: async ({ src }) => (src === '/ok.png' ? pixels : null),
        onLoaded: resolve,
      })
    })
    expect(loaded).toEqual({ '/ok.png': pixels })
  })
})

describe('layer raster size', () => {
  test('an SVG is drawn with its long edge at the atlas size, keeping its aspect', () => {
    expect(SVG_RASTER_LONG_EDGE).toBe(2048)
    expect(layerRasterSize({ width: 400, height: 560, svg: true })).toEqual({ width: 1463, height: 2048 })
    expect(layerRasterSize({ width: 800, height: 200, svg: true })).toEqual({ width: 2048, height: 512 })
    expect(layerRasterSize({ width: 120, height: 160, svg: true })).toEqual({ width: 1536, height: 2048 })
  })

  test('a small SVG is scaled up, not drawn at its natural size', () => {
    expect(layerRasterSize({ width: 24, height: 24, svg: true })).toEqual({ width: 2048, height: 2048 })
  })

  test('an SVG with no intrinsic size is drawn square', () => {
    expect(layerRasterSize({ width: 0, height: 0, svg: true })).toEqual({ width: 2048, height: 2048 })
  })

  test('a raster image keeps its natural size, capped', () => {
    expect(layerRasterSize({ width: 300, height: 200, svg: false })).toEqual({ width: 300, height: 200 })
    expect(layerRasterSize({ width: 4000, height: 200, svg: false })).toEqual({ width: 1024, height: 200 })
  })

  test('knows an SVG source', () => {
    expect(isSvgSrc({ src: '/graphics/rose.svg' })).toBe(true)
    expect(isSvgSrc({ src: '/graphics/rose.SVG?v=2#x' })).toBe(true)
    expect(isSvgSrc({ src: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(true)
    expect(isSvgSrc({ src: 'data:image/png;base64,AAAA' })).toBe(false)
    expect(isSvgSrc({ src: '/uploads/photo.png' })).toBe(false)
    expect(isSvgSrc({ src: '/uploads/svg.png' })).toBe(false)
  })
})
