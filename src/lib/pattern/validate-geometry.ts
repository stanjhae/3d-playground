import { flattenOutline, outlineRun, polylineLength, signedArea } from './bezier.ts'
import { expandPieces } from './mirror.ts'
import type { CanonicalPattern } from './pattern-document.ts'
import type { PanelFrame } from './pattern-uv.ts'
import type { Point2 } from './triangulate.ts'

/**
 * Whether a pattern can be sewn: every piece a simple, counter-clockwise
 * outline of a usable size with no needle-sharp corners, inside its
 * print frame, and every seam's two sides close enough in length.
 *
 * The studio runs this on every edit (a pattern that fails can't be
 * committed) and before a drape. The reader in `pattern-document.ts`
 * checks only shape and references.
 */
export type GeometryIssue =
  | { code: 'crosses-itself'; piece: string }
  | { code: 'clockwise'; piece: string }
  | { code: 'too-small'; piece: string; areaMm2: number }
  | { code: 'sharp-corner'; piece: string; point: string; degrees: number }
  | { code: 'outside-frame'; piece: string }
  | { code: 'seam-length'; seam: string; aMm: number; bMm: number; allowedMm: number }

export const GEOMETRY_LIMITS = {
  /** 25 cm². */
  minAreaMm2: 2500,
  minCornerDegrees: 10,
  /** A plain seam may differ by 2% or 5 mm, whichever is more. */
  sewFraction: 0.02,
  sewMm: 5,
  /** An eased seam (a sleeve cap into its armhole) may differ by 6%. */
  easeFraction: 0.06,
} as const

export type { PanelFrame }

function segmentsCross(a: Point2, b: Point2, c: Point2, d: Point2) {
  const orient = (p: Point2, q: Point2, r: Point2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = orient(c, d, a)
  const d2 = orient(c, d, b)
  const d3 = orient(a, b, c)
  const d4 = orient(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export function crossesItself(points: readonly Point2[]) {
  const n = points.length

  for (let i = 0; i < n; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % n]!

    for (let j = i + 2; j < n; j += 1) {
      // Neighbouring edges share a point; the last edge neighbours the first.
      if (i === 0 && j === n - 1) {
        continue
      }

      if (segmentsCross(a, b, points[j]!, points[(j + 1) % n]!)) {
        return true
      }
    }
  }

  return false
}

/** The inside angle at `index`, in degrees. */
function cornerDegrees(points: readonly Point2[], index: number) {
  const n = points.length
  const p = points[index]!
  const prev = points[(index - 1 + n) % n]!
  const next = points[(index + 1) % n]!
  const ax = prev[0] - p[0]
  const ay = prev[1] - p[1]
  const bx = next[0] - p[0]
  const by = next[1] - p[1]
  const angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by)
  // Counter-clockwise outline: the inside lies to the left of travel.
  const inside = angle < 0 ? -angle : 2 * Math.PI - angle
  return (inside * 180) / Math.PI
}

export function validateGeometry({
  pattern,
  frames,
}: {
  pattern: CanonicalPattern
  /** Per panel; without them the frame check is skipped. */
  frames?: Record<string, PanelFrame>
}): GeometryIssue[] {
  const issues: GeometryIssue[] = []
  const pieces = expandPieces({ pattern })
  const flats = new Map(pieces.map((piece) => [piece.id, flattenOutline({ outline: piece.outline })]))

  for (const piece of pieces) {
    const flat = flats.get(piece.id)!
    const area = signedArea(flat.points)

    if (crossesItself(flat.points)) {
      issues.push({ code: 'crosses-itself', piece: piece.id })
      continue
    }

    if (area < 0) {
      issues.push({ code: 'clockwise', piece: piece.id })
      continue
    }

    if (area < GEOMETRY_LIMITS.minAreaMm2) {
      issues.push({ code: 'too-small', piece: piece.id, areaMm2: Math.round(area) })
    }

    piece.outline.forEach((point, index) => {
      const degrees = cornerDegrees(flat.points, flat.corners[index]!)

      if (degrees < GEOMETRY_LIMITS.minCornerDegrees) {
        issues.push({ code: 'sharp-corner', piece: piece.id, point: point.id, degrees: Math.round(degrees) })
      }
    })

    const frame = frames?.[piece.panel]

    if (frame) {
      const [ox, oy] = piece.panelOrigin
      const outside = flat.points.some(([x, y]) => ox + x < 0 || oy + y < 0 || ox + x > frame.width || oy + y > frame.height)

      if (outside) {
        issues.push({ code: 'outside-frame', piece: piece.id })
      }
    }
  }

  const outlineOf = new Map(pieces.map((piece) => [piece.id, piece.outline]))

  for (const seam of pattern.seams) {
    const length = (side: { piece: string; from: string; to: string }) => {
      const flat = flats.get(side.piece)
      const outline = outlineOf.get(side.piece)
      return flat && outline ? polylineLength(outlineRun({ flat, outline, from: side.from, to: side.to })) : 0
    }

    const a = length(seam.a)
    const b = length(seam.b)
    const longer = Math.max(a, b)
    const allowed =
      seam.kind === 'ease' ? longer * GEOMETRY_LIMITS.easeFraction : Math.max(GEOMETRY_LIMITS.sewMm, longer * GEOMETRY_LIMITS.sewFraction)

    if (Math.abs(a - b) > allowed) {
      issues.push({ code: 'seam-length', seam: seam.id, aMm: Math.round(a), bMm: Math.round(b), allowedMm: Math.round(allowed) })
    }
  }

  return issues
}

/** Plain words for an issue, for the pattern editor. */
export function describeGeometryIssue({ issue, labelOf }: { issue: GeometryIssue; labelOf: (pieceId: string) => string }): string {
  switch (issue.code) {
    case 'crosses-itself':
      return `${labelOf(issue.piece)} crosses over itself.`
    case 'clockwise':
      return `${labelOf(issue.piece)} is drawn inside out.`
    case 'too-small':
      return `${labelOf(issue.piece)} is too small to sew.`
    case 'sharp-corner':
      return `${labelOf(issue.piece)} has a corner too sharp to sew (${issue.degrees}°).`
    case 'outside-frame':
      return `${labelOf(issue.piece)} reaches past its print area.`
    case 'seam-length': {
      const diff = Math.abs(issue.aMm - issue.bMm)
      return `A seam's two sides differ by ${(diff / 10).toFixed(1)} cm; they can differ by ${(issue.allowedMm / 10).toFixed(1)} cm at most.`
    }
  }
}
