import { describe, expect, test } from 'vitest'

import { bodyColliders } from '../cloth/colliders'
import { signedArea } from './bezier'
import { clothFromPattern, spacingFor } from './build-cloth'
import { addCutout, layoutSheet, moveHole, movePoint, piecePath, removeCutout, removePoint } from './editor-model'
import { expandPieces } from './mirror'
import type { CanonicalPattern, PatternPoint } from './pattern-document'
import { fixtureTeePattern } from './pattern-fixtures'
import { hashPattern } from './pattern-hash'
import {
  CUTOUT_SHAPES,
  PATTERN_OP_LIMITS,
  type PatternOp,
  applyPatternOps,
  cutoutOutline,
  cutoutPointId,
  isPatternOp,
} from './pattern-ops'
import { PATTERN_TEMPLATE_KEYS, patternTemplateFor } from './templates'
import { type Point2, pointInPolygon, triangulatePiece } from './triangulate'
import { GEOMETRY_LIMITS, describeGeometryIssue, validateGeometry } from './validate-geometry'

/** Cut-outs (C2): holes inside a piece, from the reader through the mesh. */

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/** FNV-1a over the arrays' bytes, as hex. */
function fingerprint(arrays: readonly ArrayLike<number>[]) {
  let h = 0x811c9dc5

  for (const array of arrays) {
    const bytes = new Uint8Array(Float64Array.from(array as ArrayLike<number>).buffer)

    for (const byte of bytes) {
      h = Math.imul(h ^ byte, 0x01000193) >>> 0
    }
  }

  return h.toString(16).padStart(8, '0')
}

function cut(op: Partial<Extract<PatternOp, { op: 'cutout' }>> = {}, pattern = fixtureTeePattern()) {
  return applyPatternOps({ pattern, ops: [{ op: 'cutout', piece: 'front', shape: 'circle', dx: 0, dy: 0, wMm: 80, hMm: 80, ...op }] })
}

function ring(points: readonly Point2[], prefix = 'h'): PatternPoint[] {
  return points.map(([x, y], index) => ({ id: `${prefix}${index}`, x, y }))
}

/** A clockwise square, `size` across, centred at (cx, cy). */
function square(cx: number, cy: number, size: number, prefix = 'h'): PatternPoint[] {
  const s = size / 2
  return ring(
    [
      [cx - s, cy - s],
      [cx - s, cy + s],
      [cx + s, cy + s],
      [cx + s, cy - s],
    ],
    prefix,
  )
}

function withHoles(holes: PatternPoint[][]): CanonicalPattern {
  const pattern = fixtureTeePattern()
  pattern.pieces[0]!.holes = holes
  return pattern
}

/** Undirected edge → how many triangles use it. */
function edgeUse(triangles: ArrayLike<number>) {
  const use = new Map<string, number>()

  for (let t = 0; t < triangles.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const i = triangles[t + e]!
      const j = triangles[t + ((e + 1) % 3)]!
      const key = `${Math.min(i, j)},${Math.max(i, j)}`
      use.set(key, (use.get(key) ?? 0) + 1)
    }
  }

  return use
}

