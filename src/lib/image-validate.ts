/**
 * Server-side validation and normalization of uploaded originals (S02 #171).
 *
 * Pure JS (Web Streams + Web Crypto), so it runs in Node, Vercel functions
 * and tests without native image libraries. The bytes decide the type: the
 * filename and declared MIME are never consulted. Only static PNG and
 * baseline/progressive 8-bit JPEG are accepted. Metadata is removed by
 * rewriting the container, never by re-encoding pixels, so the normalized
 * image decodes to the same pixels as the upload.
 */

export const IMAGE_LIMITS = {
  /** Matches the `design-assets` bucket limit and `assets.byte_size`. */
  maxBytes: 10_485_760,
  maxDimension: 4096,
} as const

export type ImageMimeType = 'image/png' | 'image/jpeg'

export type ImageRejectReason =
  | 'unsupported_type'
  | 'too_large'
  | 'dimensions'
  | 'animated'
  | 'corrupt'

export type ValidatedImage = {
  mimeType: ImageMimeType
  /** Display size, after any JPEG orientation is applied. */
  width: number
  height: number
  /** Normalized bytes: metadata stripped, trailing data dropped. */
  bytes: Uint8Array
  byteSize: number
  /** Lowercase hex SHA-256 of `bytes`. */
  sha256: string
}

export type ImageValidation =
  | { ok: true; image: ValidatedImage }
  | { ok: false; reason: ImageRejectReason; message: string }

type Rejection = Extract<ImageValidation, { ok: false }>
type Normalized = Omit<ValidatedImage, 'byteSize' | 'sha256'>

function reject({
  reason,
  message,
}: {
  reason: ImageRejectReason
  message: string
}): Rejection {
  return { ok: false, reason, message }
}

const corrupt = (message: string) => reject({ reason: 'corrupt', message })

function concat({ parts }: { parts: Uint8Array[] }) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0

  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }

  return out
}

function u16({ bytes, at }: { bytes: Uint8Array; at: number }) {
  return (bytes[at]! << 8) | bytes[at + 1]!
}

function u32({ bytes, at }: { bytes: Uint8Array; at: number }) {
  return (
    ((bytes[at]! << 24) >>> 0) +
    (bytes[at + 1]! << 16) +
    (bytes[at + 2]! << 8) +
    bytes[at + 3]!
  )
}

function dimensionsIssue({ width, height }: { width: number; height: number }) {
  return width > IMAGE_LIMITS.maxDimension || height > IMAGE_LIMITS.maxDimension
    ? reject({
        reason: 'dimensions',
        message: `Images must be at most ${IMAGE_LIMITS.maxDimension}×${IMAGE_LIMITS.maxDimension} pixels`,
      })
    : null
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Chunks that affect how pixels render; everything else is dropped. */
const PNG_KEEP = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP',
])
const PNG_ANIMATION = new Set(['acTL', 'fcTL', 'fdAT'])

/** Allowed bit depths per colour type, and samples per pixel. */
const PNG_COLOR_TYPES: Record<number, { depths: number[]; channels: number }> = {
  0: { depths: [1, 2, 4, 8, 16], channels: 1 },
  2: { depths: [8, 16], channels: 3 },
  3: { depths: [1, 2, 4, 8], channels: 1 },
  4: { depths: [8, 16], channels: 2 },
  6: { depths: [8, 16], channels: 4 },
}

/** Adam7 pass origins and steps: [x0, y0, dx, dy]. */
const ADAM7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
  [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
] as const

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n++) {
    let c = n

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }

    table[n] = c >>> 0
  }

  return table
})()

export function crc32({ bytes }: { bytes: Uint8Array }) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

