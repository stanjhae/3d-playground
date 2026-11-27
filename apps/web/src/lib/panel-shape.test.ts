import { describe, expect, it, test } from 'vitest'

import { cleanPanelShape, cleanSleevePair, panelTriangles } from './panel-shape'

describe('panelTriangles', () => {
  const rect = { u0: 0.5, v0: 0, u1: 1, v1: 0.5 }

  it('keeps triangles inside the panel rectangle, in panel coordinates', () => {
    // Two triangles: one inside the rect, one with an unprinted corner (−1, −1).
    const uvs = [0.5, 0, 1, 0, 0.75, 0.5, 0.6, 0.1, -1, -1, 0.7, 0.2]
    expect(panelTriangles({ uvs, index: null, rect })).toEqual([0, 0, 1, 0, 0.5, 1])
  })

  it('reads indexed geometry', () => {
    const uvs = [0.5, 0, 1, 0, 0.75, 0.5, 0.1, 0.9]
    expect(panelTriangles({ uvs, index: [0, 1, 2, 0, 1, 3], rect })).toEqual([0, 0, 1, 0, 0.5, 1])
  })
})

describe('clean side outlines', () => {
  /** Area covered by panel-space triangles. */
  const coverage = (triangles: number[]) => {
    let sum = 0

    for (let t = 0; t + 5 < triangles.length; t += 6) {
      const [ax, ay, bx, by, cx, cy] = triangles.slice(t, t + 6) as [number, number, number, number, number, number]
      sum += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2
    }

    return sum
  }

  // A ragged, lopsided rectangle: a notch bitten out of its right edge.
  const ragged = [0.2, 0.1, 0.8, 0.1, 0.8, 0.5, 0.2, 0.1, 0.8, 0.5, 0.2, 0.9, 0.2, 0.9, 0.8, 0.5, 0.74, 0.9]

  test('keeps the shape it was given, about as large, with a new smooth edge', () => {
    const clean = cleanPanelShape({ triangles: ragged, symmetric: false })
    // Traced and rounded, not handed back as it came.
    expect(clean).not.toEqual(ragged)
    expect(clean.length).toBeGreaterThan(ragged.length * 3)
    expect(clean.length % 6).toBe(0)
    expect(coverage(clean)).toBeGreaterThan(coverage(ragged) * 0.85)
    expect(coverage(clean)).toBeLessThan(coverage(ragged) * 1.15)
    expect(Math.min(...clean)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...clean)).toBeLessThanOrEqual(1)
  })

  test('a front or back comes out mirror-symmetric', () => {
    const clean = cleanPanelShape({ triangles: ragged, symmetric: true })
    expect(clean).not.toEqual(ragged)
    expect(coverage(clean)).toBeGreaterThan(coverage(ragged) * 0.8)
    const xs = clean.filter((_, index) => index % 2 === 0)
    // Its left and right edges sit the same distance from the centre line.
    expect(0.5 - Math.min(...xs)).toBeCloseTo(Math.max(...xs) - 0.5, 1)
  })

  test('keeps every piece of real size on a panel (a bodice above a skirt), but not a speck', () => {
    const box = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]
    const skirt = box(0.1, 0.05, 0.9, 0.45)
    const bodice = box(0.3, 0.55, 0.7, 0.95)
    const speck = box(0.02, 0.97, 0.04, 0.99)
    const clean = cleanPanelShape({ triangles: [...skirt, ...bodice, ...speck], symmetric: false })
    const ys = clean.filter((_, index) => index % 2 === 1)

    expect(Math.max(...ys)).toBeGreaterThan(0.9)
    expect(Math.max(...ys)).toBeLessThan(0.96)
    expect(Math.min(...ys)).toBeLessThan(0.1)
    expect(coverage(clean)).toBeGreaterThan((coverage(skirt) + coverage(bodice)) * 0.85)
  })

  test('the two sleeves share one smooth outline, the right\'s flipped across (round 2: uneven sleeve templates)', () => {
    const box = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]
    // The model's sleeves hang differently: the left reaches a little higher,
    // the right a little further round at its far end, and neither is the other's mirror.
    const left = [...box(0.05, 0.1, 0.95, 0.85), ...ragged]
    const right = [...box(0.08, 0.05, 0.9, 0.8)]
    const pair = cleanSleevePair({ left, right })
    const flip = (triangles: number[]) => triangles.map((value, index) => (index % 2 === 0 ? 1 - value : value))

    expect(pair.right).toEqual(flip(pair.left))
    expect(pair.left.length).toBeGreaterThan(36)
    // Smooth, and covering about what the two cover together.
    expect(coverage(pair.left)).toBeGreaterThan(coverage(box(0.08, 0.1, 0.92, 0.8)) * 0.9)
    expect(coverage(pair.left)).toBeLessThan(coverage(box(0.05, 0.05, 0.95, 0.85)) * 1.05)
  })

  test('too little to trace is returned as it came', () => {
    expect(cleanPanelShape({ triangles: [0, 0, 1, 0], symmetric: true })).toEqual([0, 0, 1, 0])
  })
})
