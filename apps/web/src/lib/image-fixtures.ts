/**
 * Image fixtures built in code so tests carry no binary files. `TINY_JPEG`
 * is a real 6×4 baseline JPEG (macOS `sips`, quality 80).
 */

function crcTable() {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n++) {
    let c = n

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }

    table[n] = c >>> 0
  }

  return table
}

const CRC = crcTable()

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0

  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }

  return out
}

function be32(value: number) {
  return new Uint8Array([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])
}

export function ascii(text: string) {
  return new Uint8Array([...text].map((char) => char.charCodeAt(0)))
}

export function pngChunk({ type, data = new Uint8Array() }: { type: string; data?: Uint8Array }) {
  const typed = concat([ascii(type), data])
  let crc = 0xffffffff

  for (const byte of typed) {
    crc = CRC[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }

  return concat([be32(data.length), typed, be32((crc ^ 0xffffffff) >>> 0)])
}

export async function deflate({ bytes }: { bytes: Uint8Array }) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  }).pipeThrough(new CompressionStream('deflate') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const parts: Uint8Array[] = []

  for await (const part of stream as unknown as AsyncIterable<Uint8Array>) {
    parts.push(part)
  }

  return concat(parts)
}

export function pngHeader({
  width,
  height,
  bitDepth = 8,
  colorType = 6,
}: {
  width: number
  height: number
  bitDepth?: number
  colorType?: number
}) {
  return pngChunk({
    type: 'IHDR',
    data: concat([be32(width), be32(height), new Uint8Array([bitDepth, colorType, 0, 0, 0])]),
  })
}

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * An 8-bit RGBA PNG. `alpha` sets every pixel's alpha; `extra` chunks go
 * between IHDR and IDAT.
 */
export async function rgbaPng({
  width,
  height,
  alpha = 255,
  extra = [],
}: {
  width: number
  height: number
  alpha?: number
  extra?: Uint8Array[]
}) {
  const stride = 1 + width * 4
  const raw = new Uint8Array(stride * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw.set([(x * 37) & 255, (y * 59) & 255, 128, alpha], y * stride + 1 + x * 4)
    }
  }

  return concat([
    PNG_SIGNATURE,
    pngHeader({ width, height }),
    ...extra,
    pngChunk({ type: 'IDAT', data: await deflate({ bytes: raw }) }),
    pngChunk({ type: 'IEND' }),
  ])
}

export function base64Bytes(text: string) {
  const binary = atob(text)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export const TINY_JPEG = base64Bytes(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAA' +
  'A6ABAAMAAAABAAEAAKACAAQAAAABAAAABqADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMu' +
  'MAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAGAwEiAAIR' +
  'AQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAAB' +
  'fQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5' +
  'OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeo' +
  'qaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMB' +
  'AQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYS' +
  'QVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNU' +
  'VVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5' +
  'usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwQDAwME' +
  'BQQEBAQFBwUFBQUFBwgHBwcHBwcICAgICAgICAoKCgoKCgsLCwsLDQ0NDQ0NDQ0NDf/bAEMBAgIC' +
  'AwMDBgMDBg0JBwkNDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0N' +
  'DQ0NDf/dAAQAAf/aAAwDAQACEQMRAD8A434g+LP+FN2cmu6Fo2laqLOdNJtrPVbdpbWGCS81Wzyq' +
  'wPA5dbfQ7RFLOQP3rY3Ssa8i/wCGxvFX/QieB/8AwXXf/wAnV2H7T3/Iq3n/AGG4P/Tr4tr4SrGW' +
  'MrxjBRm0uWHV/wAqPnc/xdehj6lKjNxirWSbSWi2SP/Z',
)

/**
 * EXIF APP1 with Orientation 6, a GPS IFD and a description holding a
 * home location, for checking that private metadata is stripped.
 */
export function gpsExifSegment() {
  const secret = ascii('HOME 51.5074N 0.1278W\0')
  const ifd0Offset = 8
  const ifd0Size = 2 + 3 * 12 + 4
  const gpsOffset = ifd0Offset + ifd0Size
  const gpsSize = 2 + 1 * 12 + 4
  const secretOffset = gpsOffset + gpsSize
  const entry = (tag: number, type: number, count: number, value: Uint8Array) =>
    concat([new Uint8Array([tag >> 8, tag & 255, type >> 8, type & 255]), be32(count), value])
  const tiff = concat([
    ascii('MM'), new Uint8Array([0, 42]), be32(ifd0Offset),
    new Uint8Array([0, 3]),
    entry(0x010e, 2, secret.length, be32(secretOffset)),
    entry(0x0112, 3, 1, new Uint8Array([0, 6, 0, 0])),
    entry(0x8825, 4, 1, be32(gpsOffset)),
    be32(0),
    new Uint8Array([0, 1]),
    entry(0x0001, 2, 2, new Uint8Array([0x4e, 0, 0, 0])),
    be32(0),
    secret,
  ])
  const payload = concat([ascii('Exif\0\0'), tiff])
  const length = payload.length + 2
  return concat([new Uint8Array([0xff, 0xe1, length >> 8, length & 255]), payload])
}

/** Inserts JPEG segments straight after SOI. */
export function withJpegSegments({ jpeg, segments }: { jpeg: Uint8Array; segments: Uint8Array[] }) {
  return concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)])
}

export function includesBytes({ haystack, needle }: { haystack: Uint8Array; needle: Uint8Array }) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer
      }
    }

    return true
  }

  return false
}

export { concat as concatBytes }
