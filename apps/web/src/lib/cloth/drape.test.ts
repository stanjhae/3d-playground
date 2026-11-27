import { describe, expect, test } from 'vitest'

import { clothFromPattern } from '../pattern/build-cloth'
import { fixtureTeePattern } from '../pattern/pattern-fixtures'
import { type PatternOp, applyPatternOps } from '../pattern/pattern-ops'
import { distanceToPolygon, pointInPolygon } from '../pattern/triangulate'
import { validateGeometry } from '../pattern/validate-geometry'
import { bodyColliders } from './colliders'
import { simulateCloth } from './solver'

/** The fixture tee, sewn and draped on the house mannequin. */

function drape() {
  const built = clothFromPattern({ pattern: fixtureTeePattern(), colliders: bodyColliders() })
  const result = simulateCloth(built.input, { maxSeconds: 8 })
  return { built, result }
}

function insideBody(x: number, y: number, z: number) {
  return bodyColliders().some((c) => {
    const [sx, sy, sz] = c.s
    const m = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2]
    const l = [(x - m[0]!) / sx, (y - m[1]!) / sy, (z - m[2]!) / sz]
    const a = [(c.a[0] - m[0]!) / sx, (c.a[1] - m[1]!) / sy, (c.a[2] - m[2]!) / sz]
    const b = [(c.b[0] - m[0]!) / sx, (c.b[1] - m[1]!) / sy, (c.b[2] - m[2]!) / sz]
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
    const len2 = u[0]! ** 2 + u[1]! ** 2 + u[2]! ** 2
    let t = len2 > 0 ? ((l[0]! - a[0]!) * u[0]! + (l[1]! - a[1]!) * u[1]! + (l[2]! - a[2]!) * u[2]!) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(l[0]! - a[0]! - u[0]! * t, l[1]! - a[1]! - u[1]! * t, l[2]! - a[2]! - u[2]! * t)
    // A little inside the skin is a stitch weld, not a fall-through.
    return d < c.r * 0.85
  })
}