type PngHeader = {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

/** Byte length of each filtered scanline (filter byte included), in order. */
function pngRowSizes({ header }: { header: PngHeader }) {
  const bitsPerPixel = PNG_COLOR_TYPES[header.colorType]!.channels * header.bitDepth
  const rowBytes = (width: number) => 1 + Math.ceil((width * bitsPerPixel) / 8)
  const passes =
    header.interlace === 1 ? ADAM7 : ([[0, 0, 1, 1]] as const)
  const sizes: number[] = []

  for (const [x0, y0, dx, dy] of passes) {
    const width = Math.ceil((header.width - x0) / dx)
    const height = Math.ceil((header.height - y0) / dy)

    if (width > 0 && height > 0) {
      for (let row = 0; row < height; row++) {
        sizes.push(rowBytes(width))
      }
    }
  }

  return sizes
}

/**
 * Inflates the image data without keeping it, checking that it is exactly
 * as long as the header implies and that every scanline has a valid filter.
 * Output past the expected size aborts at once, so a decompression bomb
 * costs at most one chunk of extra work.
 */
async function checkPngData({
  header,
  data,
}: {
  header: PngHeader
  data: Uint8Array
}): Promise<Rejection | null> {
  const rowSizes = pngRowSizes({ header })
  const expected = rowSizes.reduce((sum, size) => sum + size, 0)
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  const reader = source
    .pipeThrough(new DecompressionStream('deflate') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .getReader()
  let produced = 0
  let row = 0
  let nextRow = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      while (row < rowSizes.length && nextRow < produced + value.length) {
        if (value[nextRow - produced]! > 4) {
          await reader.cancel().catch(() => undefined)
          return corrupt('PNG scanline has an invalid filter')
        }

        nextRow += rowSizes[row]!
        row++
      }

      produced += value.length

      if (produced > expected) {
        await reader.cancel().catch(() => undefined)
        return corrupt('PNG image data is larger than its header allows')
      }
    }
  } catch {
    return corrupt('PNG image data does not decompress')
  }

  return produced === expected ? null : corrupt('PNG image data is truncated')
}

async function normalizePng({
  bytes,
}: {
  bytes: Uint8Array
}): Promise<{ ok: true; image: Normalized } | Rejection> {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)]
  const idat: Uint8Array[] = []
  let header: PngHeader | null = null
  let sawPalette = false
  let idatState: 'before' | 'inside' | 'after' = 'before'
  let offset = 8

  for (;;) {
    if (offset + 12 > bytes.length) {
      return corrupt('PNG ends before its IEND chunk')
    }

    const length = u32({ bytes, at: offset })
    const end = offset + 12 + length

    if (length > 0x7fffffff || end > bytes.length) {
      return corrupt('PNG chunk runs past the end of the file')
    }

    const typeBytes = bytes.subarray(offset + 4, offset + 8)
    const type = String.fromCharCode(...typeBytes)
    const data = bytes.subarray(offset + 8, offset + 8 + length)

    if (!/^[A-Za-z]{4}$/.test(type)) {
      return corrupt('PNG chunk type is invalid')
    }

    if (crc32({ bytes: bytes.subarray(offset + 4, offset + 8 + length) }) !== u32({ bytes, at: offset + 8 + length })) {
      return corrupt(`PNG ${type} chunk checksum does not match`)
    }

    if (!header && type !== 'IHDR') {
      return corrupt('PNG must start with IHDR')
    }

    if (PNG_ANIMATION.has(type)) {
      return reject({ reason: 'animated', message: 'Animated images are not supported' })
    }

    if (idatState === 'inside' && type !== 'IDAT') {
      idatState = 'after'
    }

    if (type === 'IHDR') {
      if (header || length !== 13) {
        return corrupt('PNG IHDR is invalid')
      }

      header = {
        width: u32({ bytes: data, at: 0 }),
        height: u32({ bytes: data, at: 4 }),
        bitDepth: data[8]!,
        colorType: data[9]!,
        interlace: data[12]!,
      }
      const color = PNG_COLOR_TYPES[header.colorType]

      if (
        header.width === 0 || header.height === 0 ||
        !color || !color.depths.includes(header.bitDepth) ||
        data[10] !== 0 || data[11] !== 0 || header.interlace > 1
      ) {
        return corrupt('PNG IHDR is invalid')
      }

      const tooBig = dimensionsIssue(header)

      if (tooBig) {
        return tooBig
      }
    } else if (type === 'PLTE') {
      if (sawPalette || idatState !== 'before' || length === 0 || length % 3 !== 0) {
        return corrupt('PNG palette is invalid')
      }

      sawPalette = true
    } else if (type === 'IDAT') {
      if (idatState === 'after') {
        return corrupt('PNG image data is not contiguous')
      }

      idatState = 'inside'
      idat.push(data)
    } else if (type === 'IEND') {
      kept.push(bytes.subarray(offset, end))
      break
    } else if (!PNG_KEEP.has(type) && (typeBytes[0]! & 0x20) === 0) {
      return reject({ reason: 'unsupported_type', message: `PNG uses an unsupported ${type} chunk` })
    }

    if (PNG_KEEP.has(type)) {
      kept.push(bytes.subarray(offset, end))
    }

    offset = end
  }

  if (!header || idat.length === 0) {
    return corrupt('PNG has no image data')
  }

  if (header.colorType === 3 && !sawPalette) {
    return corrupt('PNG palette is missing')
  }

  const dataIssue = await checkPngData({ header, data: concat({ parts: idat }) })

  if (dataIssue) {
    return dataIssue
  }

  return {
    ok: true,
    image: {
      mimeType: 'image/png',
      width: header.width,
      height: header.height,
      bytes: concat({ parts: kept }),
    },
  }
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const JPEG_SOF_SUPPORTED = new Set([0xc0, 0xc1, 0xc2])
const JPEG_KEEP = new Set([0xc4, 0xcc, 0xdb, 0xdd])

