import { describe, expect, test } from 'vitest'

import { bodyColliders } from '../cloth/colliders'
import { SHAPE_LIMITS } from '../garment-shape-params'
import { flattenOutline, outlineRun, polylineLength, signedArea } from './bezier'
import { clothFromPattern } from './build-cloth'
import { expandPieces, mirrorOutline } from './mirror'
import type { CanonicalPattern, PatternPoint } from './pattern-document'
import { fixtureTeePattern } from './pattern-fixtures'
import { PATTERN_OP_LIMITS, type PatternOp, applyPatternOps, isPatternOp } from './pattern-ops'
import { pieceToPanel } from './pattern-uv'
import { shapeToOps } from './shape-to-pattern'
import { delaunay, triangulatePiece } from './triangulate'
import { validateGeometry } from './validate-geometry'

const square: PatternPoint[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 200, y: 0 },
  { id: 'c', x: 200, y: 200 },
  { id: 'd', x: 0, y: 200 },
]

function withFront(outline: PatternPoint[]): CanonicalPattern {
  const pattern = fixtureTeePattern()
  const { roles: _roles, mirrorOf: _mirror, ...front } = pattern.pieces[0]!
  pattern.pieces = [{ ...front, outline }]
  pattern.seams = []
  return pattern
}

/** A small seeded generator, so property runs repeat. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

describe('outlines', () => {
  test('a straight edge flattens to its end points; a curve to a close polyline', () => {
    expect(flattenOutline({ outline: square }).points).toHaveLength(4)

    // A quarter circle of radius 100 as a Bézier (handle 55.23).
    const arc: PatternPoint[] = [
      { id: 'o', x: 0, y: 0 },
      { id: 'p', x: 100, y: 0, ho: [0, 55.23] as [number, number] },
      { id: 'q', x: 0, y: 100, hi: [55.23, 0] as [number, number] },
    ]
    const flat = flattenOutline({ outline: arc })
    const run = outlineRun({ flat, outline: arc, from: 'p', to: 'q' })
    expect(polylineLength(run)).toBeCloseTo((Math.PI * 100) / 2, 0)
  })

  test('a mirror runs counter-clockwise too and keeps its point ids', () => {
    const flat = flattenOutline({ outline: mirrorOutline(square) })
    expect(signedArea(flat.points)).toBeGreaterThan(0)
    expect(mirrorOutline(square).map((point) => point.id).sort()).toEqual(['a', 'b', 'c', 'd'])

    const curved = fixtureTeePattern().pieces[2]!.outline!
    const mirrored = mirrorOutline(curved)
    const cap = mirrored.find((point) => point.id === 'capMid')!
    expect(cap.hi).toEqual([120, 0])
    expect(cap.ho).toEqual([-120, 0])
  })

  test('mirrored pieces come out drawn', () => {
    const pieces = expandPieces({ pattern: fixtureTeePattern() })
    const left = pieces.find((piece) => piece.id === 'sleeveL')!
    expect(left.mirrored).toBe(true)
    expect(left.outline.find((point) => point.id === 'capR')!.x).toBe(-215)
  })
})

describe('whether a pattern can be sewn', () => {
  test('the fixture tee can', () => {
    expect(validateGeometry({ pattern: fixtureTeePattern() })).toEqual([])
  })

  test('an outline that crosses itself, runs clockwise or is tiny is refused', () => {
    const bow: PatternPoint[] = [square[0]!, square[2]!, square[1]!, square[3]!]
    expect(validateGeometry({ pattern: withFront(bow) })).toEqual([{ code: 'crosses-itself', piece: 'front' }])
    expect(validateGeometry({ pattern: withFront([...square].reverse()) })).toEqual([{ code: 'clockwise', piece: 'front' }])
    const tiny = square.map((point) => ({ ...point, x: point.x / 10, y: point.y / 10 }))
    expect(validateGeometry({ pattern: withFront(tiny) })).toEqual([{ code: 'too-small', piece: 'front', areaMm2: 400 }])
  })

  test('a needle-sharp corner is refused', () => {
    const spike: PatternPoint[] = [...square.slice(0, 2), { id: 'tip', x: 2000, y: 100 }, ...square.slice(2)]
    expect(validateGeometry({ pattern: withFront(spike) })).toContainEqual(expect.objectContaining({ code: 'sharp-corner', point: 'tip' }))
  })

  test('a piece must stay inside its print frame', () => {
    const pattern = withFront(square)
    expect(validateGeometry({ pattern, frames: { front: { width: 1000, height: 1000 } } })).toEqual([])
    expect(validateGeometry({ pattern, frames: { front: { width: 400, height: 1000 } } })).toEqual([{ code: 'outside-frame', piece: 'front' }])
  })

  test("a seam's sides must match: 2% or 5 mm, or 6% when eased", () => {
    const pattern = fixtureTeePattern()
    pattern.pieces[0]!.outline!.find((point) => point.id === 'hemR')!.y = -12
    expect(validateGeometry({ pattern })).toEqual([{ code: 'seam-length', seam: 'sideL', aMm: 452, bMm: 440, allowedMm: 9 }])
  })
})

describe('meshing', () => {
  test('Delaunay is deterministic and counter-clockwise', () => {
    const points = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
    ] as const
    const first = delaunay(points)
    expect(delaunay(points)).toEqual(first)
    expect(first.length / 3).toBe(4)
  })

  test('every outline edge is a mesh edge, so seams sit on the boundary', () => {
    for (const piece of expandPieces({ pattern: fixtureTeePattern() })) {
      const flat = flattenOutline({ outline: piece.outline })
      const mesh = triangulatePiece({ outline: flat.points, spacing: 25 })
      const edges = new Set<string>()

      for (let t = 0; t < mesh.triangles.length; t += 3) {
        for (let e = 0; e < 3; e += 1) {
          const i = mesh.triangles[t + e]!
          const j = mesh.triangles[t + ((e + 1) % 3)]!
          edges.add(`${Math.min(i, j)},${Math.max(i, j)}`)
        }
      }

      for (let i = 0; i < mesh.boundaryCount; i += 1) {
        const j = (i + 1) % mesh.boundaryCount
        expect(edges.has(`${Math.min(i, j)},${Math.max(i, j)}`), `${piece.id} edge ${i}`).toBe(true)
      }
    }
  })
})

describe('pattern edits', () => {
  test('each op moves what its role names and stays sewable', () => {
    const base = fixtureTeePattern()
    const front = (pattern: CanonicalPattern, id: string) => pattern.pieces[0]!.outline!.find((point) => point.id === id)!

    const longer = applyPatternOps({ pattern: base, ops: [{ op: 'lengthen', mm: 100 }] })
    expect(longer.ok && front(longer.pattern, 'hemL').y).toBe(-100)

    const wider = applyPatternOps({ pattern: base, ops: [{ op: 'widen', mm: 60 }] })
    expect(wider.ok && front(wider.pattern, 'hemR').x).toBe(290)

    const scoop = applyPatternOps({ pattern: base, ops: [{ op: 'neckline', mm: 60 }] })
    expect(scoop.ok && front(scoop.pattern, 'neckC').y).toBe(530)
    expect(scoop.ok && front(scoop.pattern, 'neckR').y).toBe(680)

    const curved = applyPatternOps({ pattern: base, ops: [{ op: 'hemCurve', mm: 50, piece: 'back' }] })
    expect(curved.ok && curved.pattern.pieces[1]!.outline!.find((point) => point.id === 'hemL')!.ho).toEqual([173, -50])
    expect(curved.ok && front(curved.pattern, 'hemL').ho).toBeUndefined()
  })

  test('one sleeve alone parts it from its mirror', () => {
    const result = applyPatternOps({ pattern: fixtureTeePattern(), ops: [{ op: 'sleeve', side: 'left', mm: 200 }] })
    expect(result.ok).toBe(true)

    if (result.ok) {
      const left = result.pattern.pieces.find((piece) => piece.id === 'sleeveL')!
      const right = result.pattern.pieces.find((piece) => piece.id === 'sleeveR')!
      expect(left.mirrorOf).toBeUndefined()
      expect(left.outline!.find((point) => point.id === 'cuffL')!.y).toBe(-200)
      expect(right.outline!.find((point) => point.id === 'cuffL')!.y).toBe(0)
    }
  })

  test('both sleeves keep the mirror', () => {
    const result = applyPatternOps({ pattern: fixtureTeePattern(), ops: [{ op: 'sleeve', side: 'both', mm: -80 }] })
    expect(result.ok && result.pattern.pieces[3]!.mirrorOf).toBe('sleeveR')
    expect(result.ok && result.pattern.pieces[2]!.outline![0]!.y).toBe(80)
  })

  test('ops are clamped to their bounds, and only well-formed ops are ops', () => {
    const result = applyPatternOps({ pattern: fixtureTeePattern(), ops: [{ op: 'neckline', mm: 10_000 }] })
    expect(result.ok && result.pattern.pieces[0]!.outline!.find((point) => point.id === 'neckC')!.y).toBe(590 - PATTERN_OP_LIMITS.neckline.max)

    expect(isPatternOp({ op: 'lengthen', mm: 10 })).toBe(true)
    expect(isPatternOp({ op: 'sleeve', side: 'up', mm: 10 })).toBe(false)
    expect(isPatternOp({ op: 'lengthen', mm: 10, outline: [] })).toBe(false)
    expect(isPatternOp({ op: 'explode', mm: 1 })).toBe(false)
  })

  test('an edit that leaves the pattern unsewable is refused', () => {
    // Shortening past the armpit folds the side seam into the armhole.
    const result = applyPatternOps({ pattern: fixtureTeePattern(), ops: [{ op: 'lengthen', mm: -250 }, { op: 'lengthen', mm: -250 }] })
    expect(result.ok).toBe(false)
  })

  test('random edits within bounds either drape-build cleanly or are refused, never half-built', () => {
    const next = random(7)
    const ops: PatternOp['op'][] = ['lengthen', 'widen', 'flare', 'hemCurve', 'neckline', 'sleeve']

    for (let run = 0; run < 25; run += 1) {
      const picks: PatternOp[] = Array.from({ length: 3 }, () => {
        const op = ops[Math.floor(next() * ops.length)]!
        const { min, max } = PATTERN_OP_LIMITS[op]
        const mm = Math.round(min + next() * (max - min))
        return op === 'sleeve' ? { op, mm, side: next() < 0.5 ? 'left' : 'both' } : ({ op, mm } as PatternOp)
      })
      const result = applyPatternOps({ pattern: fixtureTeePattern(), ops: picks })

      if (result.ok) {
        const built = clothFromPattern({ pattern: result.pattern, colliders: bodyColliders() })
        expect(built.triangles.length, JSON.stringify(picks)).toBeGreaterThan(0)
        expect(built.input.stitches.length % 2).toBe(0)
      }
    }
  })
})

describe('shape sliders as pattern edits', () => {
  test('neutral is no edit; every slider at either end still sews', () => {
    const pattern = fixtureTeePattern()
    const neutral = { leftSleeveLength: 0, rightSleeveLength: 0, bodyLength: 0, bodyWidth: 0, necklineDepth: 0 }
    expect(shapeToOps({ shape: neutral, pattern })).toEqual([])

    for (const field of Object.keys(SHAPE_LIMITS) as (keyof typeof SHAPE_LIMITS)[]) {
      for (const value of [SHAPE_LIMITS[field].min, SHAPE_LIMITS[field].max]) {
        const ops = shapeToOps({ shape: { ...neutral, [field]: value }, pattern })
        const result = applyPatternOps({ pattern, ops })
        expect(result.ok, `${field} = ${value}: ${JSON.stringify(ops)}`).toBe(true)
      }
    }
  })

  test('the measures follow the pattern', () => {
    const shape = { leftSleeveLength: 0.5, rightSleeveLength: 0, bodyLength: 0.25, bodyWidth: 0.1, necklineDepth: 0.5 }
    expect(shapeToOps({ shape, pattern: fixtureTeePattern() })).toEqual([
      { op: 'sleeve', side: 'left', mm: 123 },
      { op: 'lengthen', mm: 110 },
      { op: 'widen', mm: 52 },
      { op: 'neckline', mm: 40 },
    ])
  })
})

describe('prints on pieces', () => {
  test("a piece's point lands in its panel frame; the back reads mirrored", () => {
    const frame = { width: 680, height: 800 }
    expect(pieceToPanel({ x: 0, y: 0, panelOrigin: [340, 40], frame })).toEqual([0.5, 0.05])
    expect(pieceToPanel({ x: 170, y: 360, panelOrigin: [340, 40], frame })).toEqual([0.75, 0.5])
    expect(pieceToPanel({ x: 170, y: 360, panelOrigin: [340, 40], frame: { ...frame, mirrorX: true } })).toEqual([0.25, 0.5])
  })
})
