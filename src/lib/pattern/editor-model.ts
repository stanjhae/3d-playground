import { flattenOutline } from './bezier.ts'
import { expandPieces } from './mirror.ts'
import type { CanonicalPattern, PatternPiece, PatternPoint } from './pattern-document.ts'
import { type GeometryIssue, describeGeometryIssue, validateGeometry } from './validate-geometry.ts'
import { PATTERN_OP_LIMITS, type PatternOp, applyPatternOps } from './pattern-ops.ts'

/**
 * The pattern editor's pure side: laying the pieces out on the sheet, SVG
 * paths, moving and nudging points, and checking an edit before it's
 * committed. The editor commits only a pattern that can be sewn.
 */

export type SheetPiece = {
  id: string
  label: string
  /** Mirrors are drawn but edited through their source. */
  mirrorOf?: string
  outline: PatternPoint[]
  /** Where the piece's (0, 0) sits on the sheet, millimetres, y up. */
  offset: [number, number]
  box: { minX: number; minY: number; maxX: number; maxY: number }
}

export type Sheet = { pieces: SheetPiece[]; width: number; height: number }

const GAP_MM = 80

/** Pieces in rows, upper body first, so the sheet reads like a pattern layout. */
export function layoutSheet({ pattern, rowWidth = 1600 }: { pattern: CanonicalPattern; rowWidth?: number }): Sheet {
  const drawn = expandPieces({ pattern })
  const pieces: SheetPiece[] = []
  let x = 0
  let y = 0
  let rowHeight = 0
  let width = 0

  for (const piece of drawn) {
    const points = flattenOutline({ outline: piece.outline }).points
    const box = {
      minX: Math.min(...points.map(([px]) => px)),
      minY: Math.min(...points.map(([, py]) => py)),
      maxX: Math.max(...points.map(([px]) => px)),
      maxY: Math.max(...points.map(([, py]) => py)),
    }
    const w = box.maxX - box.minX
    const h = box.maxY - box.minY

    if (x > 0 && x + w > rowWidth) {
      y += rowHeight + GAP_MM
      x = 0
      rowHeight = 0
    }

    const source = pattern.pieces.find((entry) => entry.id === piece.id)
    pieces.push({
      id: piece.id,
      label: piece.label,
      ...(source?.mirrorOf ? { mirrorOf: source.mirrorOf } : {}),
      outline: piece.outline,
      offset: [x - box.minX, -(y + h) - box.minY],
      box,
    })
    x += w + GAP_MM
    rowHeight = Math.max(rowHeight, h)
    width = Math.max(width, x)
  }

  // Sheet coordinates: y down for SVG, so flip each piece's y.
  return { pieces, width: Math.max(1, width - GAP_MM), height: y + rowHeight }
}

/** A sheet point (SVG, y down) for a piece point. */
export function toSheet(piece: SheetPiece, x: number, y: number): [number, number] {
  return [piece.offset[0] + x, -(piece.offset[1] + y)]
}

/** The piece outline as an SVG path, curves included. */
export function piecePath(piece: SheetPiece): string {
  const { outline } = piece
  const parts: string[] = []

  outline.forEach((point, index) => {
    const [sx, sy] = toSheet(piece, point.x, point.y)

    if (index === 0) {
      parts.push(`M${sx} ${sy}`)
    }

    const next = outline[(index + 1) % outline.length]!
    const [nx, ny] = toSheet(piece, next.x, next.y)

    if (point.ho || next.hi) {
      const [c1x, c1y] = toSheet(piece, point.x + (point.ho?.[0] ?? 0), point.y + (point.ho?.[1] ?? 0))
      const [c2x, c2y] = toSheet(piece, next.x + (next.hi?.[0] ?? 0), next.y + (next.hi?.[1] ?? 0))
      parts.push(`C${c1x} ${c1y} ${c2x} ${c2y} ${nx} ${ny}`)
    } else {
      parts.push(`L${nx} ${ny}`)
    }
  })

  return `${parts.join(' ')} Z`
}

/** The drawn piece an edit to `pieceId` lands on, and whether x flips (a mirror). */
export function editTarget({ pattern, pieceId }: { pattern: CanonicalPattern; pieceId: string }) {
  const piece = pattern.pieces.find((entry) => entry.id === pieceId)
  return piece?.mirrorOf ? { pieceId: piece.mirrorOf, flipX: true } : { pieceId, flipX: false }
}

type PointPart = 'point' | 'hi' | 'ho'

/**
 * Moves a point (or one of its handles) by `dx`, `dy` millimetres on the
 * piece the user sees. A mirror's edit lands on its source, x flipped, so
 * both sleeves stay a pair. Whole millimetres, within the stored range.
 */
