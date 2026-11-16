import type { GarmentShape } from '../garment-shape-params.ts'
import { expandPieces } from './mirror.ts'
import type { CanonicalPattern, PatternPiece } from './pattern-document.ts'
import type { PatternOp } from './pattern-ops.ts'

/**
 * The shape sliders (shape v1) as pattern edits, so a shaped design keeps
 * its look when it enters Pattern mode. Each fraction is taken of the
 * pattern's own measure, as the deformer takes it of the mesh's:
 * - a sleeve's length, cap to cuff;
 * - the body's armpit-to-hem length;
 * - the body's width below the armpits;
 * - the neckline: 0 to 1 is a drop of up to 8 cm, as in shape v1.
 */
const NECKLINE_DROP_MM = 80

function heightOf(piece: { outline: { y: number }[] }) {
  const ys = piece.outline.map((point) => point.y)
  return Math.max(...ys) - Math.min(...ys)
}

function rolePoints(piece: Pick<PatternPiece, 'roles'> & { outline: { id: string; x: number; y: number }[] }, role: 'hem' | 'armhole' | 'side') {
  const ids = new Set(piece.roles?.[role] ?? [])
  return piece.outline.filter((point) => ids.has(point.id))
}

export function shapeToOps({ shape, pattern }: { shape: GarmentShape; pattern: CanonicalPattern }): PatternOp[] {
  const pieces = expandPieces({ pattern })
  const front = pieces.find((piece) => piece.place.anchor === 'front') ?? pieces[0]!
  const ops: PatternOp[] = []

  const sleeve = (side: 'left' | 'right', fraction: number) => {
    const piece = pieces.find((entry) => entry.place.anchor === `arm-${side}`)

    if (piece && fraction !== 0) {
      ops.push({ op: 'sleeve', side, mm: Math.round(fraction * heightOf(piece)) })
    }
  }

  sleeve('left', shape.leftSleeveLength)
  sleeve('right', shape.rightSleeveLength)

  if (shape.bodyLength !== 0) {
    const hemY = Math.max(...rolePoints(front, 'hem').map((point) => point.y), 0)
    const armpits = rolePoints(front, 'armhole')
    const armpitY = armpits.length > 0 ? Math.min(...armpits.map((point) => point.y)) : heightOf(front) * 0.65
    ops.push({ op: 'lengthen', mm: Math.round(shape.bodyLength * (armpitY - hemY)) })
  }

  if (shape.bodyWidth !== 0) {
    const side = rolePoints(front, 'side')
    const width = side.length > 0 ? Math.max(...side.map((point) => point.x)) - Math.min(...side.map((point) => point.x)) : 0
    ops.push({ op: 'widen', mm: Math.round(shape.bodyWidth * width) })
  }

  if (shape.necklineDepth !== 0) {
    ops.push({ op: 'neckline', mm: Math.round(shape.necklineDepth * NECKLINE_DROP_MM) })
  }

  return ops
}
