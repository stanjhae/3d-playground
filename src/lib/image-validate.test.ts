import { describe, expect, test } from 'vitest'

import {
  PNG_SIGNATURE,
  TINY_JPEG,
  ascii,
  concatBytes,
  deflate,
  gpsExifSegment,
  includesBytes,
  pngChunk,
  pngHeader,
  rgbaPng,
  withJpegSegments,
} from './image-fixtures'
import { IMAGE_LIMITS, exifOrientation, sha256Hex, validateImage } from './image-validate'

async function rejection(bytes: Uint8Array) {
  const result = await validateImage({ bytes })

  if (result.ok) {
    throw new Error('expected a rejection')
  }

  return result.reason
}

async function accepted(bytes: Uint8Array) {
  const result = await validateImage({ bytes })

  if (!result.ok) {
    throw new Error(`expected acceptance, got ${result.reason}: ${result.message}`)
  }

  return result.image
}

describe('validateImage: PNG', () => {
  test('a transparent PNG is accepted unchanged with its size and hash', async () => {
    const png = await rgbaPng({ width: 5, height: 3, alpha: 0 })
    const image = await accepted(png)

    expect(image).toMatchObject({ mimeType: 'image/png', width: 5, height: 3, byteSize: png.length })
    expect(image.bytes).toEqual(png)
    expect(image.sha256).toBe(await sha256Hex({ bytes: png }))
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test('text, eXIf and time chunks are stripped; colour chunks are kept', async () => {
    const gama = pngChunk({ type: 'gAMA', data: new Uint8Array([0, 0, 0xb1, 0x8f]) })
    const png = await rgbaPng({
      width: 2,
      height: 2,
      extra: [
        gama,
        pngChunk({ type: 'tEXt', data: ascii('Author\0Ada at 51.5074N') }),
        pngChunk({ type: 'iTXt', data: ascii('XML:com.adobe.xmp\0\0\0\0\0<x/>') }),
        pngChunk({ type: 'eXIf', data: gpsExifSegment().subarray(10) }),
        pngChunk({ type: 'tIME', data: new Uint8Array([7, 234, 10, 30, 12, 0, 0]) }),
      ],
    })
    const image = await accepted(png)

    expect(includesBytes({ haystack: image.bytes, needle: ascii('51.5074') })).toBe(false)
    expect(includesBytes({ haystack: image.bytes, needle: ascii('tEXt') })).toBe(false)
    expect(includesBytes({ haystack: image.bytes, needle: ascii('eXIf') })).toBe(false)
    expect(includesBytes({ haystack: image.bytes, needle: ascii('tIME') })).toBe(false)
    expect(includesBytes({ haystack: image.bytes, needle: gama })).toBe(true)
    expect(await accepted(image.bytes)).toMatchObject({ sha256: image.sha256 })
  })

  test('data appended after IEND (a polyglot) is dropped', async () => {
    const png = await rgbaPng({ width: 1, height: 1 })
    const image = await accepted(concatBytes([png, ascii('<script>alert(1)</script>')]))

    expect(image.bytes).toEqual(png)
  })

  test('an animated PNG (acTL) is rejected', async () => {
    const actl = pngChunk({ type: 'acTL', data: new Uint8Array([0, 0, 0, 2, 0, 0, 0, 0]) })

    expect(await rejection(await rgbaPng({ width: 2, height: 2, extra: [actl] }))).toBe('animated')
  })

  test('a decompression bomb declared by huge header dimensions is rejected before inflating', async () => {
    const bomb = concatBytes([
      PNG_SIGNATURE,
      pngHeader({ width: 100_000, height: 100_000 }),
      pngChunk({ type: 'IDAT', data: await deflate({ bytes: new Uint8Array(64) }) }),
      pngChunk({ type: 'IEND' }),
    ])

    expect(await rejection(bomb)).toBe('dimensions')
    expect(await rejection(await rgbaPng({ width: 4097, height: 1 }))).toBe('dimensions')
  })

  test('image data that inflates past its header is rejected', async () => {
    const bomb = concatBytes([
      PNG_SIGNATURE,
      pngHeader({ width: 1, height: 1 }),
      pngChunk({ type: 'IDAT', data: await deflate({ bytes: new Uint8Array(5_000_000) }) }),
      pngChunk({ type: 'IEND' }),
    ])

    expect(await rejection(bomb)).toBe('corrupt')
  })

  test('the maximum size is accepted', async () => {
    expect(await accepted(await rgbaPng({ width: 4096, height: 1 }))).toMatchObject({ width: 4096 })
  })

  test('corrupt PNGs are rejected', async () => {
    const png = await rgbaPng({ width: 3, height: 3 })
    const flipped = png.slice()
    flipped[40] = flipped[40]! ^ 0xff
    const noEnd = png.subarray(0, png.length - 12)
    const shortData = concatBytes([
      PNG_SIGNATURE,
      pngHeader({ width: 3, height: 3 }),
      pngChunk({ type: 'IDAT', data: await deflate({ bytes: new Uint8Array(4) }) }),
      pngChunk({ type: 'IEND' }),
    ])
    const badFilter = concatBytes([
      PNG_SIGNATURE,
      pngHeader({ width: 1, height: 1 }),
      pngChunk({ type: 'IDAT', data: await deflate({ bytes: new Uint8Array([9, 0, 0, 0, 0]) }) }),
      pngChunk({ type: 'IEND' }),
    ])

    for (const bytes of [flipped, noEnd, shortData, badFilter, PNG_SIGNATURE]) {
      expect(await rejection(bytes)).toBe('corrupt')
    }
  })
})

describe('validateImage: JPEG', () => {
  test('a JPEG is accepted with its frame dimensions', async () => {
    const image = await accepted(TINY_JPEG)

    expect(image).toMatchObject({ mimeType: 'image/jpeg', width: 6, height: 4 })
    expect(includesBytes({ haystack: image.bytes, needle: ascii('JFIF') })).toBe(false)
  })

  test('GPS EXIF is stripped and only the orientation survives', async () => {
    const withGps = withJpegSegments({
      jpeg: TINY_JPEG,
      segments: [gpsExifSegment(), new Uint8Array([0xff, 0xfe, 0, 9, ...ascii('comment')])],
    })
    const image = await accepted(withGps)

    expect(includesBytes({ haystack: withGps, needle: ascii('51.5074') })).toBe(true)
    expect(includesBytes({ haystack: image.bytes, needle: ascii('51.5074') })).toBe(false)
    expect(includesBytes({ haystack: image.bytes, needle: ascii('comment') })).toBe(false)
    expect(exifOrientation({ data: image.bytes.subarray(6) })).toBe(6)
    // Orientation 6 rotates a quarter turn, so the display size swaps.
    expect(image).toMatchObject({ width: 4, height: 6 })
    expect(await accepted(image.bytes)).toMatchObject({ sha256: image.sha256, width: 4, height: 6 })
  })

  test('oversized frames, truncation and missing frames are rejected', async () => {
    const huge = TINY_JPEG.slice()
    const sof = huge.findIndex((byte, index) => byte === 0xff && huge[index + 1] === 0xc0)
    huge.set([0x40, 0x00, 0x40, 0x00], sof + 5)

    expect(await rejection(huge)).toBe('dimensions')
    expect(await rejection(TINY_JPEG.subarray(0, TINY_JPEG.length - 2))).toBe('corrupt')
    expect(await rejection(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe('corrupt')
  })
})

describe('validateImage: type and size', () => {
  test('the declared type is ignored: SVG, HTML, GIF and WebP are refused', async () => {
    const inputs = [
      ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ascii('﻿<!doctype html><img src=x onerror=alert(1)>'),
      ascii('GIF89a\x01\x00\x01\x00'),
      ascii('RIFF\x00\x00\x00\x00WEBPVP8 '),
      new Uint8Array(),
    ]

    for (const bytes of inputs) {
      expect(await rejection(bytes)).toBe('unsupported_type')
    }
  })

  test('a file over 10 MB is refused before parsing', async () => {
    const big = new Uint8Array(IMAGE_LIMITS.maxBytes + 1)
    big.set(PNG_SIGNATURE)

    expect(await rejection(big)).toBe('too_large')
  })
})
