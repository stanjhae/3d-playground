import { describe, expect, test } from 'vitest'

import { bodyColliders } from '../cloth/colliders'
import { simulateCloth } from '../cloth/solver'
import { clothFromPattern } from './build-cloth'
import { expandPieces } from './mirror'
import { runLength } from './outline-edit'
import type { CanonicalPattern, PatternSeam } from './pattern-document'
import { fixtureTeePattern } from './pattern-fixtures'
import { PATTERN_OP_LIMITS, SLIT_MIN_SEWN_MM, applyPatternOps, isPatternOp, maxSlitMm, slitPointId, slitSeams } from './pattern-ops'
import { PATTERN_TEMPLATE_KEYS, patternTemplateFor } from './templates'
import { describeGeometryIssue, validateGeometry } from './validate-geometry'

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function slit(pattern: CanonicalPattern, op: { piece: string; seam?: string; mm: number }) {
  const result = applyPatternOps({ pattern, ops: [{ op: 'slit', ...op }] })

  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues))
  }

  return result.pattern
}

const seamOf = (pattern: CanonicalPattern, id: string) => pattern.seams.find((seam) => seam.id === id)!
const outlineOf = (pattern: CanonicalPattern, id: string) => expandPieces({ pattern }).find((piece) => piece.id === id)!.outline

/** The open stretch below a slit, hem point to the seam's new end (for seams whose `a.from` is the hem end). */
function openLength(pattern: CanonicalPattern, seam: PatternSeam, side: 'a' | 'b', hem: string) {
  const outline = outlineOf(pattern, seam[side].piece)
  return side === 'a' ? runLength({ outline, from: hem, to: seam.a.from }) : runLength({ outline, from: seam.b.to, to: hem })
}

/** Both sides of every seam sample to the same count, or building throws. */
function stitchesPair(pattern: CanonicalPattern) {
  const built = clothFromPattern({ pattern, colliders: bodyColliders() })
  expect(built.input.stitches.length % 2).toBe(0)
  return built
}