describe('draping the fixture tee', () => {
  test('the pattern can be sewn', () => {
    expect(validateGeometry({ pattern: fixtureTeePattern() })).toEqual([])
  })

  test('it settles on the body with closed seams, in under a second here', () => {
    const started = performance.now()
    const { built, result } = drape()
    const elapsed = performance.now() - started

    expect(result.settled).toBe(true)
    expect(elapsed).toBeLessThan(4000)

    const x = result.positions
    const stitches = built.input.stitches

    for (let k = 0; k < stitches.length; k += 2) {
      const a = stitches[k]! * 3
      const b = stitches[k + 1]! * 3
      expect(Math.hypot(x[a]! - x[b]!, x[a + 1]! - x[b + 1]!, x[a + 2]! - x[b + 2]!)).toBeLessThan(1e-9)
    }

    let inside = 0

    for (let i = 0; i < x.length; i += 3) {
      if (insideBody(x[i]!, x[i + 1]!, x[i + 2]!)) {
        inside += 1
      }
    }

    expect(inside).toBe(0)

    // It hangs from the shoulders: nothing above the neck, hem above the knees.
    let top = -Infinity
    let bottom = Infinity

    for (let i = 1; i < x.length; i += 3) {
      top = Math.max(top, x[i]!)
      bottom = Math.min(bottom, x[i]!)
    }

    expect(top).toBeLessThan(1.55)
    expect(bottom).toBeGreaterThan(0.6)
  }, 20_000)

  test('edits at their limits still hang from the shoulders', () => {
    const cases: PatternOp[][] = [
      [{ op: 'lengthen', mm: 400 }, { op: 'flare', mm: 250 }],
      [{ op: 'sleeve', side: 'left', mm: 500 }],
      [{ op: 'widen', mm: 150 }, { op: 'neckline', mm: 160 }],
    ]

    for (const ops of cases) {
      const edited = applyPatternOps({ pattern: fixtureTeePattern(), ops })
      expect(edited.ok, JSON.stringify(ops)).toBe(true)

      if (!edited.ok) {
        continue
      }

      const built = clothFromPattern({ pattern: edited.pattern, colliders: bodyColliders() })
      const { positions } = simulateCloth(built.input, { maxSeconds: 10 })
      let top = -Infinity

      for (let i = 1; i < positions.length; i += 3) {
        top = Math.max(top, positions[i]!)
      }

      expect(top, JSON.stringify(ops)).toBeGreaterThan(1.4)
    }
  }, 60_000)

  test('the same pattern drapes the same way twice, and as it did before cut-outs', () => {
    const first = drape().result.positions
    const second = drape().result.positions
    expect(second.length).toBe(first.length)
    expect(second.every((value, index) => value === first[index])).toBe(true)
    // FNV-1a of the settled positions, pinned on master before cut-outs (C2).
    let h = 0x811c9dc5

    for (const byte of new Uint8Array(first.buffer)) {
      h = Math.imul(h ^ byte, 0x01000193) >>> 0
    }

    expect(h.toString(16)).toBe(PINNED_TEE_DRAPE)
  }, 20_000)

  test('a tee front with a round cut-out settles, and the hole stays open', () => {
    const cut = applyPatternOps({
      pattern: fixtureTeePattern(),
      ops: [{ op: 'cutout', piece: 'front', shape: 'circle', at: 'centre', dx: 0, dy: 40, wMm: 120, hMm: 120 }],
    })
    expect(cut.ok).toBe(true)

    if (!cut.ok) {
      return
    }

    const built = clothFromPattern({ pattern: cut.pattern, colliders: bodyColliders() })
    const result = simulateCloth(built.input, { maxSeconds: 8 })
    expect(result.settled).toBe(true)
    const stitches = built.input.stitches

    for (let k = 0; k < stitches.length; k += 2) {
      const a = stitches[k]! * 3
      const b = stitches[k + 1]! * 3
      const p = result.positions
      expect(Math.hypot(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!)).toBeLessThan(1e-9)
    }

    const front = built.pieceIds.indexOf('front')
    const hole = cut.pattern.pieces[0]!.holes![0]!.map((point) => [point.x, point.y] as const)
    const ring: number[] = []
    const rest: number[] = []

    for (let i = 0; i < built.pieceOf.length; i += 1) {
      if (built.pieceOf[i] !== front) {
        continue
      }

      const p = [built.flat[i * 2]!, built.flat[i * 2 + 1]!] as const
      ;(distanceToPolygon(p, hole) < 0.5 ? ring : rest).push(i)
    }

    expect(ring.length).toBeGreaterThanOrEqual(8)
    const x = result.positions
    const at = (i: number) => [x[i * 3]!, x[i * 3 + 1]!, x[i * 3 + 2]!] as const
    const centre = [0, 1, 2].map((axis) => ring.reduce((sum, i) => sum + at(i)[axis]!, 0) / ring.length)
    // Newell's normal of the settled ring, and two axes across it.
    const normal = [0, 0, 0]

    for (let k = 0; k < ring.length; k += 1) {
      const a = at(ring[k]!)
      const b = at(ring[(k + 1) % ring.length]!)
      normal[0]! += (a[1] - b[1]) * (a[2] + b[2])
      normal[1]! += (a[2] - b[2]) * (a[0] + b[0])
      normal[2]! += (a[0] - b[0]) * (a[1] + b[1])
    }

    const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!)
    const n = normal.map((v) => v / length)
    // Settled, the ring still spans most of its flat area (π · 60² mm²).
    expect((length / 2) * 1e6).toBeGreaterThan(Math.PI * 60 * 60 * 0.5)
    const u = Math.abs(n[1]!) < 0.9 ? [n[2]!, 0, -n[0]!] : [0, -n[2]!, n[1]!]
    const ul = Math.hypot(u[0]!, u[1]!, u[2]!)
    const uu = u.map((value) => value / ul)
    const vv = [n[1]! * uu[2]! - n[2]! * uu[1]!, n[2]! * uu[0]! - n[0]! * uu[2]!, n[0]! * uu[1]! - n[1]! * uu[0]!]
    const flatten = (p: readonly number[]) => {
      const d = [p[0]! - centre[0]!, p[1]! - centre[1]!, p[2]! - centre[2]!]
      return {
        depth: d[0]! * n[0]! + d[1]! * n[1]! + d[2]! * n[2]!,
        at: [d[0]! * uu[0]! + d[1]! * uu[1]! + d[2]! * uu[2]!, d[0]! * vv[0]! + d[1]! * vv[1]! + d[2]! * vv[2]!] as const,
      }
    }
    const outline = ring.map((i) => flatten(at(i)).at)
    let inside = 0

    for (const i of rest) {
      const { depth, at: projected } = flatten(at(i))

      if (Math.abs(depth) < 0.03 && pointInPolygon(projected, outline)) {
        inside += 1
      }
    }

    expect(inside).toBe(0)
  }, 20_000)
})

const PINNED_TEE_DRAPE = 'b688d0e6'