describe('meshing a piece with holes', () => {
  const outline: Point2[] = []

  // A 400 mm square, resampled at 25 mm, counter-clockwise.
  for (let side = 0; side < 4; side += 1) {
    for (let k = 0; k < 16; k += 1) {
      const t = k * 25
      outline.push(([[t, 0], [400, t], [400 - t, 400], [0, 400 - t]] as Point2[])[side]!)
    }
  }

  const hole: Point2[] = Array.from({ length: 12 }, (_, k) => {
    const a = -(2 * Math.PI * k) / 12
    return [200 + 60 * Math.cos(a), 200 + 60 * Math.sin(a)] as Point2
  })

  test('no triangle lies inside a hole, and the hole ring is a free edge', () => {
    const mesh = triangulatePiece({ outline, holes: [hole], spacing: 25 })
    expect(mesh.boundaryCount).toBe(outline.length)
    expect(mesh.holeCounts).toEqual([12])
    expect(mesh.points.slice(outline.length, outline.length + 12)).toEqual(hole)

    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => mesh.points[mesh.triangles[t + k]!]!)
      const centroid: Point2 = [(a![0] + b![0] + c![0]) / 3, (a![1] + b![1] + c![1]) / 3]
      expect(pointInPolygon(centroid, hole)).toBe(false)
    }

    for (const p of mesh.points.slice(outline.length + 12)) {
      expect(pointInPolygon(p, hole)).toBe(false)
    }

    const use = edgeUse(mesh.triangles)

    for (let k = 0; k < 12; k += 1) {
      const i = outline.length + k
      const j = outline.length + ((k + 1) % 12)
      expect(use.get(`${Math.min(i, j)},${Math.max(i, j)}`), `hole edge ${k}`).toBe(1)
    }
  })

  test('without holes the mesh is exactly what it was', () => {
    const plain = triangulatePiece({ outline, spacing: 25 })
    expect(triangulatePiece({ outline, holes: [], spacing: 25 })).toEqual(plain)
    expect(plain.holeCounts).toEqual([])
  })
})

describe('patterns without holes are untouched', () => {
  // Pinned from master before cut-outs: every template's cloth, bit for bit.
  const PINNED: Record<string, string> = {
    'coat@1': '156e72f1',
    'crop@1': 'fbd83537',
    'dress@1': 'dfebff18',
    'gown@1': '610e8be8',
    'hoodie@1': 'a9a4bf38',
    'mixed@1': '62713b0d',
    'overall@1': '9d3f47fc',
    'slip@1': 'b4c5c172',
    'suit@1': 'ced51649',
    'tailored@1': '466447b9',
    'tee-crew-short@4': '0ad31dd6',
    'tee-crew-short@5': '0ad31dd6',
    'tee-crew-short@6': '0ad31dd6',
    'tee-crew-short@7': '0ad31dd6',
    'trousers@1': '3c48fa2c',
    'vest@1': '8d98e9da',
  }

  test('every template builds the same cloth as before cut-outs', () => {
    const now: Record<string, string> = {}

    for (const key of PATTERN_TEMPLATE_KEYS) {
      const [templateId, version] = key.split('@')
      const { pattern } = patternTemplateFor({ templateId: templateId!, templateVersion: Number(version) })!
      const built = clothFromPattern({ pattern, colliders: bodyColliders() })
      const { input } = built
      now[key] = fingerprint([input.positions, input.links, input.rest, input.compliance, input.stitches, input.holdY ?? [], built.flat, built.triangles, built.pieceOf])
    }

    expect(now).toEqual(PINNED)
  })
})

