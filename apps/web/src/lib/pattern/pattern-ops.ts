import { mirrorHoles, mirrorOutline } from './mirror.ts'
import { pointAlongRun, removeOutlinePoint, runLength, splitEdge } from './outline-edit.ts'
import {
  type CanonicalPattern,
  PATTERN_LIMITS,
  PATTERN_ROLES,
  type PatternPiece,
  type PatternPoint,
  type PatternRole,
  type PatternSeam,
} from './pattern-document.ts'
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
  /**
   * Cuts a hole `wMm` wide and `hMm` tall in `piece`, centred `dx`, `dy`
   * millimetres from `at`: the middle of the points a role names, or the
   * middle of the piece (`centre`, the default). A circle is `wMm` across.
   */
  | {
      op: 'cutout'
      piece: string
      shape: CutoutShape
      at?: PatternRole | 'centre'
      dx: number
      dy: number
      wMm: number
      hMm: number
    }

export const CUTOUT_SHAPES = ['circle', 'oval', 'teardrop', 'keyhole'] as const
export type CutoutShape = (typeof CUTOUT_SHAPES)[number]

/** Inclusive millimetre bounds per op (a cut-out's are for its width and height). */
export const PATTERN_OP_LIMITS = {
  lengthen: { min: -250, max: 400 },
  widen: { min: -80, max: 150 },
  flare: { min: -60, max: 250 },
  hemCurve: { min: -150, max: 150 },
  neckline: { min: 0, max: 160 },
  sleeve: { min: -250, max: 500 },
  slit: { min: 30, max: 400 },
  cutout: { min: 25, max: 300 },
} as const satisfies Record<PatternOp['op'], { min: number; max: number }>

export const PATTERN_OPS = Object.keys(PATTERN_OP_LIMITS) as PatternOp['op'][]

/** How far a cut-out's centre may sit from where it's measured, each way. */
export const CUTOUT_OFFSET_LIMITS = { min: -600, max: 600 } as const

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
  const { mirrorOf: _mirror, holes: _holes, ...rest } = piece
  const index = pattern.pieces.indexOf(piece)
  const holes = mirrorHoles(source?.holes)
  pattern.pieces[index] = { ...rest, outline: mirrorOutline(source?.outline ?? []), roles: piece.roles ?? source?.roles, ...(holes ? { holes } : {}) }
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

function bound(value: number, { min, max }: { min: number; max: number }) {
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0)))
}

/** The op with every number whole and within its bounds. */
export function clampPatternOp(op: PatternOp): PatternOp {
  if (op.op === 'cutout') {
    const size = PATTERN_OP_LIMITS.cutout
    return { ...op, dx: bound(op.dx, CUTOUT_OFFSET_LIMITS), dy: bound(op.dy, CUTOUT_OFFSET_LIMITS), wMm: bound(op.wMm, size), hMm: bound(op.hMm, size) }
  }

  return { ...op, mm: bound(op.mm, PATTERN_OP_LIMITS[op.op]) }
}

function applyOne(pattern: Mutable, raw: PatternOp) {
  const op = clampPatternOp(raw)

  if (op.op === 'cutout') {
    cutout(pattern, op)
    return
  }

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

type Point = [number, number]

/**
 * A cut-out's outline, centred on (0, 0), clockwise, at most 32 points:
 * a point about every 3 cm round it, never fewer than 8.
 */
export function cutoutOutline({ shape, wMm, hMm }: { shape: CutoutShape; wMm: number; hMm: number }): Point[] {
  const count = (perimeter: number) => Math.min(PATTERN_LIMITS.pointsPerHole.max, Math.max(8, Math.round(perimeter / 30)))
  /** `n` steps from angle `from` to `to`; both ends included. */
  const arc = (cy: number, r: number, from: number, to: number, n: number) => {
    const out: Point[] = []

    for (let i = 0; i <= n; i += 1) {
      const t = from + ((to - from) * i) / n
      out.push([r * Math.cos(t), cy + r * Math.sin(t)])
    }

    return out
  }
  let ccw: Point[]

  if (shape === 'circle' || shape === 'oval') {
    const rx = wMm / 2
    const ry = shape === 'circle' ? rx : hMm / 2
    // Ramanujan's ellipse perimeter.
    // A multiple of four points, so the ring touches its full width and height.
    const n = Math.min(PATTERN_LIMITS.pointsPerHole.max, 4 * Math.round(count(Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))) / 4))
    ccw = Array.from({ length: n }, (_, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n
      return [rx * Math.cos(t), ry * Math.sin(t)] as Point
    })
  } else if (shape === 'teardrop') {
    // A round bottom `wMm` across, rising to a point at the top.
    const r = wMm / 2
    const h = Math.max(hMm, wMm * 1.25)
    const cy = -h / 2 + r
    const beta = Math.acos(r / (h - r))
    const from = Math.PI / 2 + beta
    const to = Math.PI / 2 - beta + 2 * Math.PI
    // Counter-clockwise: the tip, down the left, round the bottom, up the right.
    ccw = [[0, h / 2], ...arc(cy, r, from, to, count((to - from) * r) - 2)]
  } else {
    // A round top `wMm` across over a slot 0.4 of that, down to `hMm`.
    const r = wMm / 2
    const h = Math.max(hMm, wMm * 1.5)
    const cy = h / 2 - r
    const half = wMm * 0.2
    const join = Math.acos(half / r)
    const from = -join
    const to = Math.PI + join
    ccw = [[-half, -h / 2], [half, -h / 2], ...arc(cy, r, from, to, count((to - from) * r) - 3)]
  }

  const out: Point[] = []

  for (const [x, y] of ccw.reverse()) {
    const point: Point = [Math.round(x), Math.round(y)]
    const last = out[out.length - 1]

    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      out.push(point)
    }
  }

  while (out.length > 1 && out[0]![0] === out[out.length - 1]![0] && out[0]![1] === out[out.length - 1]![1]) {
    out.pop()
  }

  return out
}

