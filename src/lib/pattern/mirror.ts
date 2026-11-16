import type { CanonicalPattern, PatternPiece, PatternPoint } from './pattern-document.ts'

/** A piece with its outline in hand, whether drawn or mirrored. */
export type DrawnPiece = Omit<PatternPiece, 'outline' | 'mirrorOf'> & { outline: PatternPoint[]; mirrored: boolean }

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

/** Every piece with an outline: mirrors are drawn from their sources. */
export function expandPieces({ pattern }: { pattern: CanonicalPattern }): DrawnPiece[] {
  const drawn = new Map(pattern.pieces.filter((piece) => piece.outline).map((piece) => [piece.id, piece.outline!]))

  return pattern.pieces.map((piece) => {
    const { outline, mirrorOf, ...rest } = piece

    if (outline) {
      return { ...rest, outline, mirrored: false }
    }

    return { ...rest, outline: mirrorOutline(drawn.get(mirrorOf!) ?? []), mirrored: true }
  })
}
