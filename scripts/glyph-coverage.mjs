import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

// Glyph coverage of the bundled text faces (#155), read from the fontsource
// files the studio ships: each @font-face's cmap, clipped to the
// unicode-range the browser uses that file for. Writes
// src/lib/glyph-coverage.gen.ts; the unit test fails until this has been
// run after a font package or weight changes.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The stylesheet each canonical face is drawn from (weights as bundled). */
export const FACE_SOURCES = {
  display: '@fontsource/cormorant-garamond/600.css',
  sans: '@fontsource/outfit/400.css',
}

function parseUnicodeRange(value) {
  return value.split(',').map((part) => {
    const [start, end = start] = part.trim().replace(/^U\+/i, '').split('-')
    return [Number.parseInt(start, 16), Number.parseInt(end, 16)]
  })
}

function fontFaces(cssPath) {
  const css = readFileSync(cssPath, 'utf8')
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
    const woff = /url\(([^)]+\.woff)\)/.exec(body)?.[1]
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]
    if (!woff) throw new Error(`no woff source in ${cssPath}`)
    return {
      file: join(dirname(cssPath), woff),
      ranges: range ? parseUnicodeRange(range) : [[0, 0x10ffff]],
    }
  })
}

/** One table's bytes from a WOFF 1.0 file. */
function woffTable(bytes, tag) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x774f4646) throw new Error('not a WOFF 1.0 file')
  const count = view.getUint16(12)

  for (let index = 0; index < count; index += 1) {
    const entry = 44 + index * 20
    if (String.fromCharCode(...bytes.subarray(entry, entry + 4)) !== tag) continue
    const offset = view.getUint32(entry + 4)
    const compLength = view.getUint32(entry + 8)
    const origLength = view.getUint32(entry + 12)
    const data = bytes.subarray(offset, offset + compLength)
    return compLength < origLength ? new Uint8Array(inflateSync(data)) : data
  }

  throw new Error(`no ${tag} table`)
}

/** Code points the cmap maps to a real glyph (format 12 or 4). */
function cmapCodePoints(cmap) {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
  const records = []

  for (let index = 0; index < view.getUint16(2); index += 1) {
    const record = 4 + index * 8
    records.push({
      platform: view.getUint16(record),
      encoding: view.getUint16(record + 2),
      offset: view.getUint32(record + 4),
    })
  }

  const pick =
    records.find((r) => view.getUint16(r.offset) === 12) ??
    records.find((r) => view.getUint16(r.offset) === 4 && (r.platform === 3 || r.platform === 0))
  if (!pick) throw new Error('no usable cmap subtable')

  const points = new Set()
  const at = pick.offset

  if (view.getUint16(at) === 12) {
    for (let group = 0; group < view.getUint32(at + 12); group += 1) {
      const entry = at + 16 + group * 12
      for (let c = view.getUint32(entry); c <= view.getUint32(entry + 4); c += 1) points.add(c)
    }
    return points
  }

  const segments = view.getUint16(at + 6) / 2
  const ends = at + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const rangeOffsets = deltas + segments * 2

  for (let segment = 0; segment < segments; segment += 1) {
    const start = view.getUint16(starts + segment * 2)
    const end = view.getUint16(ends + segment * 2)
    const delta = view.getInt16(deltas + segment * 2)
    const rangeOffset = view.getUint16(rangeOffsets + segment * 2)

    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff
      } else {
        glyph = view.getUint16(rangeOffsets + segment * 2 + rangeOffset + (c - start) * 2)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) points.add(c)
    }
  }

  return points
}

function toRanges(points) {
  const sorted = [...points].sort((a, b) => a - b)
  const ranges = []

  for (const c of sorted) {
    const last = ranges.at(-1)
    if (last && c === last[1] + 1) last[1] = c
    else ranges.push([c, c])
  }

  return ranges
}

/** Face → sorted, merged [first, last] code point ranges. */
export function deriveGlyphCoverage() {
  return Object.fromEntries(
    Object.entries(FACE_SOURCES).map(([face, source]) => {
      const covered = new Set()

      for (const { file, ranges } of fontFaces(join(root, 'node_modules', source))) {
        const inRange = (c) => ranges.some(([first, last]) => c >= first && c <= last)
        for (const c of cmapCodePoints(woffTable(readFileSync(file), 'cmap'))) {
          if (inRange(c)) covered.add(c)
        }
      }

      return [face, toRanges(covered)]
    }),
  )
}

export function renderGlyphCoverage(coverage = deriveGlyphCoverage()) {
  const faces = Object.entries(coverage)
    .map(([face, ranges]) => `  ${face}: [${ranges.map(([a, b]) => `${a},${b}`).join(',')}],`)
    .join('\n')
  const sources = Object.entries(FACE_SOURCES)
    .map(([face, source]) => ` *   ${face}: ${source}`)
    .join('\n')

  return `// Generated by scripts/glyph-coverage.mjs — do not edit by hand.
/**
 * Code points each bundled text face can draw, as flat
 * [first, last, first, last, …] inclusive ranges, from:
${sources}
 */
export const GLYPH_COVERAGE = {
${faces}
} as const
`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, 'src/lib/glyph-coverage.gen.ts'), renderGlyphCoverage())
}
