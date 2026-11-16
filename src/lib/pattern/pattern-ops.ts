import { mirrorOutline } from './mirror.ts'
import type { CanonicalPattern, PatternPiece, PatternPoint, PatternRole } from './pattern-document.ts'
import { type GeometryIssue, type PanelFrame, validateGeometry } from './validate-geometry.ts'

/**
 * Bounded pattern edits by name: the shape sliders in Pattern mode and the
 * AI assist both speak these, never raw outlines. Each moves the points a
 * piece's roles name, so a template decides what "the hem" is. A result
 * that can't be sewn is refused, never stored.
 */
export type PatternOp =
  | { op: 'lengthen'; mm: number }
  | { op: 'widen'; mm: number }
  | { op: 'flare'; mm: number }
  | { op: 'hemCurve'; mm: number; piece?: 'front' | 'back' | 'all' }
  | { op: 'neckline'; mm: number }
  | { op: 'sleeve'; side: 'left' | 'right' | 'both'; mm: number }

/** Inclusive millimetre bounds per op. */
export const PATTERN_OP_LIMITS = {
  lengthen: { min: -250, max: 400 },
  widen: { min: -80, max: 150 },
  flare: { min: -60, max: 250 },
  hemCurve: { min: -150, max: 150 },
  neckline: { min: 0, max: 160 },
  sleeve: { min: -250, max: 500 },
} as const satisfies Record<PatternOp['op'], { min: number; max: number }>

export const PATTERN_OPS = Object.keys(PATTERN_OP_LIMITS) as PatternOp['op'][]

const BODY_ANCHORS = new Set(['front', 'back', 'side-left', 'side-right', 'hip-front', 'hip-back'])
const BACK_ANCHORS = new Set(['back', 'hip-back'])

type Mutable = CanonicalPattern

function clone(pattern: CanonicalPattern): Mutable {
  return JSON.parse(JSON.stringify(pattern)) as Mutable
}

function roleIds(piece: PatternPiece, role: PatternRole) {
  return new Set(piece.roles?.[role] ?? [])
}

/** A mirrored piece gets its own outline, so it can be edited apart from its source. */
function materialise(pattern: Mutable, pieceId: string) {
  const piece = pattern.pieces.find((entry) => entry.id === pieceId)

  if (!piece?.mirrorOf) {
    return
  }

  const source = pattern.pieces.find((entry) => entry.id === piece.mirrorOf)
  const { mirrorOf: _mirror, ...rest } = piece
  const index = pattern.pieces.indexOf(piece)
  pattern.pieces[index] = { ...rest, outline: mirrorOutline(source?.outline ?? []), roles: piece.roles ?? source?.roles }
}

/** Every piece that mirrors `pieceId` gets its own outline first. */
function detachMirrors(pattern: Mutable, pieceId: string) {
  for (const piece of pattern.pieces) {
    if (piece.mirrorOf === pieceId) {
      materialise(pattern, piece.id)
    }
  }
}

function movePoints(piece: PatternPiece, ids: Set<string>, move: (point: PatternPoint) => void) {
  for (const point of piece.outline ?? []) {
    if (ids.has(point.id)) {
      move(point)
    }
  }
}

function clamp(op: PatternOp): PatternOp {
  const { min, max } = PATTERN_OP_LIMITS[op.op]
  const mm = Math.round(Math.min(max, Math.max(min, Number.isFinite(op.mm) ? op.mm : 0)))
  return { ...op, mm }
}

