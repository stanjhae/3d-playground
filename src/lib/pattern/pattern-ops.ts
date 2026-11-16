import { mirrorOutline } from './mirror.ts'
import { pointAlongRun, removeOutlinePoint, runLength, splitEdge } from './outline-edit.ts'
import type { CanonicalPattern, PatternPiece, PatternPoint, PatternRole, PatternSeam } from './pattern-document.ts'
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
  /**
   * Opens a seam `mm` up from its hem (or cuff) end: the side seam nearest
   * the hem on `piece`, or the named `seam`.
   */
  | { op: 'slit'; piece: string; seam?: string; mm: number }

/** Inclusive millimetre bounds per op. */
export const PATTERN_OP_LIMITS = {
  lengthen: { min: -250, max: 400 },
  widen: { min: -80, max: 150 },
  flare: { min: -60, max: 250 },
  hemCurve: { min: -150, max: 150 },
  neckline: { min: 0, max: 160 },
  sleeve: { min: -250, max: 500 },
  slit: { min: 30, max: 400 },
} as const satisfies Record<PatternOp['op'], { min: number; max: number }>

export const PATTERN_OPS = Object.keys(PATTERN_OP_LIMITS) as PatternOp['op'][]

/** A slit leaves at least this much of its seam sewn. */
export const SLIT_MIN_SEWN_MM = 40
/** A slit end this close to an existing point uses that point. */
const SLIT_SNAP_MM = 3

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

    case 'slit':
      slit(pattern, op)
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

/** The id of the point a slit adds on one side of a seam. */
export function slitPointId({ seam, side }: { seam: string; side: 'a' | 'b' }) {
  return `${seam}-slit-${side}`.slice(0, 40)
}

const HEM_ROLES: PatternRole[] = ['hem', 'cuff']

function drawnOutline(pattern: Mutable, pieceId: string) {
  const piece = pattern.pieces.find((entry) => entry.id === pieceId)

  if (!piece) {
    return undefined
  }

  if (piece.mirrorOf) {
    return mirrorOutline(pattern.pieces.find((entry) => entry.id === piece.mirrorOf)?.outline ?? [])
  }

  return piece.outline
}

/** Which end of a seam is its hem end: the lower one, on side `a`. */
function hemEnd(pattern: Mutable, seam: PatternSeam): { a: 'from' | 'to'; b: 'from' | 'to' } | null {
  const outline = drawnOutline(pattern, seam.a.piece)
  const from = outline?.find((point) => point.id === seam.a.from)
  const to = outline?.find((point) => point.id === seam.a.to)

  if (!from || !to) {
    return null
  }

  // `a.from` meets `b.to`.
  return from.y <= to.y ? { a: 'from', b: 'to' } : { a: 'to', b: 'from' }
}

/**
 * The seams a slit on `pieceId` may open, nearest the hem first: those
 * with an end on a hem or cuff point (or an earlier slit), on this piece.
 * One already slit comes first.
 */
export function slitSeams({ pattern, pieceId }: { pattern: CanonicalPattern; pieceId: string }): PatternSeam[] {
  const piece = pattern.pieces.find((entry) => entry.id === pieceId)
  const outline = piece ? drawnOutline(pattern, pieceId) : undefined

  if (!piece || !outline) {
    return []
  }

  const source = piece.mirrorOf ? pattern.pieces.find((entry) => entry.id === piece.mirrorOf) : undefined
  const roles = piece.roles ?? source?.roles ?? {}
  const hems = new Set(HEM_ROLES.flatMap((role) => roles[role] ?? []))
  const candidates: { seam: PatternSeam; slit: boolean; y: number; order: number }[] = []

  pattern.seams.forEach((seam, order) => {
    for (const name of ['a', 'b'] as const) {
      const side = seam[name]

      if (side.piece !== pieceId) {
        continue
      }

      const slitId = slitPointId({ seam: seam.id, side: name })
      const ends = [side.from, side.to].filter((id) => hems.has(id) || id === slitId)
      const point = outline.find((entry) => entry.id === ends[0])

      if (ends.length === 1 && point) {
        candidates.push({ seam, slit: ends[0] === slitId, y: point.y, order })
        return
      }
    }
  })

  // A seam already slit comes first, so slitting the piece again moves that slit.
  return candidates.sort((p, q) => Number(q.slit) - Number(p.slit) || p.y - q.y || p.order - q.order).map((entry) => entry.seam)
}

/** The longest slit the seam takes, millimetres (0 when it takes none). */
export function maxSlitMm({ pattern, seamId }: { pattern: CanonicalPattern; seamId: string }) {
  const seam = pattern.seams.find((entry) => entry.id === seamId)

  if (!seam) {
    return 0
  }

  // Measured with any slit there already taken back out.
  const open = clone(pattern)
  unslit(open, open.seams.find((entry) => entry.id === seamId)!)
  const opened = open.seams.find((entry) => entry.id === seamId)!
  let shortest = Infinity

  for (const name of ['a', 'b'] as const) {
    const outline = drawnOutline(open, opened[name].piece) ?? []
    shortest = Math.min(shortest, runLength({ outline, from: opened[name].from, to: opened[name].to }))
  }

  const most = Math.min(PATTERN_OP_LIMITS.slit.max, Math.floor(shortest - SLIT_MIN_SEWN_MM))
  return most >= PATTERN_OP_LIMITS.slit.min ? most : 0
}