function isSof(marker: number) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function startsWith({ bytes, text }: { bytes: Uint8Array; text: string }) {
  return [...text].every((char, index) => bytes[index] === char.charCodeAt(0))
}

/** Reads the TIFF Orientation tag from an `Exif\0\0` APP1 payload, or 1. */
export function exifOrientation({ data }: { data: Uint8Array }) {
  if (!startsWith({ bytes: data, text: 'Exif\0\0' }) || data.length < 14) {
    return 1
  }

  const tiff = data.subarray(6)
  const little = tiff[0] === 0x49 && tiff[1] === 0x49

  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) {
    return 1
  }

  const read16 = (at: number) => (little ? tiff[at]! | (tiff[at + 1]! << 8) : u16({ bytes: tiff, at }))
  const read32 = (at: number) =>
    little
      ? (tiff[at]! | (tiff[at + 1]! << 8) | (tiff[at + 2]! << 16) | (tiff[at + 3]! << 24)) >>> 0
      : u32({ bytes: tiff, at })
  const ifd = read32(4)

  if (read16(2) !== 42 || ifd + 2 > tiff.length) {
    return 1
  }

  const count = read16(ifd)

  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12

    if (entry + 12 > tiff.length) {
      return 1
    }

    if (read16(entry) === 0x0112 && read16(entry + 2) === 3) {
      const value = read16(entry + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }

  return 1
}

/** A minimal APP1 carrying only the Orientation tag (big-endian TIFF). */
function orientationSegment({ orientation }: { orientation: number }) {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
}

/** End of an entropy-coded segment: the offset of the next real marker. */
function scanEnd({ bytes, from }: { bytes: Uint8Array; from: number }) {
  let at = from

  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at++
      continue
    }

    const next = bytes[at + 1]!

    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      at += 2
      continue
    }

    return at
  }

  return -1
}