function applyOne(pattern: Mutable, raw: PatternOp) {
  const op = clamp(raw)
  const bodies = pattern.pieces.filter((piece) => BODY_ANCHORS.has(piece.place.anchor) && piece.outline)

  switch (op.op) {
    case 'lengthen':
      for (const piece of bodies) {
        movePoints(piece, roleIds(piece, 'hem'), (point) => {
          point.y -= op.mm
        })
      }
      break

    case 'widen':
    case 'flare': {
      // Each piece grows by `mm` in all: half on each side of its centre line.
      const role: PatternRole = op.op === 'widen' ? 'side' : 'hem'

      for (const piece of bodies) {
        const ids = roleIds(piece, role)
        const hem = op.op === 'flare' ? [...ids] : []
        // Flare moves only the hem's two ends.
        const ends = op.op === 'flare' ? new Set([hem[0], hem[hem.length - 1]].filter(Boolean) as string[]) : ids
        movePoints(piece, ends, (point) => {
          if (point.x !== 0) {
            point.x += Math.sign(point.x) * Math.round(op.mm / 2)
          }
        })
      }
      break
    }

    case 'hemCurve':
      for (const piece of bodies) {
        const isBack = BACK_ANCHORS.has(piece.place.anchor)

        if ((op.piece === 'front' && isBack) || (op.piece === 'back' && !isBack)) {
          continue
        }

        const hem = (piece.outline ?? []).filter((point) => roleIds(piece, 'hem').has(point.id))

        if (hem.length !== 2) {
          continue
        }

        const [first, last] = hem as [PatternPoint, PatternPoint]
        const third = Math.round((last.x - first.x) / 3)

        if (op.mm === 0) {
          delete first.ho
          delete last.hi
        } else {
          first.ho = [third, -op.mm]
          last.hi = [-third, -op.mm]
        }
      }
      break

    case 'neckline':
      for (const piece of pattern.pieces) {
        const neck = (piece.outline ?? []).filter((point) => roleIds(piece, 'neck').has(point.id))

        // The ends meet the shoulders; the points between them drop.
        for (const point of neck.slice(1, -1)) {
          point.y -= op.mm
        }
      }
      break

    case 'sleeve': {
      const sides = op.side === 'both' ? ['left', 'right'] : [op.side]

      for (const side of sides) {
        const sleeve = pattern.pieces.find((piece) => piece.place.anchor === `arm-${side}`)

        if (!sleeve) {
          continue
        }

        // One sleeve alone: its mirror (or its source) keeps the old shape.
        if (op.side !== 'both') {
          detachMirrors(pattern, sleeve.id)
          materialise(pattern, sleeve.id)
        } else if (sleeve.mirrorOf) {
          continue
        }

        const current = pattern.pieces.find((piece) => piece.id === sleeve.id)!
        movePoints(current, roleIds(current, 'cuff'), (point) => {
          point.y -= op.mm
        })
      }
      break
    }
  }
}

export type OpsResult = { ok: true; pattern: CanonicalPattern } | { ok: false; issues: GeometryIssue[] }

/**
 * Applies the ops in order to a copy, clamping each to its bounds. The
 * result is refused if it can't be sewn.
 */
export function applyPatternOps({
  pattern,
  ops,
  frames,
}: {
  pattern: CanonicalPattern
  ops: readonly PatternOp[]
  frames?: Record<string, PanelFrame>
}): OpsResult {
  const next = clone(pattern)

  for (const op of ops) {
    applyOne(next, op)
  }

  const issues = validateGeometry({ pattern: next, frames })
  return issues.length > 0 ? { ok: false, issues } : { ok: true, pattern: next }
}

/** Whether a value is a well-formed op (for the AI's output and stored edits). */
export function isPatternOp(value: unknown): value is PatternOp {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as Record<string, unknown>

  if (typeof entry.op !== 'string' || !(entry.op in PATTERN_OP_LIMITS) || typeof entry.mm !== 'number' || !Number.isFinite(entry.mm)) {
    return false
  }

  const allowed = new Set(['op', 'mm', ...(entry.op === 'sleeve' ? ['side'] : entry.op === 'hemCurve' ? ['piece'] : [])])

  if (Object.keys(entry).some((key) => !allowed.has(key))) {
    return false
  }

  if (entry.op === 'sleeve') {
    return entry.side === 'left' || entry.side === 'right' || entry.side === 'both'
  }

  if (entry.op === 'hemCurve' && 'piece' in entry) {
    return entry.piece === 'front' || entry.piece === 'back' || entry.piece === 'all'
  }

  return true
}