describe('the cutout op', () => {
  test('every shape is clockwise, whole millimetres, 8 to 32 points, and the same each time', () => {
    for (const shape of CUTOUT_SHAPES) {
      for (const [wMm, hMm] of [
        [PATTERN_OP_LIMITS.cutout.min, PATTERN_OP_LIMITS.cutout.min],
        [60, 90],
        [PATTERN_OP_LIMITS.cutout.max, PATTERN_OP_LIMITS.cutout.max],
      ] as const) {
        const points = cutoutOutline({ shape, wMm, hMm })
        expect(points.length, shape).toBeGreaterThanOrEqual(8)
        expect(points.length, shape).toBeLessThanOrEqual(32)
        expect(signedArea(points), shape).toBeLessThan(0)
        expect(points.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))).toBe(true)
        expect(cutoutOutline({ shape, wMm, hMm })).toEqual(points)
        expect(Math.abs(signedArea(points))).toBeGreaterThanOrEqual(GEOMETRY_LIMITS.minHoleAreaMm2)
      }
    }
  })

  test('cuts a hole with its own point ids, centred where asked', () => {
    const result = cut({ at: 'centre', dx: 10, dy: -20 })
    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    const holes = result.pattern.pieces[0]!.holes!
    expect(holes).toHaveLength(1)
    expect(holes[0]!.map((point) => point.id)).toEqual(holes[0]!.map((_, index) => cutoutPointId({ hole: 0, index })))
    const xs = holes[0]!.map((point) => point.x)
    const ys = holes[0]!.map((point) => point.y)
    // The front's middle is (0, 340).
    expect(Math.round((Math.min(...xs) + Math.max(...xs)) / 2)).toBe(10)
    expect(Math.round((Math.min(...ys) + Math.max(...ys)) / 2)).toBe(320)
    // A second takes the next free number.
    const again = cut({ dy: -200, wMm: 60, hMm: 60 }, result.pattern)
    expect(again.ok && again.pattern.pieces[0]!.holes![1]![0]!.id).toBe(cutoutPointId({ hole: 1, index: 0 }))
  })

  test('measures from a role, and drops one the piece lacks', () => {
    // The neck's points average (0, 650).
    const result = cut({ shape: 'keyhole', at: 'neck', dy: -150, wMm: 60, hMm: 100 })
    expect(result.ok, JSON.stringify(!result.ok && result.issues)).toBe(true)
    const hole = result.ok ? result.pattern.pieces[0]!.holes![0]! : []
    // Its round top reaches about 650 − 150 + 100 / 2.
    expect(Math.max(...hole.map((point) => point.y))).toBeGreaterThanOrEqual(544)
    expect(Math.max(...hole.map((point) => point.y))).toBeLessThanOrEqual(550)

    const none = cut({ at: 'cuff' })
    expect(none.ok && none.pattern).toEqual(fixtureTeePattern())
  })

  test('sizes and offsets are clamped; a fifth hole is not cut', () => {
    const big = cut({ wMm: 9999, hMm: 9999, dx: 9999 })
    expect(big.ok).toBe(false)
    const attempted = big.ok ? undefined : big.attempted.pieces[0]!.holes![0]!
    const xs = attempted!.map((point) => point.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(PATTERN_OP_LIMITS.cutout.max)
    expect(Math.round((Math.max(...xs) + Math.min(...xs)) / 2)).toBe(600)

    let pattern = fixtureTeePattern()

    for (const [dx, dy] of [
      [-120, 120],
      [120, 120],
      [-120, -100],
      [120, -100],
      [0, 0],
    ]) {
      const next = cut({ dx, dy, wMm: 60, hMm: 60 }, pattern)
      expect(next.ok).toBe(true)
      pattern = next.ok ? next.pattern : pattern
    }

    expect(pattern.pieces[0]!.holes).toHaveLength(4)
  })

  test('a cut-out on a mirror is its own; a source keeps its mirrors as they were', () => {
    const onMirror = cut({ piece: 'sleeveL', wMm: 40, hMm: 40, dy: 20 })
    expect(onMirror.ok, JSON.stringify(!onMirror.ok && onMirror.issues)).toBe(true)

    if (onMirror.ok) {
      const left = onMirror.pattern.pieces.find((piece) => piece.id === 'sleeveL')!
      const right = onMirror.pattern.pieces.find((piece) => piece.id === 'sleeveR')!
      expect(left.mirrorOf).toBeUndefined()
      expect(left.holes).toHaveLength(1)
      expect(right.holes).toBeUndefined()
      expect(left.roles).toEqual(right.roles)
    }

    const onSource = cut({ piece: 'sleeveR', wMm: 40, hMm: 40, dy: 20 })
    expect(onSource.ok).toBe(true)

    if (onSource.ok) {
      const left = onSource.pattern.pieces.find((piece) => piece.id === 'sleeveL')!
      expect(left.outline).toBeDefined()
      expect('holes' in left).toBe(false)
      // A later edit to the left sleeve alone still finds the right sleeve's hole only there.
      expect(expandPieces({ pattern: onSource.pattern }).find((piece) => piece.id === 'sleeveR')!.holes).toHaveLength(1)
    }
  })

  test('a mirror draws its source’s holes, flipped and still clockwise', () => {
    const pattern = fixtureTeePattern()
    pattern.pieces[2]!.holes = [square(60, 100, 40)]
    const left = expandPieces({ pattern }).find((piece) => piece.id === 'sleeveL')!
    expect(left.holes![0]!.map((point) => point.x).sort((a, b) => a - b)).toEqual([-80, -80, -40, -40])
    expect(signedArea(left.holes![0]!.map((point) => [point.x, point.y] as Point2))).toBeLessThan(0)
    expect(validateGeometry({ pattern })).toEqual([])
    // Editing the left sleeve alone gives it its own copy of the hole.
    const longer = applyPatternOps({ pattern, ops: [{ op: 'sleeve', side: 'left', mm: 50 }] })
    expect(longer.ok && longer.pattern.pieces.find((piece) => piece.id === 'sleeveL')!.holes).toEqual(left.holes)
  })

  test('removing the only cut-out leaves no `holes` key, so the hash is as before', async () => {
    const result = cut()
    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    const removed = removeCutout({ pattern: result.pattern, pieceId: 'front', hole: 0 })
    expect('holes' in removed.pieces[0]!).toBe(false)
    expect(await hashPattern({ pattern: removed })).toBe(await hashPattern({ pattern: fixtureTeePattern() }))
    expect(await hashPattern({ pattern: result.pattern })).not.toBe(await hashPattern({ pattern: fixtureTeePattern() }))

    const two = cut({ dy: -200, wMm: 60, hMm: 60 }, result.pattern)
    const one = two.ok ? removeCutout({ pattern: two.pattern, pieceId: 'front', hole: 0 }) : undefined
    expect(one?.pieces[0]!.holes!.map((hole: PatternPoint[]) => hole[0]!.id)).toEqual([cutoutPointId({ hole: 1, index: 0 })])
  })

  test('is a well-formed op only with its own fields', () => {
    const ok = { op: 'cutout', piece: 'front', shape: 'oval', dx: 0, dy: 0, wMm: 60, hMm: 80 }
    expect(isPatternOp(ok)).toBe(true)
    expect(isPatternOp({ ...ok, at: 'neck' })).toBe(true)
    expect(isPatternOp({ ...ok, at: 'centre' })).toBe(true)
    expect(isPatternOp({ ...ok, at: 'elbow' })).toBe(false)
    expect(isPatternOp({ ...ok, shape: 'star' })).toBe(false)
    expect(isPatternOp({ ...ok, mm: 10 })).toBe(false)
    expect(isPatternOp({ ...ok, wMm: Number.NaN })).toBe(false)
    expect(isPatternOp({ ...ok, piece: 'front piece' })).toBe(false)
    const { dx: _dx, ...missing } = ok
    expect(isPatternOp(missing)).toBe(false)
  })
})

