import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const WIDTH = 1200
const HEIGHT = 630
const BG = [0x2a, 0x23, 0x1c]
const LINE = [0xc4, 0xa1, 0x5a]
const INSET = 48

function crc32Buffer({ bytes }) {
  let crc = ~0

  for (const value of bytes) {
    crc ^= value

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }

  return ~crc >>> 0
}

function pngChunk({ type, data }) {
  const typeBytes = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([typeBytes, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32Buffer({ bytes: body }))
  return Buffer.concat([length, body, crc])
}

function bakeOgPng() {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT)

  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * (WIDTH * 3 + 1)
    raw[row] = 0

    for (let x = 0; x < WIDTH; x += 1) {
      const onVertical =
        (x === INSET || x === WIDTH - INSET - 1) &&
        y >= INSET &&
        y < HEIGHT - INSET
      const onHorizontal =
        (y === INSET || y === HEIGHT - INSET - 1) &&
        x >= INSET &&
        x < WIDTH - INSET
      const color = onVertical || onHorizontal ? LINE : BG
      const index = row + 1 + x * 3
      raw[index] = color[0]
      raw[index + 1] = color[1]
      raw[index + 2] = color[2]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(WIDTH, 0)
  ihdr.writeUInt32BE(HEIGHT, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk({ type: 'IHDR', data: ihdr }),
    pngChunk({ type: 'IDAT', data: deflateSync(raw) }),
    pngChunk({ type: 'IEND', data: Buffer.alloc(0) }),
  ])
}

writeFileSync(resolve('public/og-default.png'), bakeOgPng())
