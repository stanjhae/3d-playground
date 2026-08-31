import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WIDTH = 480
const HEIGHT = 600

const LOOKS = [
  { id: 'look-midnight-silk', fill: [26, 28, 34], gown: [196, 161, 90] },
  { id: 'look-atelier-ivory', fill: [43, 36, 28], gown: [244, 234, 212] },
  { id: 'look-oxblood-evening', fill: [36, 16, 20], gown: [107, 29, 42] },
  { id: 'look-meadow-walk', fill: [28, 34, 24], gown: [107, 124, 74] },
  { id: 'look-slate-denim', fill: [26, 30, 34], gown: [61, 74, 85] },
  { id: 'look-wool-hour', fill: [28, 24, 20], gown: [43, 36, 28] },
  { id: 'look-blush-first', fill: [42, 32, 28], gown: [232, 196, 184] },
]

function crc32(bytes) {
  let crc = 0xffffffff

  for (const value of bytes) {
    crc ^= value

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const header = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crcBytes = Buffer.concat([header, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBytes))
  return Buffer.concat([length, crcBytes, crc])
}

function insideGown(x, y) {
  const nx = (x - WIDTH / 2) / (WIDTH * 0.18)
  const ny = y / HEIGHT

  if (ny < 0.12 || ny > 0.9) {
    return false
  }

  const waist = 0.38 + Math.sin((ny - 0.35) * Math.PI) * 0.18
  const flare = ny > 0.55 ? (ny - 0.55) * 0.7 : 0

  return Math.abs(nx) < waist + flare
}

function writePng(fill, gown) {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT)

  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * (WIDTH * 3 + 1)
    raw[row] = 0

    for (let x = 0; x < WIDTH; x += 1) {
      const vignette = 1 - Math.hypot(x / WIDTH - 0.5, y / HEIGHT - 0.45) * 0.45
      const glow = insideGown(x, y) ? gown : fill
      const i = row + 1 + x * 3
      raw[i] = Math.min(255, glow[0] * vignette)
      raw[i + 1] = Math.min(255, glow[1] * vignette)
      raw[i + 2] = Math.min(255, glow[2] * vignette)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(WIDTH, 0)
  ihdr.writeUInt32BE(HEIGHT, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'stills')
mkdirSync(outDir, { recursive: true })

for (const look of LOOKS) {
  const path = join(outDir, `${look.id}.png`)
  writeFileSync(path, writePng(look.fill, look.gown))
  console.log('wrote', path)
}