describe('cut-outs in the editor', () => {
  test('a piece draws its holes as extra subpaths', () => {
    const result = cut()
    const sheet = layoutSheet({ pattern: result.ok ? result.pattern : fixtureTeePattern() })
    const front = sheet.pieces[0]!
    expect(front.holes).toHaveLength(1)
    expect(piecePath(front).match(/M/g)).toHaveLength(2)
    expect(piecePath(sheet.pieces[1]!).match(/M/g)).toHaveLength(1)
  })

  test('adding and removing on a mirror lands on its source, so the pair keeps matching', () => {
    const added = addCutout({ pattern: fixtureTeePattern(), pieceId: 'sleeveL', shape: 'circle', wMm: 40, hMm: 40 })
    expect(added.ok).toBe(true)

    if (!added.ok || !('pattern' in added)) {
      return
    }

    expect(added.pattern.pieces[2]!.holes).toHaveLength(1)
    expect(added.pattern.pieces[3]!.mirrorOf).toBe('sleeveR')
    const pieces = expandPieces({ pattern: added.pattern })
    expect(pieces[3]!.holes).toHaveLength(1)

    // Moving a hole point or the whole hole on the mirror moves the source's, x flipped.
    const id = added.pattern.pieces[2]!.holes![0]![0]!.id
    const x0 = added.pattern.pieces[2]!.holes![0]![0]!.x
    expect(movePoint({ pattern: added.pattern, pieceId: 'sleeveL', pointId: id, dx: 5, dy: 0 }).pieces[2]!.holes![0]![0]!.x).toBe(x0 - 5)
    expect(moveHole({ pattern: added.pattern, pieceId: 'sleeveL', hole: 0, dx: 5, dy: 2 }).pieces[2]!.holes![0]!.every((point, k) => point.x === added.pattern.pieces[2]!.holes![0]![k]!.x - 5)).toBe(true)

    const removed = removeCutout({ pattern: added.pattern, pieceId: 'sleeveL', hole: 0 })
    expect(removed).toEqual(fixtureTeePattern())
  })

  test('a fifth cut-out, or one that can’t be sewn, is refused with a reason', () => {
    const tooBig = addCutout({ pattern: fixtureTeePattern(), pieceId: 'sleeveR', shape: 'circle', wMm: 300, hMm: 300 })
    expect(tooBig.ok).toBe(false)
    expect('issues' in tooBig && tooBig.issues[0]!.code).toBe('hole-crosses')

    const full = withHoles([square(-120, 120, 50, 'a'), square(120, 120, 50, 'b'), square(-120, 500, 50, 'c'), square(120, 420, 50, 'd')])
    expect(validateGeometry({ pattern: full })).toEqual([])
    expect(addCutout({ pattern: full, pieceId: 'front', shape: 'circle', wMm: 40, hMm: 40 })).toEqual({ ok: false, message: 'A piece can have 4 cut-outs at most.' })
  })

  test('a hole point can go while three remain', () => {
    const pattern = withHoles([square(0, 300, 80)])
    const three = removePoint({ pattern, pieceId: 'front', pointId: 'h0' })
    expect(three.ok && three.pattern.pieces[0]!.holes![0]).toHaveLength(3)
    expect(three.ok && removePoint({ pattern: three.pattern, pieceId: 'front', pointId: 'h1' })).toEqual({
      ok: false,
      message: 'A cut-out needs at least three points. Remove the cut-out instead.',
    })
  })
})

