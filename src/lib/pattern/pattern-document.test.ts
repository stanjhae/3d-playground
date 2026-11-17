import { describe, expect, test } from 'vitest'

import { type CanonicalDocument, createEmptyCanonicalDocument, readCanonicalDocument, validateCanonicalDocument } from '../canonical-document'
import { hashCanonicalDocument, serializeCanonicalDocument } from '../canonical-hash'
import { prepareContent } from '../flp-api/contract'
import { PATTERN_LIMITS } from './pattern-document'
import { fixtureTeePattern } from './pattern-fixtures'
import { hashPattern } from './pattern-hash'

/**
 * Pattern v1 on the canonical document: this release reads it, and no
 * release writes it yet (docs/release.md). A design saved by a later
 * Pattern (beta) studio must still open here if that release rolls back.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests write invalid patterns on purpose
type Loose = any

/** `hashPattern(fixtureTeePattern())` as stored before holes could be read. */
const FIXTURE_PATTERN_HASH = 'sha256:cf77cb4d89ab22f48f225b1d91568330fa881799c7a026f7c726bbe347bfe4c3'

function tee(): CanonicalDocument {
  return createEmptyCanonicalDocument()
}

function withPattern(edit: (pattern: Loose) => void = () => {}): Loose {
  const pattern = fixtureTeePattern() as Loose
  edit(pattern)
  return { ...tee(), pattern }
}