/** A piece drawn on its own: its mirrors keep its shape, and a mirror gets its own outline. */
function standAlone(pattern: Mutable, pieceId: string) {
  detachMirrors(pattern, pieceId)
  materialise(pattern, pieceId)
  return pattern.pieces.find((entry) => entry.id === pieceId)!
}

/**
 * Takes a slit this seam already has back out: its slit points go and
 * each side's hem end returns to the hem (or cuff) point below.
 */
function unslit(pattern: Mutable, seam: PatternSeam) {
  const ends = hemEnd(pattern, seam)

  if (!ends) {
    return
  }

  for (const name of ['a', 'b'] as const) {
    const side = seam[name]
    const end = ends[name]
    const id = slitPointId({ seam: seam.id, side: name })

    if (side[end] !== id) {
      continue
    }

    const piece = standAlone(pattern, side.piece)
    const outline = piece.outline!
    const hems = new Set(HEM_ROLES.flatMap((role) => piece.roles?.[role] ?? []))
    const n = outline.length
    const at = outline.findIndex((point) => point.id === id)
    // The open stretch lies before `from` and after `to`, counter-clockwise.
    const step = end === 'from' ? -1 : 1
    let reference = outline[(at + step + n) % n]!.id

    for (let k = 1; k < n; k += 1) {
      const candidate = outline[(at + step * k + n * n) % n]!.id

      if (hems.has(candidate)) {
        reference = candidate
        break
      }
    }

    side[end] = reference
    piece.outline = removeOutlinePoint({ outline, id })
  }
}

/** The pattern with the seam's slit sewn back up (no change if it has none). */
export function closeSlit({ pattern, seamId }: { pattern: CanonicalPattern; seamId: string }): CanonicalPattern {
  const next = clone(pattern)
  const seam = next.seams.find((entry) => entry.id === seamId)

  if (seam) {
    unslit(next, seam)
  }

  return next
}

function slit(pattern: Mutable, op: Extract<PatternOp, { op: 'slit' }>) {
  const seam = op.seam
    ? pattern.seams.find((entry) => entry.id === op.seam && (entry.a.piece === op.piece || entry.b.piece === op.piece))
    : slitSeams({ pattern, pieceId: op.piece })[0]

  if (!seam) {
    return
  }

  unslit(pattern, seam)
  const ends = hemEnd(pattern, seam)
  const most = maxSlitMm({ pattern, seamId: seam.id })

  if (!ends || most === 0) {
    return
  }

  const mm = Math.min(op.mm, most)

  for (const name of ['a', 'b'] as const) {
    const side = seam[name]
    const end = ends[name]
    const piece = standAlone(pattern, side.piece)
    const outline = piece.outline!
    const at = pointAlongRun({ outline, from: side.from, to: side.to, mm, fromEnd: end === 'to' })

    if (!at) {
      continue
    }

    const id = slitPointId({ seam: seam.id, side: name })
    const n = outline.length
    const next = (at.index + 1) % n
    // Close to a point already there: that point is the new end.
    const edge = runLength({ outline, from: outline[at.index]!.id, to: outline[next]!.id })
    const snap = at.t * edge <= SLIT_SNAP_MM ? at.index : (1 - at.t) * edge <= SLIT_SNAP_MM ? next : -1

    if (snap >= 0) {
      side[end] = outline[snap]!.id
      continue
    }

    piece.outline = splitEdge({ outline, index: at.index, t: at.t, id })
    side[end] = id
  }
}

export type OpsResult =
  | { ok: true; pattern: CanonicalPattern }
  /** `attempted` is the edit as it would have been, for saying why it can't be sewn. */
  | { ok: false; issues: GeometryIssue[]; attempted: CanonicalPattern }

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
  return issues.length > 0 ? { ok: false, issues, attempted: next } : { ok: true, pattern: next }
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

  const extra: Record<string, string[]> = { sleeve: ['side'], hemCurve: ['piece'], slit: ['piece', 'seam'] }
  const allowed = new Set(['op', 'mm', ...(extra[entry.op] ?? [])])

  if (Object.keys(entry).some((key) => !allowed.has(key))) {
    return false
  }

  if (entry.op === 'slit') {
    const isId = (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 40 && /^[A-Za-z0-9_-]+$/.test(id)
    return isId(entry.piece) && (!('seam' in entry) || isId(entry.seam))
  }

  if (entry.op === 'sleeve') {
    return entry.side === 'left' || entry.side === 'right' || entry.side === 'both'
  }

  if (entry.op === 'hemCurve' && 'piece' in entry) {
    return entry.piece === 'front' || entry.piece === 'back' || entry.piece === 'all'
  }

  return true
}
