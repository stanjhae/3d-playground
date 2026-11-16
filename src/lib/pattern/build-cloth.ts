import type { Capsule } from '../cloth/colliders.ts'
import type { ClothInput } from '../cloth/solver.ts'
import { type FlatOutline, flattenOutline, polylineLength } from './bezier.ts'
import { expandPieces } from './mirror.ts'
import type { CanonicalPattern, PatternFabric } from './pattern-document.ts'
import { type Placement, placementFor } from './place.ts'
import { type Point2, triangulatePiece } from './triangulate.ts'

/**
 * Turns a pattern into a cloth the solver can drape: each piece is
 * meshed, placed around the body, and each seam becomes stitches between
 * matching samples on its two sides.
 */

/** Stretch and bend compliance per fabric (lower is stiffer). Stretch below 1e-7 goes unstable (spike S1). */
export const FABRICS: Record<PatternFabric, { stretch: number; bend: number }> = {
  jersey: { stretch: 2e-6, bend: 3e-5 },
  woven: { stretch: 1e-6, bend: 1e-5 },
  fleece: { stretch: 1.5e-6, bend: 6e-6 },
  denim: { stretch: 6e-7, bend: 3e-6 },
  satin: { stretch: 1e-6, bend: 6e-5 },
  firm: { stretch: 5e-7, bend: 1.5e-6 },
}

export const DEFAULT_SPACING_MM = 25

export type ClothPiece = {
  id: string
  /** The flattened outline, millimetres, counter-clockwise. */
  flat: FlatOutline
  /** Outline point ids, in order (`flat.corners` gives their indices). */
  pointIds: readonly string[]
  place: Placement
  stretchCompliance: number
  bendCompliance: number
}

export type SeamSide = { piece: string; from: string; to: string }

/** Both sides run counter-clockwise on their piece, so `a.from` meets `b.to`. */
export type ClothSeam = { id: string; a: SeamSide; b: SeamSide }

export type BuiltCloth = {
  input: ClothInput
  /** Per particle: which piece (index into `pieceIds`), and its flat position in millimetres. */
  pieceOf: Uint16Array
  flat: Float64Array
  triangles: Uint32Array
  pieceIds: string[]
}

/** `count + 1` points evenly spaced along a polyline, ends included. */
function sampleRun(points: readonly Point2[], count: number): Point2[] {
  const total = polylineLength(points)
  const out: Point2[] = [points[0]!]
  let segment = 1
  let walked = 0

  for (let k = 1; k < count; k += 1) {
    const target = (total * k) / count

    while (segment < points.length - 1) {
      const len = Math.hypot(points[segment]![0] - points[segment - 1]![0], points[segment]![1] - points[segment - 1]![1])

      if (walked + len >= target) {
        break
      }

      walked += len
      segment += 1
    }

    const a = points[segment - 1]!
    const b = points[segment]!
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const t = len > 0 ? Math.min(1, (target - walked) / len) : 0
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }

  out.push(points[points.length - 1]!)
  return out
}