export function movePoint({
  pattern,
  pieceId,
  pointId,
  part = 'point',
  dx,
  dy,
}: {
  pattern: CanonicalPattern
  pieceId: string
  pointId: string
  part?: PointPart
  dx: number
  dy: number
}): CanonicalPattern {
  const next = structuredClone(pattern)
  const target = editTarget({ pattern, pieceId })
  const piece = next.pieces.find((entry) => entry.id === target.pieceId) as PatternPiece | undefined
  const point = piece?.outline?.find((entry) => entry.id === pointId)

  if (!point) {
    return pattern
  }

  const mx = target.flipX ? -dx : dx
  // On a mirror the incoming and outgoing handles swap.
  const handle = target.flipX && part !== 'point' ? (part === 'hi' ? 'ho' : 'hi') : part
  const clamp = (value: number) => Math.max(-3000, Math.min(3000, Math.round(value)))

  if (handle === 'point') {
    point.x = clamp(point.x + mx)
    point.y = clamp(point.y + dy)
  } else {
    const current = point[handle] ?? [0, 0]
    point[handle] = [clamp(current[0] + mx), clamp(current[1] + dy)]

    // A smooth point keeps its handles in line.
    if (point.k === 's') {
      const other = handle === 'hi' ? 'ho' : 'hi'
      const [hx, hy] = point[handle]!
      const length = Math.hypot(...(point[other] ?? [0, 0]))
      const scale = length / (Math.hypot(hx, hy) || 1)
      point[other] = [clamp(-hx * scale), clamp(-hy * scale)]
    }
  }

  return next
}

export type EditCheck = { ok: true } | { ok: false; messages: string[] }

/** Whether a pattern may be committed, with plain reasons when not. */
export function checkEdit({ pattern, frames }: { pattern: CanonicalPattern; frames?: Parameters<typeof validateGeometry>[0]['frames'] }): EditCheck {
  const issues: GeometryIssue[] = validateGeometry({ pattern, frames })

  if (issues.length === 0) {
    return { ok: true }
  }

  const labelOf = (id: string) => pattern.pieces.find((piece) => piece.id === id)?.label ?? 'A piece'
  return { ok: false, messages: [...new Set(issues.map((issue) => describeGeometryIssue({ issue, labelOf })))] }
}

/** Quick edits: named, bounded changes for sliders (and the AI assist). */
export const QUICK_EDITS: readonly { id: string; label: string; op: (mm: number) => PatternOp; limits: { min: number; max: number }; unit: string }[] = [
  { id: 'length', label: 'Length', op: (mm) => ({ op: 'lengthen', mm }), limits: PATTERN_OP_LIMITS.lengthen, unit: 'mm' },
  { id: 'width', label: 'Width', op: (mm) => ({ op: 'widen', mm }), limits: PATTERN_OP_LIMITS.widen, unit: 'mm' },
  { id: 'flare', label: 'Flare', op: (mm) => ({ op: 'flare', mm }), limits: PATTERN_OP_LIMITS.flare, unit: 'mm' },
  { id: 'hem-curve', label: 'Hem curve', op: (mm) => ({ op: 'hemCurve', mm }), limits: PATTERN_OP_LIMITS.hemCurve, unit: 'mm' },
  { id: 'neckline', label: 'Neckline', op: (mm) => ({ op: 'neckline', mm }), limits: PATTERN_OP_LIMITS.neckline, unit: 'mm' },
  { id: 'sleeve-left', label: 'Left sleeve', op: (mm) => ({ op: 'sleeve', side: 'left', mm }), limits: PATTERN_OP_LIMITS.sleeve, unit: 'mm' },
  { id: 'sleeve-right', label: 'Right sleeve', op: (mm) => ({ op: 'sleeve', side: 'right', mm }), limits: PATTERN_OP_LIMITS.sleeve, unit: 'mm' },
]

/** A quick edit applied to the pattern as it was when the slider was picked up. */
export function quickEdit({ pattern, id, mm, frames }: { pattern: CanonicalPattern; id: string; mm: number; frames?: Parameters<typeof validateGeometry>[0]['frames'] }) {
  const edit = QUICK_EDITS.find((entry) => entry.id === id)

  if (!edit || mm === 0) {
    return { ok: true as const, pattern }
  }

  return applyPatternOps({ pattern, ops: [edit.op(mm)], frames })
}

/** Whether a pattern has the anchors a quick edit needs (no sleeves, no sleeve sliders). */
export function quickEditsFor({ pattern }: { pattern: CanonicalPattern }) {
  const anchors = new Set(pattern.pieces.map((piece) => piece.place.anchor))
  const roles = new Set(pattern.pieces.flatMap((piece) => Object.keys(piece.roles ?? {})))
  return QUICK_EDITS.filter((edit) => {
    if (edit.id === 'sleeve-left') return anchors.has('arm-left')
    if (edit.id === 'sleeve-right') return anchors.has('arm-right')
    if (edit.id === 'neckline') return roles.has('neck')
    return true
  })
}
