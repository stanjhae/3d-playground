/**
 * The `pattern` block of a canonical document (pattern v1): the garment as
 * flat sewing-pattern pieces with seams between them. A design stores one
 * only when it uses Pattern mode; the 3D garment is then the pieces sewn
 * and draped on the body, and prints follow the pieces (docs/canonical-document.md).
 *
 * Units are whole millimetres in each piece's own flat frame, y up. Outlines
 * run counter-clockwise and are cubic Béziers: a point's `hi`/`ho` are its
 * incoming and outgoing handles, as offsets from the point; a point without
 * them meets its neighbours in straight lines.
 *
 * This file only checks shape and references. Whether a pattern can be sewn
 * (a simple outline, matching seam lengths) is `validate-geometry.ts`.
 */

export const PATTERN_VERSION = 1

export const PATTERN_LIMITS = {
  pieces: 24,
  pointsPerPiece: 64,
  seams: 48,
  /** Any coordinate or handle, in millimetres. */
  coordinate: 3000,
  idLength: 40,
  labelLength: 40,
  /** Point ids a role may name. */
  roleIds: 16,
} as const

export const PATTERN_POINT_KINDS = ['c', 's'] as const
export const PATTERN_ROLES = ['hem', 'neck', 'side', 'cuff', 'shoulder', 'waist', 'armhole', 'center', 'hood'] as const
export const PATTERN_ANCHORS = [
  'front',
  'back',
  'side-left',
  'side-right',
  'arm-left',
  'arm-right',
  'neck',
  'head',
  'hip-front',
  'hip-back',
  'leg-left',
  'leg-right',
] as const
export const PATTERN_WRAPS = ['plane', 'cylinder'] as const
export const PATTERN_FABRICS = ['jersey', 'woven', 'fleece', 'denim', 'satin', 'firm'] as const
export const PATTERN_SEAM_KINDS = ['sew', 'ease'] as const

export type PatternRole = (typeof PATTERN_ROLES)[number]
export type PatternAnchor = (typeof PATTERN_ANCHORS)[number]
export type PatternFabric = (typeof PATTERN_FABRICS)[number]

type Pair = [number, number]

export type PatternPoint = {
  id: string
  x: number
  y: number
  /** Corner (handles move apart) or smooth (handles stay in line). Default corner. */
  k?: (typeof PATTERN_POINT_KINDS)[number]
  hi?: Pair
  ho?: Pair
}

export type PatternPlacement = {
  anchor: PatternAnchor
  wrap: (typeof PATTERN_WRAPS)[number]
  /** Millimetres from the anchor, before the drape. */
  offset: [number, number, number]
  /** Degrees about the anchor's facing. */
  rot: number
}

type PieceCommon = {
  id: string
  /** The print panel this piece takes its artwork from. */
  panel: string
  label: string
  /** Where the piece's (0, 0) sits in its panel's frame, millimetres. */
  panelOrigin: Pair
  roles?: Partial<Record<PatternRole, string[]>>
  place: PatternPlacement
  fabric?: PatternFabric
}

/** A piece drawn in full, or the mirror image of another (a left sleeve of the right). */
export type PatternPiece = (PieceCommon & { outline: PatternPoint[]; mirrorOf?: undefined }) | (PieceCommon & { mirrorOf: string; outline?: undefined })

export type PatternSeamSide = { piece: string; from: string; to: string }

/** `a` and `b` each run counter-clockwise on their piece from `from` to `to`; `a.from` meets `b.to`. */
export type PatternSeam = { id: string; a: PatternSeamSide; b: PatternSeamSide; kind: (typeof PATTERN_SEAM_KINDS)[number] }

export type CanonicalPattern = {
  v: typeof PATTERN_VERSION
  /** The pattern template this one started from. */
  basis: { templateId: string; templateVersion: number; patternVersion: number }
  pieces: PatternPiece[]
  seams: PatternSeam[]
}

type Report = (path: string, message: string) => void

const ID_PATTERN = /^[A-Za-z0-9_-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function record(report: Report, value: unknown, path: string, required: readonly string[], optional: readonly string[] = []) {
  if (!isRecord(value)) {
    report(path, 'expected an object')
    return null
  }

  const allowed = new Set([...required, ...optional])

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      report(`${path}.${key}`, 'unknown field')
    }
  }

  for (const key of required) {
    if (!(key in value)) {
      report(`${path}.${key}`, 'required')
    }
  }

  return value
}

function integer(report: Report, value: unknown, path: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    report(path, 'expected an integer')
    return false
  }

  if (value < min || value > max) {
    report(path, `out of range [${min}, ${max}]`)
    return false
  }

  return true
}

function coordinate(report: Report, value: unknown, path: string) {
  return integer(report, value, path, -PATTERN_LIMITS.coordinate, PATTERN_LIMITS.coordinate)
}

