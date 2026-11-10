import { describe, expect, test } from 'vitest'

import type { PanelId, Stroke } from './design-document'
import { type AtlasBuffer, createAtlasBuffer, drawStroke } from './paint-atlas'
import { atlasPixelForUv, atlasSourceRect, panelPointToUv } from './panel-uv'

/**
 * A2: strokes are drawn by covering each pixel once. This pins that to the
 * plain method it replaced, stamping every dot in turn, kept here verbatim
 * as the reference: same pixels for any width, pressure, colour, eraser and
 * panel edge.
 */

function referenceWrite({ buffer, index, r, g, b, a, erase }: {
  buffer: AtlasBuffer
  index: number
  r: number
  g: number
  b: number
  a: number
  erase: boolean
}) {
  if (buffer.clip) {
    const pixel = index / 4
    const column = pixel % buffer.width
    const row = Math.floor(pixel / buffer.width)
    const { x0, y0, x1, y1 } = buffer.clip
    if (column < x0 || column >= x1 || row < y0 || row >= y1) return
  }

  const p = buffer.pixels
  if (erase) {
    p[index] = p[index + 1] = p[index + 2] = p[index + 3] = 0
    return
  }

  const destA = p[index + 3]!
  const srcA = a / 255
  const outA = srcA + (destA / 255) * (1 - srcA)
  if (outA <= 0) {
    p[index] = p[index + 1] = p[index + 2] = p[index + 3] = 0
    return
  }
  p[index] = Math.round((r * srcA + p[index]! * (destA / 255) * (1 - srcA)) / outA)
  p[index + 1] = Math.round((g * srcA + p[index + 1]! * (destA / 255) * (1 - srcA)) / outA)
  p[index + 2] = Math.round((b * srcA + p[index + 2]! * (destA / 255) * (1 - srcA)) / outA)
  p[index + 3] = Math.round(outA * 255)
}

function rgba({ color }: { color: string }) {
  const hex = color.replace('#', '')
  const value = Number.parseInt(hex.slice(0, 6), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255 }
}

function referenceDraw({ buffer, stroke }: { buffer: AtlasBuffer; stroke: Stroke }) {
  const points = stroke.points.length === 1 ? [stroke.points[0]!, stroke.points[0]!] : stroke.points
  const disks: { column: number; row: number; radius: number }[] = []

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    const start = panelPointToUv({ panel: stroke.panel, x: from.x, y: from.y })
    const end = panelPointToUv({ panel: stroke.panel, x: to.x, y: to.y })
    const steps = Math.max(1, Math.ceil(Math.hypot(end.u - start.u, end.v - start.v) * buffer.width * 1.4))
    const radius = stroke.width * (0.55 + (to.p ?? from.p ?? 0.7) * 0.7)

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      disks.push({
        ...atlasPixelForUv({ u: start.u + (end.u - start.u) * t, v: start.v + (end.v - start.v) * t, width: buffer.width, height: buffer.height }),
        radius: Math.max(1, Math.round(radius * buffer.width)),
      })
    }
  }

  const { r, g, b, a } = rgba({ color: stroke.color })
  const erase = stroke.tool === 'eraser'
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < buffer.width && y < buffer.height

  if (erase || a >= 255) {
    // Every dot stamped in turn.
    for (const { column, row, radius } of disks) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy <= radius * radius && inside(column + dx, row + dy)) {
            referenceWrite({ buffer, index: ((row + dy) * buffer.width + column + dx) * 4, r, g, b, a, erase })
          }
        }
      }
    }
    return
  }

  // Translucent: each covered pixel composited once.
  const covered = new Set<number>()
  for (const { column, row, radius } of disks) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy <= radius * radius && inside(column + dx, row + dy)) {
          covered.add((row + dy) * buffer.width + column + dx)
        }
      }
    }
  }
  for (const pixel of [...covered].sort((left, right) => left - right)) {
    referenceWrite({ buffer, index: pixel * 4, r, g, b, a, erase: false })
  }
}

/** Deterministic pseudo-random numbers, so a failure always reproduces. */
function random({ seed }: { seed: number }) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const PANELS: PanelId[] = ['front', 'back', 'left', 'right']
const COLORS = ['#1a1c22', '#c0392b', '#1f6feb80', '#f4d03f33', '#2e7d32ee']

function randomStroke({ next, index }: { next: () => number; index: number }): Stroke {
  const count = 1 + Math.floor(next() * 14)
  const pressure = next() < 0.5

  return {
    id: `s${index}`,
    panel: PANELS[index % PANELS.length]!,
    tool: next() < 0.2 ? 'eraser' : 'brush',
    color: COLORS[Math.floor(next() * COLORS.length)]!,
    // Hairline to very thick.
    width: 0.001 + next() ** 2 * 0.15,
    points: Array.from({ length: count }, () => ({
      // Some points well off the panel, to exercise its edges.
      x: -0.3 + next() * 1.6,
      y: -0.3 + next() * 1.6,
      ...(pressure ? { p: next() } : {}),
    })),
  }
}

function clipped({ buffer, panel }: { buffer: AtlasBuffer; panel: PanelId }): AtlasBuffer {
  const rect = atlasSourceRect({ panel, width: buffer.width, height: buffer.height })
  return {
    ...buffer,
    clip: {
      x0: Math.round(rect.sourceX),
      y0: Math.round(rect.sourceY),
      x1: Math.round(rect.sourceX + rect.sourceWidth),
      y1: Math.round(rect.sourceY + rect.sourceHeight),
    },
  }
}

function firstDifference({ a, b }: { a: AtlasBuffer; b: AtlasBuffer }) {
  for (let index = 0; index < a.pixels.length; index += 1) {
    if (a.pixels[index] !== b.pixels[index]) return index
  }
  return -1
}

describe('stroke cover (A2)', () => {
  test.each([
    [64, 1],
    [160, 2],
    [256, 3],
  ])('200 random strokes at %i px, clipped and unclipped, match dot stamping', (size, seed) => {
    const next = random({ seed })

    for (const clip of [true, false]) {
      const fast = createAtlasBuffer({ width: size, height: size })
      const slow = createAtlasBuffer({ width: size, height: size })

      // Strokes land on what earlier ones drew, so translucency and erasers
      // meet real ink beneath.
      for (let index = 0; index < 200; index += 1) {
        const stroke = randomStroke({ next, index })
        drawStroke({ buffer: clip ? clipped({ buffer: fast, panel: stroke.panel }) : fast, stroke })
        referenceDraw({ buffer: clip ? clipped({ buffer: slow, panel: stroke.panel }) : slow, stroke })

        expect({ index, at: firstDifference({ a: fast, b: slow }) }).toEqual({ index, at: -1 })
      }
    }
  })

  test('a very long stroke draws, rather than overflowing the call stack', () => {
    const buffer = createAtlasBuffer({ width: 512, height: 512 })
    const points = Array.from({ length: 4096 }, (_, index) => ({ x: (index % 2) * 0.9 + 0.05, y: index / 4096 }))

    expect(() => drawStroke({ buffer, stroke: { id: 'long', panel: 'front', tool: 'brush', color: '#1a1c2280', width: 0.02, points } })).not.toThrow()
    expect(buffer.pixels.some((value) => value > 0)).toBe(true)
  })
})