/** The flattened outline from corner `start` to corner `end`, counter-clockwise, ends included. */
function between(flat: FlatOutline, start: number, end: number): Point2[] {
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

export function buildCloth({
  pieces,
  seams,
  colliders,
  spacing = DEFAULT_SPACING_MM,
}: {
  pieces: readonly ClothPiece[]
  seams: readonly ClothSeam[]
  colliders: readonly Capsule[]
  spacing?: number
}): BuiltCloth {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]))
  const cornerOf = (piece: ClothPiece, id: string) => {
    const index = piece.pointIds.indexOf(id)

    if (index < 0) {
      throw new Error(`Seam point ${id} is not on ${piece.id}`)
    }

    return index
  }

  // One sample count per seam, shared by both sides so stitches pair up.
  const seamCounts = new Map<string, number>()

  for (const seam of seams) {
    const lengths = [seam.a, seam.b].map((side) => {
      const piece = byId.get(side.piece)!
      return polylineLength(between(piece.flat, cornerOf(piece, side.from), cornerOf(piece, side.to)))
    })
    seamCounts.set(seam.id, Math.max(2, Math.round((lengths[0]! + lengths[1]!) / 2 / spacing)))
  }

  const positions: number[] = []
  const flat: number[] = []
  const pieceOf: number[] = []
  const triangles: number[] = []
  const links: number[] = []
  const rest: number[] = []
  const compliance: number[] = []
  /** `seam:side` → particle indices from `from` to `to`. */
  const seamParticles = new Map<string, number[]>()

  pieces.forEach((piece, pieceIndex) => {
    const seamStarts = new Map<number, { key: string; end: number; count: number }[]>()
    const breakSet = new Set<number>()

    for (const seam of seams) {
      for (const sideName of ['a', 'b'] as const) {
        const side = seam[sideName]

        if (side.piece !== piece.id) {
          continue
        }

        const start = cornerOf(piece, side.from)
        const end = cornerOf(piece, side.to)
        breakSet.add(start)
        breakSet.add(end)
        const list = seamStarts.get(start) ?? []
        list.push({ key: `${seam.id}:${sideName}`, end, count: seamCounts.get(seam.id)! })
        seamStarts.set(start, list)
      }
    }

    const breaks = [...breakSet].sort((a, b) => a - b)
    const cornerCount = piece.pointIds.length

    if (breaks.length === 0) {
      breaks.push(0)
    }

    const boundary: Point2[] = []
    const runs: { key: string; startAt: number; count: number }[] = []

    for (let r = 0; r < breaks.length; r += 1) {
      const start = breaks[r]!
      const end = breaks[(r + 1) % breaks.length]!
      const seamRun = seamStarts.get(start)?.find((entry) => entry.end === end)

      if (seamRun) {
        const samples = sampleRun(between(piece.flat, start, end), seamRun.count)
        runs.push({ key: seamRun.key, startAt: boundary.length, count: samples.length })
        boundary.push(...samples.slice(0, -1))
        continue
      }

      // A free edge keeps its corners: each corner-to-corner part is sampled on its own.
      const stop = breaks.length === 1 ? start + cornerCount : end <= start ? end + cornerCount : end

      for (let c = start; c < stop; c += 1) {
        const part = between(piece.flat, c % cornerCount, (c + 1) % cornerCount)
        const samples = sampleRun(part, Math.max(1, Math.round(polylineLength(part) / spacing)))
        boundary.push(...samples.slice(0, -1))
      }
    }

    const mesh = triangulatePiece({ outline: boundary, spacing })
    const base = positions.length / 3

    for (const p of mesh.points) {
      const [wx, wy, wz] = piece.place(p)
      positions.push(wx, wy, wz)
      flat.push(p[0], p[1])
      pieceOf.push(pieceIndex)
    }

    for (const run of runs) {
      const indices: number[] = []

      for (let k = 0; k < run.count; k += 1) {
        indices.push(base + ((run.startAt + k) % boundary.length))
      }

      seamParticles.set(run.key, indices)
    }

    const edgeTris = new Map<string, number[]>()

    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const tri = [mesh.triangles[t]!, mesh.triangles[t + 1]!, mesh.triangles[t + 2]!]
      triangles.push(base + tri[0]!, base + tri[1]!, base + tri[2]!)

      for (let e = 0; e < 3; e += 1) {
        const i = tri[e]!
        const j = tri[(e + 1) % 3]!
        const key = i < j ? `${i},${j}` : `${j},${i}`
        const opposite = tri[(e + 2) % 3]!
        const list = edgeTris.get(key)

        if (list) {
          list.push(opposite)
        } else {
          edgeTris.set(key, [opposite])
        }
      }
    }

    const flatDistance = (i: number, j: number) =>
      Math.hypot(mesh.points[i]![0] - mesh.points[j]![0], mesh.points[i]![1] - mesh.points[j]![1]) / 1000

    // Stretch links first, then bending, each in a fixed order.
    const keys = [...edgeTris.keys()].sort()
    const bendPairs = new Set<string>()

    for (const key of keys) {
      const [i, j] = key.split(',').map(Number) as [number, number]
      links.push(base + i, base + j)
      rest.push(flatDistance(i, j))
      compliance.push(piece.stretchCompliance)
    }

    for (const key of keys) {
      const opposite = edgeTris.get(key)!

      if (opposite.length !== 2) {
        continue
      }

      const [i, j] = opposite[0]! < opposite[1]! ? [opposite[0]!, opposite[1]!] : [opposite[1]!, opposite[0]!]
      const pair = `${i},${j}`

      // Skip a bend link that duplicates an edge or another bend link.
      if (edgeTris.has(pair) || bendPairs.has(pair)) {
        continue
      }

      bendPairs.add(pair)
      links.push(base + i, base + j)
      rest.push(flatDistance(i, j))
      compliance.push(piece.bendCompliance)
    }
  })

  const stitches: number[] = []

  for (const seam of seams) {
    const a = seamParticles.get(`${seam.id}:a`)
    const b = seamParticles.get(`${seam.id}:b`)

    if (!a || !b || a.length !== b.length) {
      throw new Error(`Seam ${seam.id} didn't pair up`)
    }

    for (let k = 0; k < a.length; k += 1) {
      stitches.push(a[k]!, b[b.length - 1 - k]!)
    }
  }

  return {
    input: {
      positions: Float64Array.from(positions),
      links: Uint32Array.from(links),
      rest: Float64Array.from(rest),
      compliance: Float64Array.from(compliance),
      stitches: Uint32Array.from(stitches),
      colliders,
    },
    pieceOf: Uint16Array.from(pieceOf),
    flat: Float64Array.from(flat),
    triangles: Uint32Array.from(triangles),
    pieceIds: pieces.map((p) => p.id),
  }
}

/** The cloth for a stored pattern: mirrors drawn, curves flattened, pieces placed. */
export function clothFromPattern({
  pattern,
  colliders,
  spacing = DEFAULT_SPACING_MM,
}: {
  pattern: CanonicalPattern
  colliders: readonly Capsule[]
  spacing?: number
}): BuiltCloth {
  const pieces: ClothPiece[] = expandPieces({ pattern }).map((piece) => {
    const flat = flattenOutline({ outline: piece.outline })
    const fabric = FABRICS[piece.fabric ?? 'jersey']

    return {
      id: piece.id,
      flat,
      pointIds: piece.outline.map((point) => point.id),
      place: placementFor({ place: piece.place, outline: flat.points }),
      stretchCompliance: fabric.stretch,
      bendCompliance: fabric.bend,
    }
  })

  return buildCloth({ pieces, seams: pattern.seams, colliders, spacing })
}
