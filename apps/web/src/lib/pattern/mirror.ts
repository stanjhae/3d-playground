import type { CanonicalPattern, PatternPiece, PatternPoint } from './pattern-document.ts'

/** A piece with its outline (and any holes) in hand, whether drawn or mirrored. */
export type DrawnPiece = Omit<PatternPiece, 'outline' | 'mirrorOf' | 'holes'> & { outline: PatternPoint[]; holes?: PatternPoint[][]; mirrored: boolean }

/**
 * A drawn piece flipped left to right. The order reverses so the outline
 * still runs counter-clockwise, and each point's handles swap and flip.
 * Point ids are kept, so seams name the same points on both sides.
 */
export function mirrorOutline(outline: readonly PatternPoint[]): PatternPoint[] {
  return [...outline].reverse().map((point) => {
    const next: PatternPoint = { id: point.id, x: -point.x, y: point.y }

    if (point.k) {
      next.k = point.k
    }

    if (point.ho) {
      next.hi = [-point.ho[0], point.ho[1]]
    }

    if (point.hi) {
      next.ho = [-point.hi[0], point.hi[1]]
    }

    return next
  })
}

/**
 * A drawn piece's holes, flipped for its mirror. Reversing keeps each ring
 * clockwise. None when the piece has none (never an empty list).
 */
export function mirrorHoles(holes: readonly PatternPoint[][] | undefined): PatternPoint[][] | undefined {
  return holes?.map((hole) => mirrorOutline(hole))
}

/** Every piece with an outline: mirrors are drawn from their sources, holes and all. */
export function expandPieces({ pattern }: { pattern: CanonicalPattern }): DrawnPiece[] {
  const drawn = new Map(pattern.pieces.filter((piece) => piece.outline).map((piece) => [piece.id, piece]))

  return pattern.pieces.map((piece) => {
    const { outline, mirrorOf, holes, ...rest } = piece

    if (outline) {
      return holes ? { ...rest, outline, holes, mirrored: false } : { ...rest, outline, mirrored: false }
    }

    const source = drawn.get(mirrorOf!)
    const mirroredHoles = mirrorHoles(source?.holes)
    const out: DrawnPiece = { ...rest, outline: mirrorOutline(source?.outline ?? []), mirrored: true }
    return mirroredHoles ? { ...out, holes: mirroredHoles } : out
  })
}