describe('whether a cut-out can be sewn', () => {
  const labelOf = (id: string) => id

  test('a good hole passes', () => {
    expect(validateGeometry({ pattern: withHoles([square(0, 300, 80)]) })).toEqual([])
  })

  test('hole-crosses: a bow tie, a hole over the edge, two holes overlapping', () => {
    const bow = ring([
      [-40, 260],
      [40, 340],
      [40, 260],
      [-40, 340],
    ])
    expect(validateGeometry({ pattern: withHoles([bow]) })).toEqual([{ code: 'hole-crosses', piece: 'front', hole: 0 }])
    expect(validateGeometry({ pattern: withHoles([square(260, 200, 80)]) })).toEqual([{ code: 'hole-crosses', piece: 'front', hole: 0 }])
    expect(validateGeometry({ pattern: withHoles([square(0, 300, 80, 'a'), square(30, 300, 80, 'b')]) })).toEqual([
      { code: 'hole-crosses', piece: 'front', hole: 0 },
      { code: 'hole-crosses', piece: 'front', hole: 1 },
    ])
    // One inside the other.
    expect(validateGeometry({ pattern: withHoles([square(0, 300, 160, 'a'), square(0, 300, 40, 'b')]) })).toHaveLength(2)
  })

  test('hole-outside', () => {
    expect(validateGeometry({ pattern: withHoles([square(600, 300, 80)]) })).toEqual([{ code: 'hole-outside', piece: 'front', hole: 0 }])
  })

  test('hole-near-edge: under 15 mm of cloth to the edge or another hole', () => {
    // The hem is y = 0: a hole from y = 10.
    expect(validateGeometry({ pattern: withHoles([square(0, 50, 80)]) })).toEqual([{ code: 'hole-near-edge', piece: 'front', hole: 0, distanceMm: 10 }])
    expect(validateGeometry({ pattern: withHoles([square(0, 55, 80)]) })).toEqual([])
    expect(validateGeometry({ pattern: withHoles([square(-50, 300, 80, 'a'), square(40, 300, 80, 'b')]) })).toEqual([
      { code: 'hole-near-edge', piece: 'front', hole: 0, distanceMm: 10 },
      { code: 'hole-near-edge', piece: 'front', hole: 1, distanceMm: 10 },
    ])
  })

  test('hole-too-small: under 4 cm²', () => {
    expect(validateGeometry({ pattern: withHoles([square(0, 300, 19)]) })).toEqual([{ code: 'hole-too-small', piece: 'front', hole: 0, areaMm2: 361 }])
    expect(validateGeometry({ pattern: withHoles([square(0, 300, 20)]) })).toEqual([])
  })

  test('each has plain words', () => {
    expect(describeGeometryIssue({ issue: { code: 'hole-crosses', piece: 'front', hole: 0 }, labelOf })).toBe(
      'A cut-out on front crosses itself, the edge or another cut-out.',
    )
    expect(describeGeometryIssue({ issue: { code: 'hole-outside', piece: 'front', hole: 0 }, labelOf })).toBe('A cut-out on front lies outside the piece.')
    expect(describeGeometryIssue({ issue: { code: 'hole-near-edge', piece: 'front', hole: 0, distanceMm: 10 }, labelOf })).toContain('1.0 cm from the edge')
    expect(describeGeometryIssue({ issue: { code: 'hole-too-small', piece: 'front', hole: 0, areaMm2: 300 }, labelOf })).toContain('at least 4 cm²')
  })

  test('a mirror’s holes are checked once, on its source', () => {
    const pattern = fixtureTeePattern()
    pattern.pieces[2]!.holes = [square(0, 240, 40)]
    expect(validateGeometry({ pattern })).toEqual([{ code: 'hole-crosses', piece: 'sleeveR', hole: 0 }])
  })
})

