// Draws the colour maps for the linen, satin, jersey, chiffon and canvas
// render fabrics: public/fabrics/<mapId>.png. Run `pnpm fabric-maps` after
// changing a map here.
//
// Each map is computed from a formula in this file, so it is original to this
// project and carries no third-party rights (docs/asset-rights.md). The maps
// are near-white: the preset's colour tints them, so one map serves every
// colourway. Each tile repeats without a seam (every period divides SIZE) and
// stays at or under MAX_BYTES (checked here and in src/lib/fabrics.test.ts).
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SIZE = 128
const MAX_BYTES = 64 * 1024
const TAU = Math.PI * 2

/** Deterministic 0–1 hash of a lattice point, wrapped to `period`. */
function hash({ x, y, period, seed }) {
  const wx = ((x % period) + period) % period
  const wy = ((y % period) + period) % period
  let h = (wx * 374761393 + wy * 668265263 + seed * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Smooth value noise that tiles: `cells` lattice cells across the map. */
function noise({ x, y, cells, seed }) {
  const fx = (x / SIZE) * cells
  const fy = (y / SIZE) * cells
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const at = (dx, dy) => hash({ x: x0 + dx, y: y0 + dy, period: cells, seed })
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * sx
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * sx
  return top + (bottom - top) * sy
}

/** Per-thread variation: one value per row (or column) of `period` texels. */
function thread({ index, period, seed }) {
  return hash({ x: Math.floor(index / period), y: 0, period: SIZE / period, seed })
}

const clamp = (value) => Math.min(1, Math.max(0, value))

/** Plain weave with slubs: uneven, thick-and-thin yarns. */
function linenSlub({ x, y }) {
  const period = 4
  const over = (Math.floor(x / period) + Math.floor(y / period)) % 2 === 0
  const warp = Math.sin((TAU * x) / period) * 0.5 + 0.5
  const weft = Math.sin((TAU * y) / period) * 0.5 + 0.5
  const yarn = over ? weft : warp
  const slub = noise({ x: x * 4, y, cells: 8, seed: 11 }) * 0.6 + thread({ index: y, period, seed: 3 }) * 0.4
  return 0.8 + yarn * 0.08 + (slub - 0.5) * 0.14
}

/** Long weft floats: smooth, bright, with faint horizontal streaks. */
function satinSheen({ x, y }) {
  const float = Math.sin((TAU * (y + Math.floor(x / 16) * 0.5)) / 2) * 0.5 + 0.5
  const streak = noise({ x, y: y * 8, cells: 16, seed: 5 })
  return 0.9 + float * 0.03 + (streak - 0.5) * 0.08
}

/** Jersey: columns of V-shaped knit loops. */
function jerseyKnit({ x, y }) {
  const column = 4
  const row = 4
  const cx = (x % column) - column / 2 + 0.5
  const loop = Math.abs(cx) / (column / 2)
  const v = ((y + Math.abs(cx) * 1.2) % row) / row
  const stitch = Math.sin(v * Math.PI)
  const heather = noise({ x, y, cells: 32, seed: 9 })
  return 0.78 + stitch * 0.12 * (1 - loop * 0.4) + (heather - 0.5) * 0.08
}

/** Gauze: fine crossed threads with open gaps between them. */
function chiffonGauze({ x, y }) {
  const period = 4
  const warp = Math.abs(Math.cos((Math.PI * x) / (period / 2)))
  const weft = Math.abs(Math.cos((Math.PI * y) / (period / 2)))
  const threadValue = Math.max(warp, weft) ** 3
  const drift = noise({ x, y, cells: 8, seed: 21 })
  return 0.82 + threadValue * 0.14 + (drift - 0.5) * 0.06
}

/** Canvas duck: coarse plain weave of heavy, uneven yarns. */
function canvasDuck({ x, y }) {
  const period = 4
  const over = (Math.floor(x / period) + Math.floor(y / period)) % 2 === 0
  const warp = Math.sin((Math.PI * (x % period + 0.5)) / period)
  const weft = Math.sin((Math.PI * (y % period + 0.5)) / period)
  const yarn = over ? weft : warp
  const grit = hash({ x, y, period: SIZE, seed: 31 })
  const slub = thread({ index: over ? y : x, period: 2, seed: 17 })
  return 0.68 + yarn * 0.22 + (grit - 0.5) * 0.1 + (slub - 0.5) * 0.08
}

/** Each map: its formula and a slight warm or cool cast for the white. */
export const FABRIC_MAPS = [
  { id: 'linen-slub', shade: linenSlub, tint: [1, 0.985, 0.955] },
  { id: 'satin-sheen', shade: satinSheen, tint: [1, 1, 1] },
  { id: 'jersey-knit', shade: jerseyKnit, tint: [1, 1, 1] },
  { id: 'chiffon-gauze', shade: chiffonGauze, tint: [1, 1, 1] },
  { id: 'canvas-duck', shade: canvasDuck, tint: [1, 0.98, 0.94] },
]

let crcTable

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)

    for (let n = 0; n < 256; n += 1) {
      let c = n

      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }

      crcTable[n] = c >>> 0
    }
  }

  let crc = 0xffffffff

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** An 8-bit RGB PNG, each row with the Sub filter (smaller for smooth tiles). */
function encodePng({ rgb }) {
  const stride = SIZE * 3
  const raw = Buffer.alloc((stride + 1) * SIZE)

  for (let y = 0; y < SIZE; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 1

    for (let i = 0; i < stride; i += 1) {
      const left = i >= 3 ? rgb[y * stride + i - 3] : 0
      raw[row + 1 + i] = (rgb[y * stride + i] - left) & 0xff
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function renderMap({ shade, tint }) {
  const rgb = new Uint8Array(SIZE * SIZE * 3)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const value = clamp(shade({ x, y }))
      const at = (y * SIZE + x) * 3

      for (let c = 0; c < 3; c += 1) {
        rgb[at + c] = Math.round(clamp(value * tint[c]) * 255)
      }
    }
  }

  return encodePng({ rgb })
}

const out = new URL('../public/fabrics/', import.meta.url)

for (const map of FABRIC_MAPS) {
  const png = renderMap(map)

  if (png.length > MAX_BYTES) {
    throw new Error(`${map.id}.png is ${png.length} bytes, over the ${MAX_BYTES}-byte cap`)
  }

  writeFileSync(new URL(`${map.id}.png`, out), png)
  console.log(`public/fabrics/${map.id}.png  ${png.length} bytes`)
}
