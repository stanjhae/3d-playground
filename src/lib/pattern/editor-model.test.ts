import { describe, expect, test } from 'vitest'

import {
  addPoint,
  checkEdit,
  describeEdge,
  editTarget,
  edgePath,
  layoutSheet,
  movePoint,
  piecePath,
  quickEdit,
  quickEditsFor,
  removePoint,
  sheetEdges,
  slitChoice,
  slitEdit,
  toSheet,
} from './editor-model'
import { validateGeometry } from './validate-geometry'
import { fixtureTeePattern } from './pattern-fixtures'
import { patternTemplateFor } from './templates'

describe('the pattern sheet', () => {
  test('lays every piece out once, without overlaps', () => {
    const sheet = layoutSheet({ pattern: fixtureTeePattern() })
    expect(sheet.pieces.map((piece) => piece.id)).toEqual(['front', 'back', 'sleeveR', 'sleeveL'])

    const boxes = sheet.pieces.map((piece) => {
      const [x0, y0] = toSheet(piece, piece.box.minX, piece.box.maxY)
      const [x1, y1] = toSheet(piece, piece.box.maxX, piece.box.minY)
      return { x0, y0, x1, y1 }
    })

    for (let i = 0; i < boxes.length; i += 1) {
      expect(boxes[i]!.x0).toBeGreaterThanOrEqual(-0.001)
      expect(boxes[i]!.y0).toBeGreaterThanOrEqual(-0.001)

      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!
        const b = boxes[j]!
        const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0
        expect(apart, `${sheet.pieces[i]!.id} / ${sheet.pieces[j]!.id}`).toBe(true)
      }
    }
  })

  test('paths draw curves where points have handles', () => {
    const sheet = layoutSheet({ pattern: fixtureTeePattern() })
    const front = piecePath(sheet.pieces[0]!)
    expect(front.startsWith('M')).toBe(true)
    expect(front).toContain('C')
    expect(front.endsWith('Z')).toBe(true)
  })
})

describe('editing points', () => {
  test('a point moves in whole millimetres; its piece y runs up', () => {
    const moved = movePoint({ pattern: fixtureTeePattern(), pieceId: 'front', pointId: 'neckC', dx: 0.4, dy: -20.6 })
    expect(moved.pieces[0]!.outline!.find((point) => point.id === 'neckC')).toMatchObject({ x: 0, y: 569 })
  })

  test("a mirror's edit lands on its source, flipped, so the pair stays a pair", () => {
    expect(editTarget({ pattern: fixtureTeePattern(), pieceId: 'sleeveL' })).toEqual({ pieceId: 'sleeveR', flipX: true })
    const moved = movePoint({ pattern: fixtureTeePattern(), pieceId: 'sleeveL', pointId: 'capR', dx: 10, dy: 5 })
    expect(moved.pieces[2]!.outline!.find((point) => point.id === 'capR')).toMatchObject({ x: 205, y: 185 })
    expect(moved.pieces[3]!.mirrorOf).toBe('sleeveR')
  })

  test('a smooth point keeps its handles in line', () => {
    const moved = movePoint({ pattern: fixtureTeePattern(), pieceId: 'front', pointId: 'neckC', part: 'ho', dx: 0, dy: -20 })
    const neck = moved.pieces[0]!.outline!.find((point) => point.id === 'neckC')!
    expect(neck.ho).toEqual([-45, -20])
    // Opposite direction, the incoming handle's own length kept.
    expect(neck.hi![0]).toBeGreaterThan(0)
    expect(neck.hi![1]).toBeGreaterThan(0)
    expect(Math.hypot(...neck.hi!)).toBeCloseTo(45, 0)
  })

  test('an unknown point changes nothing', () => {
    const pattern = fixtureTeePattern()
    expect(movePoint({ pattern, pieceId: 'front', pointId: 'nowhere', dx: 5, dy: 5 })).toBe(pattern)
  })
})

describe('committing', () => {
  test('a sewable edit passes; an unsewable one says why in plain words', () => {
    expect(checkEdit({ pattern: fixtureTeePattern() })).toEqual({ ok: true })
    const lopsided = movePoint({ pattern: fixtureTeePattern(), pieceId: 'front', pointId: 'hemR', dx: 0, dy: -100 })
    const check = checkEdit({ pattern: lopsided })
    expect(check.ok).toBe(false)
    expect(!check.ok && check.messages[0]).toMatch(/^A seam’s two sides differ by 10\.\d cm/)
  })

  test('quick edits measure from the pattern they started on', () => {
    const base = fixtureTeePattern()
    const longer = quickEdit({ pattern: base, id: 'length', mm: 80 })
    expect(longer.ok && longer.pattern.pieces[0]!.outline![0]!.y).toBe(-80)
    expect(quickEdit({ pattern: base, id: 'length', mm: 0 })).toEqual({ ok: true, pattern: base })
  })

  test('only the quick edits a garment can take are offered', () => {
    const tee = quickEditsFor({ pattern: fixtureTeePattern() }).map((edit) => edit.id)
    expect(tee).toContain('sleeve-left')
    const slip = quickEditsFor({ pattern: patternTemplateFor({ templateId: 'slip', templateVersion: 1 })!.pattern }).map((edit) => edit.id)
    expect(slip).not.toContain('sleeve-left')
    expect(slip).toContain('neckline')
  })
})