function pair(report: Report, value: unknown, path: string) {
  if (!Array.isArray(value) || value.length !== 2) {
    report(path, 'expected [x, y]')
    return
  }

  coordinate(report, value[0], `${path}[0]`)
  coordinate(report, value[1], `${path}[1]`)
}

function oneOf(report: Report, value: unknown, path: string, options: readonly string[]) {
  if (typeof value !== 'string' || !options.includes(value)) {
    report(path, `expected one of ${options.join(', ')}`)
    return false
  }

  return true
}

function id(report: Report, value: unknown, path: string, seen?: Set<string>) {
  if (typeof value !== 'string' || value.length === 0 || value.length > PATTERN_LIMITS.idLength || !ID_PATTERN.test(value)) {
    report(path, 'expected a stable id')
    return false
  }

  if (seen) {
    if (seen.has(value)) {
      report(path, `duplicate id ${value}`)
      return false
    }

    seen.add(value)
  }

  return true
}

function array(report: Report, value: unknown, path: string, min: number, max: number): unknown[] | null {
  if (!Array.isArray(value)) {
    report(path, 'expected an array')
    return null
  }

  if (value.length < min) {
    report(path, `fewer than ${min} items`)
    return null
  }

  if (value.length > max) {
    report(path, `more than ${max} items`)
    return null
  }

  return value
}

function checkPoint(report: Report, value: unknown, path: string, seen: Set<string>) {
  const point = record(report, value, path, ['id', 'x', 'y'], ['k', 'hi', 'ho'])

  if (!point) {
    return
  }

  id(report, point.id, `${path}.id`, seen)
  coordinate(report, point.x, `${path}.x`)
  coordinate(report, point.y, `${path}.y`)

  if ('k' in point) {
    // Corner is the default, so only "smooth" is written.
    if (point.k === 'c') {
      report(`${path}.k`, 'corner is the default; leave it out')
    } else {
      oneOf(report, point.k, `${path}.k`, PATTERN_POINT_KINDS)
    }
  }

  for (const handle of ['hi', 'ho'] as const) {
    if (handle in point) {
      pair(report, point[handle], `${path}.${handle}`)
    }
  }
}

function checkPlacement(report: Report, value: unknown, path: string) {
  const place = record(report, value, path, ['anchor', 'wrap', 'offset', 'rot'])

  if (!place) {
    return
  }

  oneOf(report, place.anchor, `${path}.anchor`, PATTERN_ANCHORS)
  oneOf(report, place.wrap, `${path}.wrap`, PATTERN_WRAPS)

  if (!Array.isArray(place.offset) || place.offset.length !== 3) {
    report(`${path}.offset`, 'expected [x, y, z]')
  } else {
    place.offset.forEach((entry, index) => coordinate(report, entry, `${path}.offset[${index}]`))
  }

  integer(report, place.rot, `${path}.rot`, -180, 180)
}

/**
 * Checks a pattern block, reporting each problem through `report`. `panels`
 * are the document's print panels; `templateId` its template.
 */