function normalizeJpeg({
  bytes,
}: {
  bytes: Uint8Array
}): { ok: true; image: Normalized } | Rejection {
  const kept: Uint8Array[] = []
  let frame: { width: number; height: number } | null = null
  let sawScan = false
  let orientation = 1
  let offset = 2

  for (;;) {
    if (offset + 1 >= bytes.length || bytes[offset] !== 0xff) {
      return corrupt('JPEG ends before its end-of-image marker')
    }

    while (bytes[offset + 1] === 0xff && offset + 2 < bytes.length) {
      offset++
    }

    const marker = bytes[offset + 1]!

    if (marker === 0xd9) {
      if (!frame || !sawScan) {
        return corrupt('JPEG has no image data')
      }

      kept.push(bytes.subarray(offset, offset + 2))
      break
    }

    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      return corrupt('JPEG has a misplaced marker')
    }

    if (offset + 4 > bytes.length) {
      return corrupt('JPEG segment is truncated')
    }

    const length = u16({ bytes, at: offset + 2 })
    const end = offset + 2 + length

    if (length < 2 || end > bytes.length) {
      return corrupt('JPEG segment runs past the end of the file')
    }

    const segment = bytes.subarray(offset, end)
    const data = bytes.subarray(offset + 4, end)

    if (isSof(marker)) {
      if (frame) {
        return corrupt('JPEG has more than one frame')
      }

      if (!JPEG_SOF_SUPPORTED.has(marker)) {
        return reject({ reason: 'unsupported_type', message: 'This JPEG encoding is not supported' })
      }

      const components = data[5] ?? 0

      if (data.length < 6 || data.length !== 6 + components * 3) {
        return corrupt('JPEG frame header is invalid')
      }

      if (data[0] !== 8 || (components !== 1 && components !== 3)) {
        return reject({ reason: 'unsupported_type', message: 'Only 8-bit greyscale or colour JPEGs are supported' })
      }

      frame = { height: u16({ bytes: data, at: 1 }), width: u16({ bytes: data, at: 3 }) }

      if (frame.width === 0 || frame.height === 0) {
        return reject({ reason: 'unsupported_type', message: 'JPEG has no declared height' })
      }

      const tooBig = dimensionsIssue(frame)

      if (tooBig) {
        return tooBig
      }

      kept.push(segment)
    } else if (marker === 0xda) {
      if (!frame) {
        return corrupt('JPEG scan comes before its frame header')
      }

      const scan = scanEnd({ bytes, from: end })

      if (scan < 0) {
        return corrupt('JPEG ends inside its image data')
      }

      kept.push(bytes.subarray(offset, scan))
      sawScan = true
      offset = scan
      continue
    } else if (JPEG_KEEP.has(marker)) {
      kept.push(segment)
    } else if (marker === 0xe1) {
      orientation = orientation === 1 ? exifOrientation({ data }) : orientation
    } else if (
      (marker === 0xe2 && startsWith({ bytes: data, text: 'ICC_PROFILE\0' })) ||
      (marker === 0xee && startsWith({ bytes: data, text: 'Adobe' }))
    ) {
      // Colour profile and colour transform change how pixels decode.
      kept.push(segment)
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // Other APPn (EXIF, XMP, IPTC, JFIF thumbnails) and comments: drop.
    } else {
      return reject({ reason: 'unsupported_type', message: 'JPEG uses an unsupported segment' })
    }

    offset = end
  }

  if (!frame) {
    return corrupt('JPEG has no frame header')
  }

  const rotated = orientation >= 5

  return {
    ok: true,
    image: {
      mimeType: 'image/jpeg',
      width: rotated ? frame.height : frame.width,
      height: rotated ? frame.width : frame.height,
      bytes: concat({
        parts: [
          bytes.subarray(0, 2),
          ...(orientation > 1 ? [orientationSegment({ orientation })] : []),
          ...kept,
        ],
      }),
    },
  }
}

// ---------------------------------------------------------------------------

export async function sha256Hex({ bytes }: { bytes: Uint8Array }) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function validateImage({
  bytes,
}: {
  bytes: Uint8Array
}): Promise<ImageValidation> {
  if (bytes.length > IMAGE_LIMITS.maxBytes) {
    return reject({ reason: 'too_large', message: 'Images must be 10 MB or smaller' })
  }

  const isPng = bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

  if (!isPng && !isJpeg) {
    return reject({ reason: 'unsupported_type', message: 'Only PNG and JPEG images are supported' })
  }

  const result = isPng ? await normalizePng({ bytes }) : normalizeJpeg({ bytes })

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    image: {
      ...result.image,
      byteSize: result.image.bytes.length,
      sha256: await sha256Hex({ bytes: result.image.bytes }),
    },
  }
}