describe('edges, points and slits', () => {
  test('each edge knows the seam that sews it; hems and necklines are open', () => {
    const pattern = fixtureTeePattern()
    const front = layoutSheet({ pattern }).pieces[0]!
    const edges = sheetEdges({ pattern, piece: front })

    expect(edges[0]).toMatchObject({ from: 'hemL', to: 'hemR', seam: null })
    expect(edges[1]).toMatchObject({ from: 'hemR', to: 'armR', seam: { id: 'sideL', to: { pieceId: 'back', label: 'Back' } } })
    expect(describeEdge({ piece: front, edge: edges[1]! })).toBe('Front, edge hemR to armR, sewn to Back (seam sideL)')
    expect(describeEdge({ piece: front, edge: edges[0]! })).toBe('Front, edge hemL to hemR, open')
    expect(edgePath(front, 1)).toMatch(/^M\S+ \S+ L/)
    expect(edgePath(front, 6)).toContain('C')
  })

  test('a point added halfway along an edge keeps the shape; on a mirror it lands on the source', () => {
    const pattern = fixtureTeePattern()
    const added = addPoint({ pattern, pieceId: 'front', index: 0 })!
    expect(added.pointId).toBe('p1')
    const front = added.pattern.pieces[0]!.outline!
    expect(front.slice(0, 3).map((point) => [point.id, point.x, point.y])).toEqual([
      ['hemL', -260, 0],
      ['p1', 0, 0],
      ['hemR', 260, 0],
    ])
    expect(validateGeometry({ pattern: added.pattern })).toEqual([])

    // The neckline's curve, split, still passes through its old middle.
    const neck = addPoint({ pattern, pieceId: 'front', index: 5 })!
    expect(neck.pattern.pieces[0]!.outline!.find((point) => point.id === 'p1')).toMatchObject({ k: 's' })

    const sleeveL = layoutSheet({ pattern }).pieces.find((piece) => piece.id === 'sleeveL')!
    const onMirror = addPoint({ pattern, pieceId: 'sleeveL', index: 0 })!
    const source = onMirror.pattern.pieces.find((piece) => piece.id === 'sleeveR')!.outline!
    const at = source.findIndex((point) => point.id === 'p1')
    // The mirror's edge a→b is its source's b→a.
    expect([source[at - 1]!.id, source[at + 1]!.id]).toEqual([sleeveL.outline[1]!.id, sleeveL.outline[0]!.id])
  })

  test('a point is removed unless a seam ends there, and leaves its roles', () => {
    const pattern = fixtureTeePattern()
    expect(removePoint({ pattern, pieceId: 'front', pointId: 'hemR' })).toEqual({ ok: false, message: 'A seam ends at hemR, so it can’t be removed. Move the point instead.' })
    // A seam ends at the sleeve's cap on the mirror: the source can't lose it either.
    expect(removePoint({ pattern, pieceId: 'sleeveR', pointId: 'capMid' }).ok).toBe(false)

    const added = addPoint({ pattern, pieceId: 'front', index: 0 })!
    const removed = removePoint({ pattern: added.pattern, pieceId: 'front', pointId: 'p1' })
    expect(removed).toEqual({ ok: true, pattern })

    const noNeckC = removePoint({ pattern, pieceId: 'front', pointId: 'neckC' })
    expect(noNeckC.ok && noNeckC.pattern.pieces[0]!.roles!.neck).toEqual(['neckR', 'neckL'])
  })

  test('a sewn edge offers a slit up to its seam’s limit; once slit, it offers that length', () => {
    const pattern = fixtureTeePattern()
    expect(slitChoice({ pattern, pieceId: 'front', index: 0 })).toBeNull()
    expect(slitChoice({ pattern, pieceId: 'front', index: 1 })).toEqual({ seamId: 'sideL', max: 400, current: 0 })

    const result = slitEdit({ pattern, pieceId: 'front', seamId: 'sideL', mm: 150 })
    expect(result.ok).toBe(true)
    const slit = result.ok ? result.pattern : pattern
    // The sewn part now starts at the slit point: the edge after it.
    expect(slitChoice({ pattern: slit, pieceId: 'front', index: 2 })).toEqual({ seamId: 'sideL', max: 400, current: 150 })
    expect(slitChoice({ pattern: slit, pieceId: 'back', index: 10 })).toMatchObject({ seamId: 'sideL', current: 150 })
  })
})