export function checkPattern({
  value,
  path,
  panels,
  templateId,
  report,
}: {
  value: unknown
  path: string
  panels: readonly string[]
  templateId: unknown
  report: Report
}) {
  const pattern = record(report, value, path, ['v', 'basis', 'pieces', 'seams'])

  if (!pattern) {
    return
  }

  if (pattern.v !== PATTERN_VERSION) {
    report(`${path}.v`, `expected ${PATTERN_VERSION}`)
  }

  const basis = record(report, pattern.basis, `${path}.basis`, ['templateId', 'templateVersion', 'patternVersion'])

  if (basis) {
    if (typeof basis.templateId !== 'string' || basis.templateId !== templateId) {
      report(`${path}.basis.templateId`, "expected the document's template")
    }

    integer(report, basis.templateVersion, `${path}.basis.templateVersion`, 1, 999)
    integer(report, basis.patternVersion, `${path}.basis.patternVersion`, 1, 999)
  }

  const pieceIds = new Set<string>()
  /**
   * Piece id → its point ids (a mirrored piece shares its source's), or
   * null when the piece is already reported and its points can't be known.
   */
  const pointIds = new Map<string, Set<string> | null>()
  const mirrors: { path: string; piece: string; source: unknown }[] = []
  const pieces = array(report, pattern.pieces, `${path}.pieces`, 1, PATTERN_LIMITS.pieces)

  pieces?.forEach((value, index) => {
    const piecePath = `${path}.pieces[${index}]`
    const piece = record(report, value, piecePath, ['id', 'panel', 'label', 'panelOrigin', 'place'], ['outline', 'mirrorOf', 'roles', 'fabric'])

    if (!piece) {
      return
    }

    const named = id(report, piece.id, `${piecePath}.id`, pieceIds)
    oneOf(report, piece.panel, `${piecePath}.panel`, panels)

    if (typeof piece.label !== 'string' || piece.label.trim().length === 0 || piece.label.length > PATTERN_LIMITS.labelLength) {
      report(`${piecePath}.label`, `expected 1 to ${PATTERN_LIMITS.labelLength} characters`)
    }

    pair(report, piece.panelOrigin, `${piecePath}.panelOrigin`)
    checkPlacement(report, piece.place, `${piecePath}.place`)

    if ('fabric' in piece) {
      oneOf(report, piece.fabric, `${piecePath}.fabric`, PATTERN_FABRICS)
    }

    let points: Set<string> | null = new Set<string>()

    if (('outline' in piece) === ('mirrorOf' in piece)) {
      report(piecePath, 'expected an outline or mirrorOf, not both')
      points = null
    } else if ('outline' in piece) {
      const outline = array(report, piece.outline, `${piecePath}.outline`, 3, PATTERN_LIMITS.pointsPerPiece)
      const drawn = points
      outline?.forEach((point, pointIndex) => checkPoint(report, point, `${piecePath}.outline[${pointIndex}]`, drawn))
    } else {
      mirrors.push({ path: `${piecePath}.mirrorOf`, piece: String(piece.id), source: piece.mirrorOf })
    }

    if (named) {
      pointIds.set(piece.id as string, points)
    }

    if ('roles' in piece) {
      const roles = record(report, piece.roles, `${piecePath}.roles`, [], PATTERN_ROLES)

      for (const [role, ids] of Object.entries(roles ?? {})) {
        const list = array(report, ids, `${piecePath}.roles.${role}`, 1, PATTERN_LIMITS.roleIds)
        list?.forEach((pointId, idIndex) => id(report, pointId, `${piecePath}.roles.${role}[${idIndex}]`))
      }
    }
  })

  // A mirror copies a drawn piece; a mirror of a mirror isn't allowed.
  for (const mirror of mirrors) {
    const source = pieces?.find((piece) => isRecord(piece) && piece.id === mirror.source) as Record<string, unknown> | undefined

    if (!source || !('outline' in source) || 'mirrorOf' in source || mirror.source === mirror.piece) {
      report(mirror.path, 'expected the id of a drawn piece')
      pointIds.set(mirror.piece, null)
      continue
    }

    pointIds.set(mirror.piece, pointIds.get(String(mirror.source)) ?? null)
  }

  // Roles name the piece's own points.
  pieces?.forEach((value, index) => {
    if (!isRecord(value) || !isRecord(value.roles) || typeof value.id !== 'string') {
      return
    }

    const points = pointIds.get(value.id)

    for (const [role, ids] of Object.entries(value.roles)) {
      if (Array.isArray(ids)) {
        ids.forEach((pointId, idIndex) => {
          if (points && typeof pointId === 'string' && !points.has(pointId)) {
            report(`${path}.pieces[${index}].roles.${role}[${idIndex}]`, 'not a point on this piece')
          }
        })
      }
    }
  })

  const seamIds = new Set<string>()
  const seams = array(report, pattern.seams, `${path}.seams`, 0, PATTERN_LIMITS.seams)

  seams?.forEach((value, index) => {
    const seamPath = `${path}.seams[${index}]`
    const seam = record(report, value, seamPath, ['id', 'a', 'b', 'kind'])

    if (!seam) {
      return
    }

    id(report, seam.id, `${seamPath}.id`, seamIds)
    oneOf(report, seam.kind, `${seamPath}.kind`, PATTERN_SEAM_KINDS)
    const sides: string[] = []

    for (const sideName of ['a', 'b'] as const) {
      const sidePath = `${seamPath}.${sideName}`
      const side = record(report, seam[sideName], sidePath, ['piece', 'from', 'to'])

      if (!side) {
        continue
      }

      const points = typeof side.piece === 'string' ? pointIds.get(side.piece) : undefined

      if (points === undefined) {
        report(`${sidePath}.piece`, 'not a piece in this pattern')
        continue
      }

      // The piece itself is already reported.
      if (points === null) {
        continue
      }

      for (const end of ['from', 'to'] as const) {
        if (typeof side[end] !== 'string' || !points.has(side[end])) {
          report(`${sidePath}.${end}`, 'not a point on this piece')
        }
      }

      if (side.from === side.to) {
        report(sidePath, 'a seam runs between two different points')
      }

      sides.push(`${String(side.piece)}:${String(side.from)}:${String(side.to)}`)
    }

    if (sides.length === 2 && sides[0] === sides[1]) {
      report(seamPath, 'a seam joins two different edges')
    }
  })
}
