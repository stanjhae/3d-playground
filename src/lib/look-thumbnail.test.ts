import { describe, expect, test } from 'vitest'

import {
  MAX_ART_MAP_CHARS,
  MAX_THUMBNAIL_CHARS,
  imageFromDataUrl,
  isSafeGraphicsPath,
  isSafeLayerSrc,
  isSafeStillPath,
  isSafeThumbnail,
  sanitizeArtMap,
  sanitizeThumbnail,
  stillImageType,
} from './look-thumbnail'

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACq/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

describe('look thumbnail', () => {
  test('allows house stills and raster data urls', () => {
    expect(
      isSafeThumbnail({
        thumbnailDataUrl: '/stills/look-midnight-silk.png',
      }),
    ).toBe(true)
    expect(
      isSafeThumbnail({
        thumbnailDataUrl: 'data:image/jpeg;base64,abc',
      }),
    ).toBe(true)
    expect(
      isSafeThumbnail({
        thumbnailDataUrl: 'data:image/png;base64,abc',
      }),
    ).toBe(true)
  })

  test('rejects svg, scripts, and remote urls', () => {
    expect(
      isSafeThumbnail({
        thumbnailDataUrl: 'data:image/svg+xml;utf8,<svg></svg>',
      }),
    ).toBe(false)
    expect(
      isSafeThumbnail({
        thumbnailDataUrl: 'javascript:alert(1)',
      }),
    ).toBe(false)
    expect(
      isSafeThumbnail({
        thumbnailDataUrl: 'https://evil.example/still.png',
      }),
    ).toBe(false)
    expect(
      sanitizeThumbnail({
        thumbnailDataUrl: 'data:image/svg+xml,ok',
      }),
    ).toBe('')
    expect(
      sanitizeThumbnail({
        thumbnailDataUrl: `data:image/png;base64,${'a'.repeat(MAX_THUMBNAIL_CHARS)}`,
      }),
    ).toBe('')
  })

  test('names still and data-url types', () => {
    expect(
      isSafeStillPath({ thumbnailDataUrl: '/stills/look-cotton-leather.png' }),
    ).toBe(true)
    expect(
      stillImageType({ thumbnailDataUrl: '/stills/look-cotton-leather.png' }),
    ).toBe('image/png')
    expect(
      stillImageType({ thumbnailDataUrl: TINY_JPEG }),
    ).toBe('image/jpeg')
  })

  test('art maps use the same raster allowlist', () => {
    expect(sanitizeArtMap({ artMap: 'data:image/png;base64,abc' })).toBe(
      'data:image/png;base64,abc',
    )
    expect(sanitizeArtMap({ artMap: 'data:image/svg+xml,<svg></svg>' })).toBe('')
    expect(sanitizeArtMap({ artMap: 'javascript:alert(1)' })).toBe('')
    expect(
      sanitizeArtMap({
        artMap: `data:image/png;base64,${'a'.repeat(MAX_ART_MAP_CHARS)}`,
      }),
    ).toBe('')
  })

  test('decodes a raster data url and ignores a bad payload', () => {
    const image = imageFromDataUrl({ dataUrl: TINY_JPEG })

    expect(image?.type).toBe('image/jpeg')
    expect(image?.bytes.byteLength).toBeGreaterThan(8)
    expect(
      imageFromDataUrl({ dataUrl: 'data:image/jpeg;base64,!!!!' }),
    ).toBeNull()
  })

  test('layer srcs allow house graphics paths and raster data urls', () => {
    expect(isSafeLayerSrc({ src: '/graphics/cross-gothic.svg' })).toBe(true)
    expect(isSafeLayerSrc({ src: '/graphics/logo-flv.png' })).toBe(true)
    expect(isSafeLayerSrc({ src: 'data:image/png;base64,abc' })).toBe(true)
    expect(isSafeLayerSrc({ src: 'https://evil.example/x.svg' })).toBe(false)
    expect(isSafeLayerSrc({ src: '/stills/look.png' })).toBe(false)
    expect(isSafeGraphicsPath({ src: '/graphics/../evil.svg' })).toBe(false)
  })
})