describe('random cut-outs (property)', () => {
  test('any hole that validates still meshes, seams still pair, and nothing is NaN', () => {
    const next = random(17)
    let accepted = 0

    for (let run = 0; run < 60; run += 1) {
      const count = 1 + Math.floor(next() * 3)
      let pattern = fixtureTeePattern()

      for (let k = 0; k < count; k += 1) {
        const shape = CUTOUT_SHAPES[Math.floor(next() * CUTOUT_SHAPES.length)]!
        const piece = (['front', 'back', 'sleeveR', 'sleeveL'] as const)[Math.floor(next() * 4)]!
        const op: PatternOp = {
          op: 'cutout',
          piece,
          shape,
          dx: Math.round((next() - 0.5) * 360),
          dy: Math.round((next() - 0.5) * 500),
          wMm: Math.round(25 + next() * 140),
          hMm: Math.round(25 + next() * 180),
        }
        const result = applyPatternOps({ pattern, ops: [op] })

        if (result.ok) {
          pattern = result.pattern
        }
      }

      const holes = expandPieces({ pattern }).reduce((sum, piece) => sum + (piece.holes?.length ?? 0), 0)

      if (holes === 0) {
        continue
      }

      accepted += 1
      expect(spacingFor({ pattern })).toBeGreaterThan(0)
      const built = clothFromPattern({ pattern, colliders: bodyColliders() })
      expect(built.input.stitches.length).toBe(clothFromPattern({ pattern: fixtureTeePattern(), colliders: bodyColliders() }).input.stitches.length)
      expect([...built.input.positions, ...built.input.rest, ...built.flat].every(Number.isFinite)).toBe(true)
      expect([...built.input.rest].every((length) => length > 0)).toBe(true)

      // Every particle is in some triangle; no triangle has its centroid in a hole.
      const used = new Set(built.triangles)
      expect(used.size).toBe(built.pieceOf.length)

      for (const piece of expandPieces({ pattern })) {
        const index = built.pieceIds.indexOf(piece.id)

        for (const hole of piece.holes ?? []) {
          const polygon = hole.map((point) => [point.x, point.y] as Point2)

          for (let t = 0; t < built.triangles.length; t += 3) {
            if (built.pieceOf[built.triangles[t]!] !== index) {
              continue
            }

            const c = [0, 1].map((axis) => [0, 1, 2].reduce((sum, k) => sum + built.flat[built.triangles[t + k]! * 2 + axis]!, 0) / 3)
            expect(pointInPolygon([c[0]!, c[1]!], polygon)).toBe(false)
          }
        }
      }
    }

    expect(accepted).toBeGreaterThan(20)
  }, 60_000)
})
