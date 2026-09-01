import { describe, expect, test } from 'vitest'

import {
  MAX_THUMBNAIL_CHARS,
  isSafeThumbnail,
  sanitizeThumbnail,
} from './look-thumbnail'

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
})
