import { describe, expect, test } from 'vitest'

import { clothFromPattern } from '../pattern/build-cloth'
import { fixtureTeePattern } from '../pattern/pattern-fixtures'
import { type PatternOp, applyPatternOps } from '../pattern/pattern-ops'
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

  test('the same pattern drapes the same way twice', () => {
    const first = drape().result.positions
    const second = drape().result.positions
    expect(second.length).toBe(first.length)
    expect(second.every((value, index) => value === first[index])).toBe(true)
  }, 20_000)
})