describe('the slit op', () => {
  test('opens the side seam nearest the hem on both pieces, by arc length, and keeps every seam paired', () => {
    const pattern = slit(fixtureTeePattern(), { piece: 'front', mm: 150 })
    const side = seamOf(pattern, 'sideL')

    expect(side.a).toEqual({ piece: 'front', from: slitPointId({ seam: 'sideL', side: 'a' }), to: 'armR' })
    expect(side.b).toEqual({ piece: 'back', from: 'armL', to: slitPointId({ seam: 'sideL', side: 'b' }) })
    expect(openLength(pattern, side, 'a', 'hemR')).toBeCloseTo(150, 0)
    expect(openLength(pattern, side, 'b', 'hemL')).toBeCloseTo(150, 0)
    // The other side seam is untouched.
    expect(seamOf(pattern, 'sideR')).toEqual(seamOf(fixtureTeePattern(), 'sideR'))
    expect(validateGeometry({ pattern })).toEqual([])
    stitchesPair(pattern)
  })

  test('the same op twice gives the same points; a new length moves the slit rather than adding one', () => {
    const once = slit(fixtureTeePattern(), { piece: 'front', mm: 120 })
    expect(slit(fixtureTeePattern(), { piece: 'front', mm: 120 })).toEqual(once)

    const moved = slit(once, { piece: 'front', mm: 220 })
    const front = outlineOf(moved, 'front')
    expect(front.filter((point) => point.id.includes('-slit-'))).toHaveLength(1)
    expect(front).toHaveLength(outlineOf(fixtureTeePattern(), 'front').length + 1)
    expect(openLength(moved, seamOf(moved, 'sideL'), 'a', 'hemR')).toBeCloseTo(220, 0)
    expect(slit(moved, { piece: 'front', mm: 120 })).toEqual(once)
  })

  test('a slit on one sleeve parts it from its mirror; the other keeps its shape', () => {
    const tee = fixtureTeePattern()
    const left = slit(tee, { piece: 'sleeveL', seam: 'underL', mm: 60 })
    const sleeveL = left.pieces.find((piece) => piece.id === 'sleeveL')!
    expect(sleeveL.mirrorOf).toBeUndefined()
    expect(sleeveL.outline!.map((point) => point.id)).toContain('underL-slit-a')
    expect(outlineOf(left, 'sleeveR')).toEqual(outlineOf(tee, 'sleeveR'))
    stitchesPair(left)

    const right = slit(tee, { piece: 'sleeveR', seam: 'underR', mm: 60 })
    expect(right.pieces.find((piece) => piece.id === 'sleeveL')!.mirrorOf).toBeUndefined()
    expect(outlineOf(right, 'sleeveL')).toEqual(outlineOf(tee, 'sleeveL'))
    expect(outlineOf(right, 'sleeveR').filter((point) => point.id.startsWith('underR-slit-'))).toHaveLength(2)
    stitchesPair(right)
  })

  test('a slit stops short of the top of its seam; a seam too short for one is left as it is', () => {
    const tee = fixtureTeePattern()
    const most = maxSlitMm({ pattern: tee, seamId: 'underR' })
    const sleeve = runLength({ outline: outlineOf(tee, 'sleeveR'), from: 'cuffR', to: 'capR' })
    expect(most).toBe(Math.min(PATTERN_OP_LIMITS.slit.max, Math.floor(sleeve - SLIT_MIN_SEWN_MM)))

    const long = slit(tee, { piece: 'sleeveR', seam: 'underR', mm: 400 })
    expect(openLength(long, seamOf(long, 'underR'), 'a', 'cuffR')).toBeCloseTo(most, 0)

    // Any named seam opens from its lower end, as far as its length allows.
    const shoulder = runLength({ outline: outlineOf(tee, 'front'), from: 'shR', to: 'neckR' })
    expect(maxSlitMm({ pattern: tee, seamId: 'shoulderL' })).toBe(Math.floor(shoulder - SLIT_MIN_SEWN_MM))
    expect(maxSlitMm({ pattern: tee, seamId: 'nope' })).toBe(0)
    // A seam that isn't on the piece, or a piece with none to open, is no change.
    expect(slit(tee, { piece: 'back', seam: 'underR', mm: 100 })).toEqual(tee)
  })

  test('picks among the seams on the hem: side seams on bodies, the underarm on a sleeve, the inseam and outseam on trousers', () => {
    const tee = fixtureTeePattern()
    expect(slitSeams({ pattern: tee, pieceId: 'front' }).map((seam) => seam.id)).toEqual(['sideL', 'sideR'])
    expect(slitSeams({ pattern: tee, pieceId: 'sleeveL' }).map((seam) => seam.id)).toEqual(['underL'])

    const suit = patternTemplateFor({ templateId: 'suit', templateVersion: 1 })!.pattern
    expect(slitSeams({ pattern: suit, pieceId: 'trouserFront' }).map((seam) => seam.id).sort()).toEqual(['inseamL', 'inseamR', 'outseamL', 'outseamR'])
  })

  test('random slits on every template either sew and pair up, or are refused: never half-built', () => {
    const next = random(11)

    for (const key of PATTERN_TEMPLATE_KEYS) {
      const [templateId, version] = key.split('@') as [string, string]
      const base = patternTemplateFor({ templateId, templateVersion: Number(version) })!.pattern

      for (let run = 0; run < 6; run += 1) {
        const piece = base.pieces[Math.floor(next() * base.pieces.length)]!
        const seams = slitSeams({ pattern: base, pieceId: piece.id })
        const seam = seams.length > 0 && next() < 0.5 ? seams[Math.floor(next() * seams.length)]!.id : undefined
        const mm = Math.round(PATTERN_OP_LIMITS.slit.min + next() * (PATTERN_OP_LIMITS.slit.max - PATTERN_OP_LIMITS.slit.min))
        const ops = [{ op: 'slit' as const, piece: piece.id, ...(seam ? { seam } : {}), mm }]
        const label = `${key} ${JSON.stringify(ops)}`
        const result = applyPatternOps({ pattern: base, ops })

        if (!result.ok) {
          // A refusal names why; it never comes from the slit splitting a seam's pairing.
          expect(result.issues.map((issue) => issue.code), label).not.toContain('seams-overlap')
          continue
        }

        expect(validateGeometry({ pattern: result.pattern }), label).toEqual([])
        expect(() => stitchesPair(result.pattern), label).not.toThrow()
        // Every seam's ends are still points on its pieces.
        for (const entry of result.pattern.seams) {
          for (const side of [entry.a, entry.b]) {
            const ids = outlineOf(result.pattern, side.piece).map((point) => point.id)
            expect(ids, label).toContain(side.from)
            expect(ids, label).toContain(side.to)
          }
        }
      }
    }
  }, 60_000)

  test('only a well-formed slit is an op', () => {
    expect(isPatternOp({ op: 'slit', piece: 'front', mm: 100 })).toBe(true)
    expect(isPatternOp({ op: 'slit', piece: 'front', seam: 'sideL', mm: 100 })).toBe(true)
    expect(isPatternOp({ op: 'slit', mm: 100 })).toBe(false)
    expect(isPatternOp({ op: 'slit', piece: 'front', seam: 'side L', mm: 100 })).toBe(false)
    expect(isPatternOp({ op: 'slit', piece: 'front', side: 'left', mm: 100 })).toBe(false)
    expect(isPatternOp({ op: 'lengthen', piece: 'front', mm: 100 })).toBe(false)
  })
})

