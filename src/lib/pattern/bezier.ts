import type { PatternPoint } from './pattern-document.ts'
import type { Point2 } from './triangulate.ts'

/**
 * Outline curves. Between two points the edge is a cubic Bézier from the
 * first point's outgoing handle (`ho`) to the second's incoming one (`hi`);
 * with neither handle it's a straight line.
 */

/** Points along one edge, excluding its start, including its end. */
function edgePoints(a: PatternPoint, b: PatternPoint, tolerance: number): Point2[] {
  if (!a.ho && !b.hi) {
    return [[b.x, b.y]]
  }

  const p0: Point2 = [a.x, a.y]
  const p1: Point2 = [a.x + (a.ho?.[0] ?? 0), a.y + (a.ho?.[1] ?? 0)]
  const p2: Point2 = [b.x + (b.hi?.[0] ?? 0), b.y + (b.hi?.[1] ?? 0)]
  const p3: Point2 = [b.x, b.y]
  // Enough steps that no chord sags more than `tolerance` (a bound from the
  // control polygon's second differences).
  const ddx = Math.max(Math.abs(p0[0] - 2 * p1[0] + p2[0]), Math.abs(p1[0] - 2 * p2[0] + p3[0]))
  const ddy = Math.max(Math.abs(p0[1] - 2 * p1[1] + p2[1]), Math.abs(p1[1] - 2 * p2[1] + p3[1]))
  const steps = Math.min(64, Math.max(1, Math.ceil(Math.sqrt((3 * Math.hypot(ddx, ddy)) / (4 * tolerance)))))
  const out: Point2[] = []

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    const b0 = u * u * u
    const b1 = 3 * u * u * t
    const b2 = 3 * u * t * t
    const b3 = t * t * t
    out.push([b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]])
  }

  return out
}

export type FlatOutline = {
  /** The closed polyline, no repeated last point. */
  points: Point2[]
  /** Index in `points` of each outline point, in outline order. */
  corners: number[]
}

/** The outline as a polyline, curves flattened to within `tolerance` millimetres. */
export function flattenOutline({ outline, tolerance = 0.5 }: { outline: readonly PatternPoint[]; tolerance?: number }): FlatOutline {
  const points: Point2[] = []
  const corners: number[] = []

  outline.forEach((point, index) => {
    corners.push(points.length)
    points.push([point.x, point.y])
    const next = outline[(index + 1) % outline.length]!
    points.push(...edgePoints(point, next, tolerance).slice(0, -1))
  })

  return { points, corners }
}

export function polylineLength(points: readonly Point2[]) {
  let total = 0

  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  }

  return total
}

/** The flattened run from outline point `from` to `to`, counter-clockwise, ends included. */
export function outlineRun({ flat, outline, from, to }: { flat: FlatOutline; outline: readonly PatternPoint[]; from: string; to: string }): Point2[] {
  const start = outline.findIndex((p) => p.id === from)
  const end = outline.findIndex((p) => p.id === to)

  if (start < 0 || end < 0) {
    return []
  }

  const first = flat.corners[start]!
  const last = flat.corners[end]!
  const out: Point2[] = []

  for (let i = first; ; i = (i + 1) % flat.points.length) {
    out.push(flat.points[i]!)

    if (i === last && out.length > 1) {
      break
    }
  }

  return out
}

/** Signed area, millimetres²: positive when counter-clockwise. */
export function signedArea(points: readonly Point2[]) {
  let area = 0

  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i]!
    const [x1, y1] = points[(i + 1) % points.length]!
    area += x0 * y1 - x1 * y0
  }

  return area / 2
}