/** The id of point `index` on a piece's cut-out `hole` (the lowest number free when it was cut). */
export function cutoutPointId({ hole, index }: { hole: number; index: number }) {
  return `cut${hole}-${index}`
}

/** Where a cut-out is measured from on a drawn outline, or null when the role isn't there. */
function cutoutAnchor(roles: PatternPiece['roles'], outline: readonly PatternPoint[], at: PatternRole | 'centre'): Point | null {
  if (at === 'centre') {
    const xs = outline.map((point) => point.x)
    const ys = outline.map((point) => point.y)
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  }

  const ids = new Set(roles?.[at] ?? [])
  const named = outline.filter((point) => ids.has(point.id))

  if (named.length === 0) {
    return null
  }

  return [named.reduce((sum, point) => sum + point.x, 0) / named.length, named.reduce((sum, point) => sum + point.y, 0) / named.length]
}

/**
 * Adds a cut-out to a drawn piece in place, measured on that piece; false
 * (and no change) when it has four already or lacks the role. `roles`
 * defaults to the piece's own.
 */
export function placeCutout({
  piece,
  op,
  roles = piece.roles,
}: {
  piece: { outline: PatternPoint[]; holes?: PatternPoint[][]; roles?: PatternPiece['roles'] }
  op: Extract<PatternOp, { op: 'cutout' }>
  roles?: PatternPiece['roles']
}): boolean {
  const holes = piece.holes ?? []
  const anchor = cutoutAnchor(roles, piece.outline, op.at ?? 'centre')

  if (holes.length >= PATTERN_LIMITS.holesPerPiece || !anchor) {
    return false
  }

  const ids = new Set([...piece.outline, ...holes.flat()].map((point) => point.id))
  let hole = 0

  while (ids.has(cutoutPointId({ hole, index: 0 }))) {
    hole += 1
  }

  const { dx, dy, wMm, hMm, shape } = clampPatternOp(op) as typeof op
  const cx = Math.round(anchor[0] + dx)
  const cy = Math.round(anchor[1] + dy)
  const ring = cutoutOutline({ shape, wMm, hMm }).map(([x, y], index) => ({ id: cutoutPointId({ hole, index }), x: cx + x, y: cy + y }))
  piece.holes = [...holes, ring]
  return true
}

function cutout(pattern: Mutable, op: Extract<PatternOp, { op: 'cutout' }>) {
  const target = pattern.pieces.find((entry) => entry.id === op.piece)

  if (!target) {
    return
  }

  // Tried on a copy first, so a cut that can't be placed changes nothing.
  const source = target.mirrorOf ? pattern.pieces.find((entry) => entry.id === target.mirrorOf) : undefined
  const trial = { outline: drawnOutline(pattern, op.piece) ?? [], holes: target.mirrorOf ? mirrorHoles(source?.holes) : target.holes }

  if (!placeCutout({ piece: trial, op, roles: target.roles ?? source?.roles })) {
    return
  }

  // Cut on one piece alone: a mirror gets its own outline, and mirrors of this piece keep theirs.
  const piece = standAlone(pattern, op.piece)
  piece.holes = trial.holes
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
  const isId = (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 40 && /^[A-Za-z0-9_-]+$/.test(id)
  const isNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n)

  if (entry.op === 'cutout') {
    const allowed = new Set(['op', 'piece', 'shape', 'at', 'dx', 'dy', 'wMm', 'hMm'])
    return (
      Object.keys(entry).every((key) => allowed.has(key)) &&
      isId(entry.piece) &&
      (CUTOUT_SHAPES as readonly unknown[]).includes(entry.shape) &&
      (!('at' in entry) || entry.at === 'centre' || (PATTERN_ROLES as readonly unknown[]).includes(entry.at)) &&
      [entry.dx, entry.dy, entry.wMm, entry.hMm].every(isNumber)
    )
  }

  if (typeof entry.op !== 'string' || !(entry.op in PATTERN_OP_LIMITS) || !isNumber(entry.mm)) {
    return false
  }

  const extra: Record<string, string[]> = { sleeve: ['side'], hemCurve: ['piece'], slit: ['piece', 'seam'] }
  const allowed = new Set(['op', 'mm', ...(extra[entry.op] ?? [])])

  if (Object.keys(entry).some((key) => !allowed.has(key))) {
    return false
  }

  if (entry.op === 'slit') {
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