describe('overlapping seams', () => {
  test('a seam run over another seam’s end is refused with a reason, before the cloth builder throws', () => {
    const pattern = fixtureTeePattern()
    // The side seam now runs past the armpit, where the sleeve cap seam starts.
    seamOf(pattern, 'sideL').a.to = 'armRm'
    const issues = validateGeometry({ pattern })
    const overlap = issues.find((issue) => issue.code === 'seams-overlap')
    expect(overlap).toMatchObject({ piece: 'front' })
    expect(describeGeometryIssue({ issue: overlap!, labelOf: () => 'Front' })).toBe('Two seams on Front overlap; each stretch of edge can be sewn only once.')
    expect(() => clothFromPattern({ pattern, colliders: bodyColliders() })).toThrow(/pair up/)
  })

  test('two seams sewing the same stretch are refused', () => {
    const pattern = fixtureTeePattern()
    pattern.seams.push({ ...structuredClone(seamOf(pattern, 'sideL')), id: 'again' })
    expect(validateGeometry({ pattern }).map((issue) => issue.code)).toContain('seams-overlap')
  })

  test('every template sews without overlaps', () => {
    for (const key of PATTERN_TEMPLATE_KEYS) {
      const [templateId, version] = key.split('@') as [string, string]
      const { pattern } = patternTemplateFor({ templateId, templateVersion: Number(version) })!
      expect(validateGeometry({ pattern }).filter((issue) => issue.code === 'seams-overlap'), key).toEqual([])
    }
  })
})

describe('a draped slit', () => {
  /** The 3D gap at the hem between the front's and back's corners of the left side seam. */
  function hemGap(pattern: CanonicalPattern) {
    const built = clothFromPattern({ pattern, colliders: bodyColliders() })
    const { positions, settled } = simulateCloth(built.input, { maxSeconds: 8 })
    const nearest = (pieceId: string, x: number, y: number) => {
      const piece = built.pieceIds.indexOf(pieceId)
      let best = -1
      let bestDistance = Infinity

      for (let v = 0; v < built.pieceOf.length; v += 1) {
        if (built.pieceOf[v] !== piece) continue
        const d = Math.hypot(built.flat[v * 2]! - x, built.flat[v * 2 + 1]! - y)
        if (d < bestDistance) {
          bestDistance = d
          best = v
        }
      }

      return best
    }

    const hemR = outlineOf(pattern, 'front').find((point) => point.id === 'hemR')!
    const hemL = outlineOf(pattern, 'back').find((point) => point.id === 'hemL')!
    const a = nearest('front', hemR.x, hemR.y) * 3
    const b = nearest('back', hemL.x, hemL.y) * 3
    return { settled, gap: Math.hypot(positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!) }
  }

  test('the slit’s edges hang apart at the hem once settled, where a sewn seam stays closed', () => {
    const closed = hemGap(fixtureTeePattern())
    const open = hemGap(slit(fixtureTeePattern(), { piece: 'front', mm: 400 }))

    expect(closed.settled).toBe(true)
    expect(open.settled).toBe(true)
    expect(closed.gap).toBeLessThan(0.001)
    // At least 2.5 cm apart, in metres (about 4 cm today).
    expect(open.gap).toBeGreaterThan(0.025)
  }, 30_000)
})
