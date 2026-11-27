import { flattenOutline, outlineRun, polylineLength } from './bezier.ts'
import type { CanonicalPattern, PatternPiece, PatternPoint, PatternSeam, PatternSeamSide } from './pattern-document.ts'

/**
 * Point-level outline edits shared by the slit op and the editor: where a
 * distance along a seam lands, splitting an edge there without changing
 * its shape, and taking a point back out. Coordinates and handles stay
 * whole millimetres, as stored.
 */

type Pair = [number, number]

const lerp = (a: Pair, b: Pair, t: number): Pair => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const round = (value: number) => Math.round(value) + 0
const roundPair = ([x, y]: Pair): Pair => [round(x), round(y)]

/** The four control points of the edge from `a` to `b`. */
function controls(a: PatternPoint, b: PatternPoint): [Pair, Pair, Pair, Pair] {
  return [
    [a.x, a.y],
    [a.x + (a.ho?.[0] ?? 0), a.y + (a.ho?.[1] ?? 0)],
    [b.x + (b.hi?.[0] ?? 0), b.y + (b.hi?.[1] ?? 0)],
    [b.x, b.y],
  ]
}

/**
 * A new point at `t` on the edge after `index` (de Casteljau), with the
 * handles either side shortened so the curve keeps its shape. A straight
 * edge stays straight and the new point has no handles.
 */
export function splitEdge({ outline, index, t, id }: { outline: PatternPoint[]; index: number; t: number; id: string }): PatternPoint[] {
  const next = outline.map((point) => ({ ...point }))
  const a = next[index]!
  const b = next[(index + 1) % next.length]!
  const curved = Boolean(a.ho || b.hi)
  const [p0, p1, p2, p3] = controls(a, b)
  const q0 = lerp(p0, p1, t)
  const q1 = lerp(p1, p2, t)
  const q2 = lerp(p2, p3, t)
  const r0 = lerp(q0, q1, t)
  const r1 = lerp(q1, q2, t)
  // A straight edge is a line, not a cubic with its handles on its ends.
  const s = roundPair(curved ? lerp(r0, r1, t) : lerp(p0, p3, t))
  const point: PatternPoint = { id, x: s[0], y: s[1] }

  if (curved) {
    if (a.ho) a.ho = roundPair([q0[0] - p0[0], q0[1] - p0[1]])
    if (b.hi) b.hi = roundPair([q2[0] - p3[0], q2[1] - p3[1]])
    point.k = 's'
    point.hi = roundPair([r0[0] - s[0], r0[1] - s[1]])
    point.ho = roundPair([r1[0] - s[0], r1[1] - s[1]])
  }

  next.splice(index + 1, 0, point)
  return next
}

/**
 * The outline without point `id`. Handles either side of it are stretched
 * back out, by the share of the curve each side had, so a point added
 * with `splitEdge` comes out leaving (nearly) the curve it was put on.
 */
export function removeOutlinePoint({ outline, id }: { outline: PatternPoint[]; id: string }): PatternPoint[] {
  const index = outline.findIndex((point) => point.id === id)

  if (index < 0 || outline.length <= 3) {
    return outline
  }

  const next = outline.map((point) => ({ ...point }))
  const n = next.length
  const gone = next[index]!
  const prev = next[(index - 1 + n) % n]!
  const after = next[(index + 1) % n]!
  const before = edgeLength(prev, gone)
  const later = edgeLength(gone, after)
  const t = before + later > 0 ? before / (before + later) : 0.5

  if (prev.ho && t > 0) prev.ho = roundPair([prev.ho[0] / t, prev.ho[1] / t])
  if (after.hi && t < 1) after.hi = roundPair([after.hi[0] / (1 - t), after.hi[1] / (1 - t)])

  next.splice(index, 1)
  return next
}

function edgeLength(a: PatternPoint, b: PatternPoint) {
  const flat = flattenOutline({ outline: [a, b] })
  return polylineLength(flat.points.slice(0, flat.corners[1]! + 1))
}

/** Length of the counter-clockwise run from `from` to `to`, millimetres. */
export function runLength({ outline, from, to }: { outline: readonly PatternPoint[]; from: string; to: string }) {
  return polylineLength(outlineRun({ flat: flattenOutline({ outline }), outline, from, to }))
}