function issues(value: unknown) {
  const result = validateCanonicalDocument({ value })
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

describe('reading a pattern', () => {
  test('a tee with a pattern is valid, and a save keeps it exactly', () => {
    const document = withPattern()
    expect(issues(document)).toEqual([])

    const reloaded = JSON.parse(serializeCanonicalDocument({ document }))
    expect(issues(reloaded)).toEqual([])
    expect(reloaded.pattern).toEqual(document.pattern)
    expect(readCanonicalDocument({ value: reloaded }).ok).toBe(true)
  })

  test('the server accepts it and hashes it like any other content', async () => {
    const document = withPattern()
    const prepared = await prepareContent({ value: document })
    expect(prepared.ok).toBe(true)

    if (prepared.ok) {
      expect(prepared.prepared.contentHash).toBe(await hashCanonicalDocument({ document }))
      expect(prepared.prepared.content.pattern).toEqual(document.pattern)
    }
  })

  test('a document without a pattern hashes as it always did', async () => {
    const plain = tee()
    expect(await hashCanonicalDocument({ document: plain })).toBe(await hashCanonicalDocument({ document: JSON.parse(JSON.stringify(plain)) }))
    expect(serializeCanonicalDocument({ document: plain })).not.toContain('pattern')
  })

  test('a pattern replaces the shape: never both', () => {
    const both = { ...withPattern(), shape: { leftSleeve: 0.1, rightSleeve: 0, bodyLength: 0, bodyWidth: 0, necklineDepth: 0 } }
    expect(issues(both)).toContain('$.pattern: a pattern replaces the shape; store one or the other')
  })

  test('the pattern hash ignores key order and follows any change', async () => {
    const pattern = fixtureTeePattern()
    const shuffled = JSON.parse(JSON.stringify(pattern, Object.keys(pattern).reverse()))
    const reordered = { seams: pattern.seams, pieces: pattern.pieces, basis: pattern.basis, v: pattern.v }
    expect(await hashPattern({ pattern: reordered })).toBe(await hashPattern({ pattern }))
    expect(shuffled).toBeDefined()

    const moved = fixtureTeePattern()
    moved.pieces[0]!.outline![0]!.y = -10
    expect(await hashPattern({ pattern: moved })).not.toBe(await hashPattern({ pattern }))
  })
})

describe('what a pattern may hold', () => {
  test('fields, version and basis', () => {
    expect(issues(withPattern((p) => (p.extra = 1)))).toEqual(['$.pattern.extra: unknown field'])
    expect(issues(withPattern((p) => (p.v = 2)))).toEqual(['$.pattern.v: expected 1'])
    expect(issues(withPattern((p) => (p.basis.templateId = 'gown')))).toEqual(["$.pattern.basis.templateId: expected the document's template"])
    expect(issues(withPattern((p) => (p.basis.patternVersion = 0)))).toEqual(['$.pattern.basis.patternVersion: out of range [1, 999]'])
  })

  test('points are whole millimetres within reach, with stable unique ids', () => {
    expect(issues(withPattern((p) => (p.pieces[0].outline[0].x = 1.5)))).toEqual(['$.pattern.pieces[0].outline[0].x: expected an integer'])
    expect(issues(withPattern((p) => (p.pieces[0].outline[0].y = 4000)))).toEqual(['$.pattern.pieces[0].outline[0].y: out of range [-3000, 3000]'])
    expect(issues(withPattern((p) => (p.pieces[0].outline[1].id = 'hemL')))).toContain('$.pattern.pieces[0].outline[1].id: duplicate id hemL')
    expect(issues(withPattern((p) => (p.pieces[0].outline[1].id = 'hem R')))).toContain('$.pattern.pieces[0].outline[1].id: expected a stable id')
    expect(issues(withPattern((p) => (p.pieces[0].outline[0].hi = [1, 2, 3])))).toEqual(['$.pattern.pieces[0].outline[0].hi: expected [x, y]'])
  })

  test('a corner is the default and is never written', () => {
    expect(issues(withPattern((p) => (p.pieces[0].outline[0].k = 'c')))).toEqual(['$.pattern.pieces[0].outline[0].k: corner is the default; leave it out'])
    expect(issues(withPattern((p) => (p.pieces[0].outline[0].k = 'x')))).toEqual(['$.pattern.pieces[0].outline[0].k: expected one of c, s'])
  })

  test('limits on pieces, points and seams', () => {
    expect(issues(withPattern((p) => (p.pieces[0].outline = p.pieces[0].outline.slice(0, 2))))).toContain('$.pattern.pieces[0].outline: fewer than 3 items')
    const many = Array.from({ length: PATTERN_LIMITS.pointsPerPiece + 1 }, (_, i) => ({ id: `p${i}`, x: i, y: i % 2 }))
    expect(issues(withPattern((p) => (p.pieces[0].outline = many)))).toContain(`$.pattern.pieces[0].outline: more than ${PATTERN_LIMITS.pointsPerPiece} items`)
    expect(issues(withPattern((p) => (p.pieces = [])))).toContain('$.pattern.pieces: fewer than 1 items')
  })

  test("a piece prints on one of the document's panels", () => {
    expect(issues(withPattern((p) => (p.pieces[0].panel = 'hood')))).toEqual(['$.pattern.pieces[0].panel: expected one of front, back, left, right'])
  })

  test('a piece is drawn or mirrors a drawn piece', () => {
    expect(issues(withPattern((p) => (p.pieces[3].outline = p.pieces[2].outline)))).toEqual(['$.pattern.pieces[3]: expected an outline or mirrorOf, not both'])
    expect(issues(withPattern((p) => (p.pieces[3].mirrorOf = 'sleeveL')))).toContain('$.pattern.pieces[3].mirrorOf: expected the id of a drawn piece')
    expect(issues(withPattern((p) => (p.pieces[3].mirrorOf = 'nope')))).toContain('$.pattern.pieces[3].mirrorOf: expected the id of a drawn piece')
  })

  test('placement and fabric come from fixed lists', () => {
    expect(issues(withPattern((p) => (p.pieces[0].place.anchor = 'elbow')))).toEqual([expect.stringMatching(/^\$\.pattern\.pieces\[0\]\.place\.anchor: expected one of front, back/)])
    expect(issues(withPattern((p) => (p.pieces[0].place.rot = 270)))).toEqual(['$.pattern.pieces[0].place.rot: out of range [-180, 180]'])
    expect(issues(withPattern((p) => (p.pieces[2].fabric = 'silk')))).toEqual([expect.stringMatching(/^\$\.pattern\.pieces\[2\]\.fabric: expected one of jersey/)])
  })

  test("roles name the piece's own points", () => {
    expect(issues(withPattern((p) => (p.pieces[0].roles.hem = ['cuffL'])))).toEqual(['$.pattern.pieces[0].roles.hem[0]: not a point on this piece'])
    expect(issues(withPattern((p) => (p.pieces[0].roles.pocket = ['hemL'])))).toEqual(['$.pattern.pieces[0].roles.pocket: unknown field'])
  })

  test('seams join points that exist, on pieces that exist', () => {
    expect(issues(withPattern((p) => (p.seams[0].a.piece = 'collar')))).toEqual(['$.pattern.seams[0].a.piece: not a piece in this pattern'])
    expect(issues(withPattern((p) => (p.seams[0].a.to = 'cuffL')))).toEqual(['$.pattern.seams[0].a.to: not a point on this piece'])
    expect(issues(withPattern((p) => (p.seams[0].a.to = 'hemR')))).toEqual(['$.pattern.seams[0].a: a seam runs between two different points'])
    expect(issues(withPattern((p) => (p.seams[0].b = { ...p.seams[0].a })))).toEqual(['$.pattern.seams[0]: a seam joins two different edges'])
    expect(issues(withPattern((p) => (p.seams[1].id = 'sideL')))).toEqual(['$.pattern.seams[1].id: duplicate id sideL'])
    expect(issues(withPattern((p) => (p.seams[0].kind = 'glue')))).toEqual(['$.pattern.seams[0].kind: expected one of sew, ease'])
  })

  test("a mirrored piece's seams use its source's point ids", () => {
    expect(issues(withPattern((p) => (p.seams[9].a.from = 'hemL')))).toEqual(['$.pattern.seams[9].a.from: not a point on this piece'])
  })
})

/** A clockwise diamond on the front, 60 mm across, centred at (0, 300). */
function diamond(prefix = 'h'): Loose[] {
  return [
    { id: `${prefix}0`, x: 0, y: 330 },
    { id: `${prefix}1`, x: 30, y: 300 },
    { id: `${prefix}2`, x: 0, y: 270 },
    { id: `${prefix}3`, x: -30, y: 300, k: 's', hi: [0, 10], ho: [0, -10] },
  ]
}

describe('holes (pattern-reader R: read, not yet written)', () => {
  test('a drawn piece with cut-outs is valid, and a save keeps them exactly', () => {
    const document = withPattern((p) => (p.pieces[0].holes = [diamond('a'), diamond('b')]))
    expect(issues(document)).toEqual([])

    const reloaded = JSON.parse(serializeCanonicalDocument({ document }))
    expect(issues(reloaded)).toEqual([])
    expect(reloaded.pattern.pieces[0].holes).toEqual(document.pattern.pieces[0].holes)
  })

  test('the server accepts holes and hashes them with the rest', async () => {
    const document = withPattern((p) => (p.pieces[0].holes = [diamond()]))
    const prepared = await prepareContent({ value: document })
    expect(prepared.ok).toBe(true)

    if (prepared.ok) {
      expect(prepared.prepared.contentHash).toBe(await hashCanonicalDocument({ document }))
      expect(prepared.prepared.content.pattern?.pieces[0]?.holes).toEqual(document.pattern.pieces[0].holes)
      expect(prepared.prepared.contentHash).not.toBe(await hashCanonicalDocument({ document: withPattern() }))
    }
  })

  test('a pattern without holes hashes exactly as before the reader', async () => {
    // Pinned before holes were read: an absent field changes nothing.
    expect(await hashPattern({ pattern: fixtureTeePattern() })).toBe(FIXTURE_PATTERN_HASH)
    expect(serializeCanonicalDocument({ document: withPattern() })).not.toContain('holes')
  })

  test('an empty list is refused, so no hole is only ever written one way', () => {
    expect(issues(withPattern((p) => (p.pieces[0].holes = [])))).toEqual(['$.pattern.pieces[0].holes: fewer than 1 items'])
  })

  test('at most four holes, each of 3 to 32 points', () => {
    const five = Array.from({ length: PATTERN_LIMITS.holesPerPiece + 1 }, (_, i) => diamond(`h${i}x`))
    expect(issues(withPattern((p) => (p.pieces[0].holes = five)))).toEqual([`$.pattern.pieces[0].holes: more than ${PATTERN_LIMITS.holesPerPiece} items`])
    expect(issues(withPattern((p) => (p.pieces[0].holes = [diamond().slice(0, 2)])))).toEqual(['$.pattern.pieces[0].holes[0]: fewer than 3 items'])
    const ring = Array.from({ length: PATTERN_LIMITS.pointsPerHole.max + 1 }, (_, i) => ({ id: `r${i}`, x: i, y: 300 + (i % 2) }))
    expect(issues(withPattern((p) => (p.pieces[0].holes = [ring])))).toEqual([`$.pattern.pieces[0].holes[0]: more than ${PATTERN_LIMITS.pointsPerHole.max} items`])
    expect(issues(withPattern((p) => (p.pieces[0].holes = [{ id: 'h0' }])))).toEqual(['$.pattern.pieces[0].holes[0]: expected an array'])
  })

  test('hole points are points: whole millimetres within reach, ids unique within the piece', () => {
    expect(issues(withPattern((p) => (p.pieces[0].holes = [diamond().map((point, i) => (i === 1 ? { ...point, x: 4000 } : point))])))).toEqual([
      '$.pattern.pieces[0].holes[0][1].x: out of range [-3000, 3000]',
    ])
    expect(issues(withPattern((p) => (p.pieces[0].holes = [diamond(), diamond()])))).toContain('$.pattern.pieces[0].holes[1][0].id: duplicate id h0')
    expect(issues(withPattern((p) => (p.pieces[0].holes = [diamond().map((point, i) => (i === 0 ? { ...point, id: 'hemL' } : point))])))).toEqual([
      '$.pattern.pieces[0].holes[0][0].id: duplicate id hemL',
    ])
    expect(issues(withPattern((p) => (p.pieces[0].holes = [diamond().map((point, i) => (i === 0 ? { ...point, z: 1 } : point))])))).toEqual([
      '$.pattern.pieces[0].holes[0][0].z: unknown field',
    ])
    // Another piece may reuse the ids.
    expect(issues(withPattern((p) => ((p.pieces[0].holes = [diamond()]), (p.pieces[1].holes = [diamond()]))))).toEqual([])
  })

  test('seams and roles name outline points, never hole points', () => {
    const holed = (edit: (p: Loose) => void) => withPattern((p) => ((p.pieces[0].holes = [diamond()]), edit(p)))
    expect(issues(holed((p) => (p.pieces[0].roles.hem = ['h0'])))).toEqual(['$.pattern.pieces[0].roles.hem[0]: not a point on this piece'])
    expect(issues(holed((p) => (p.seams[0].a.to = 'h1')))).toEqual(['$.pattern.seams[0].a.to: not a point on this piece'])
  })

  test("a mirrored piece takes its source's holes and has none of its own", () => {
    expect(issues(withPattern((p) => (p.pieces[3].holes = [diamond()])))).toEqual(["$.pattern.pieces[3].holes: a mirrored piece takes its source's holes"])
    expect(issues(withPattern((p) => (p.pieces[2].holes = [diamond()])))).toEqual([])
  })
})

describe('simulation fabrics (pattern-reader R)', () => {
  test.each(['linen', 'chiffon', 'canvas', 'wool'])('a piece may name %s', (fabric) => {
    expect(issues(withPattern((p) => (p.pieces[2].fabric = fabric)))).toEqual([])
  })
})