/**
 * Where on the outline a distance along the run from `from` to `to`
 * lands: the edge (by its first point's index) and `t` on that edge.
 * `fromEnd` measures back from `to` instead.
 */
export function pointAlongRun({
  outline,
  from,
  to,
  mm,
  fromEnd = false,
}: {
  outline: readonly PatternPoint[]
  from: string
  to: string
  mm: number
  fromEnd?: boolean
}): { index: number; t: number; length: number } | null {
  const flat = flattenOutline({ outline })
  const run = outlineRun({ flat, outline, from, to })
  const length = polylineLength(run)

  if (run.length < 2 || mm <= 0 || mm >= length) {
    return null
  }

  const target = fromEnd ? length - mm : mm
  const start = outline.findIndex((point) => point.id === from)
  const n = outline.length
  const total = flat.points.length
  let walked = 0

  // Edge by edge, then segment by segment inside an edge: the flattened
  // points of an edge sit at even steps of its curve parameter.
  for (let e = 0; e < n; e += 1) {
    const index = (start + e) % n
    const first = flat.corners[index]!
    const last = flat.corners[(index + 1) % n]!
    const steps = (last - first + total) % total || total

    for (let s = 0; s < steps; s += 1) {
      const p = flat.points[(first + s) % total]!
      const q = flat.points[(first + s + 1) % total]!
      const segment = Math.hypot(q[0] - p[0], q[1] - p[1])

      if (walked + segment >= target) {
        const within = segment > 0 ? (target - walked) / segment : 0
        return { index, t: (s + within) / steps, length }
      }

      walked += segment
    }
  }

  return null
}

/** The seam side's run on its piece, as the outline indices of its edges. */
export function runEdges({ outline, side }: { outline: readonly PatternPoint[]; side: PatternSeamSide }): number[] {
  const n = outline.length
  const start = outline.findIndex((point) => point.id === side.from)
  const end = outline.findIndex((point) => point.id === side.to)

  if (start < 0 || end < 0) {
    return []
  }

  const edges: number[] = []

  for (let i = start; i !== end; i = (i + 1) % n) {
    edges.push(i)

    if (edges.length > n) {
      return []
    }
  }

  return edges
}

/** What sews the edge after outline point `index` on `pieceId`, if anything. */
export function seamOnEdge({
  pattern,
  pieceId,
  outline,
  index,
}: {
  pattern: CanonicalPattern
  pieceId: string
  outline: readonly PatternPoint[]
  index: number
}): { seam: PatternSeam; side: 'a' | 'b'; colour: number } | null {
  for (const [colour, seam] of pattern.seams.entries()) {
    for (const side of ['a', 'b'] as const) {
      if (seam[side].piece === pieceId && runEdges({ outline, side: seam[side] }).includes(index)) {
        return { seam, side, colour }
      }
    }
  }

  return null
}

/** Ids of points some seam on this piece starts or ends at. */
export function seamEnds({ pattern, pieceId }: { pattern: CanonicalPattern; pieceId: string }) {
  const ends = new Set<string>()

  for (const seam of pattern.seams) {
    for (const side of [seam.a, seam.b]) {
      if (side.piece === pieceId) {
        ends.add(side.from)
        ends.add(side.to)
      }
    }
  }

  return ends
}

/** The first `prefix`N id not on the outline. */
export function freshPointId({ outline, prefix }: { outline: readonly PatternPoint[]; prefix: string }) {
  const taken = new Set(outline.map((point) => point.id))

  for (let n = 1; ; n += 1) {
    if (!taken.has(`${prefix}${n}`)) {
      return `${prefix}${n}`
    }
  }
}

/** Removes `id` from a piece's roles, dropping a role left empty. */
export function dropFromRoles(piece: PatternPiece, id: string) {
  if (!piece.roles) {
    return
  }

  for (const [role, ids] of Object.entries(piece.roles) as [keyof NonNullable<PatternPiece['roles']>, string[]][]) {
    const kept = ids.filter((entry) => entry !== id)

    if (kept.length === 0) {
      delete piece.roles[role]
    } else {
      piece.roles[role] = kept
    }
  }
}
