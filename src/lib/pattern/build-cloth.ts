import type { Capsule, Vec3 } from '../cloth/colliders'
import type { ClothInput } from '../cloth/solver'
import { type Point2, triangulatePiece } from './triangulate'

/**
 * Turns flat pattern pieces into a cloth the solver can drape: each
 * piece is meshed, placed around the body, and its seams become stitches
 * between matching outline samples.
 */
export type OutlinePoint = { id: string; x: number; y: number }

export type Placement = (point: Point2) => Vec3

export type ClothPiece = {
  id: string
  /** Millimetres, counter-clockwise, as drawn on the pattern. */
  outline: readonly OutlinePoint[]
  place: Placement
  /** Fabric stiffness: lower is stiffer. */
  stretchCompliance?: number
  bendCompliance?: number
}

export type SeamSide = { piece: string; from: string; to: string }

/** Two runs sewn together. Both run counter-clockwise on their piece, so `a.from` meets `b.to`. */
export type ClothSeam = { id: string; a: SeamSide; b: SeamSide }

export type BuiltCloth = {
  input: ClothInput
  /** Per particle: which piece, and its flat position in millimetres. */
  pieceOf: Uint16Array
  flat: Float64Array
  triangles: Uint32Array
  pieceIds: string[]
}

function runLength(points: readonly Point2[]) {
  let total = 0

  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  }

  return total
}

/** `count + 1` points evenly spaced along a polyline, ends included. */
function sampleRun(points: readonly Point2[], count: number): Point2[] {
  const total = runLength(points)
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
    const t = len > 0 ? (target - walked) / len : 0
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }

  out.push(points[points.length - 1]!)
  return out
}

/** The outline points from `from` to `to`, going counter-clockwise. */
function runPoints(outline: readonly OutlinePoint[], from: string, to: string): Point2[] {
  const start = outline.findIndex((p) => p.id === from)
  const end = outline.findIndex((p) => p.id === to)

  if (start < 0 || end < 0) {
    throw new Error(`Seam point ${start < 0 ? from : to} is not on the piece`)
  }

  const out: Point2[] = []

  for (let i = start; ; i = (i + 1) % outline.length) {
    out.push([outline[i]!.x, outline[i]!.y])

    if (i === end) {
      break
    }
  }

  return out
}

export function buildCloth({
  pieces,
  seams,
  colliders,
  spacing = 25,
}: {
  pieces: readonly ClothPiece[]
  seams: readonly ClothSeam[]
  colliders: readonly Capsule[]
  spacing?: number
}): BuiltCloth {
  // One sample count per seam, shared by both sides so stitches pair up.
  const seamCounts = new Map<string, number>()

  for (const seam of seams) {
    const pa = pieces.find((p) => p.id === seam.a.piece)!
    const pb = pieces.find((p) => p.id === seam.b.piece)!
    const la = runLength(runPoints(pa.outline, seam.a.from, seam.a.to))
    const lb = runLength(runPoints(pb.outline, seam.b.from, seam.b.to))
    seamCounts.set(seam.id, Math.max(2, Math.round((la + lb) / 2 / spacing)))
  }

  const positions: number[] = []
  const flat: number[] = []
  const pieceOf: number[] = []
  const triangles: number[] = []
  const links: number[] = []
  const rest: number[] = []
  const compliance: number[] = []
  /** Seam id + side → particle indices from `from` to `to`. */
  const seamParticles = new Map<string, number[]>()

  pieces.forEach((piece, pieceIndex) => {
    const breaks: { index: number; seam?: { id: string; side: 'a' | 'b'; to: string } }[] = []

    for (const seam of seams) {
      for (const side of ['a', 'b'] as const) {
        const s = seam[side]

        if (s.piece !== piece.id) {
          continue
        }

        breaks.push({ index: piece.outline.findIndex((p) => p.id === s.from), seam: { id: seam.id, side, to: s.to } })
        breaks.push({ index: piece.outline.findIndex((p) => p.id === s.to) })
      }
    }

    const breakIndices = [...new Set(breaks.map((b) => b.index))].sort((a, b) => a - b)

    if (breakIndices.length === 0) {
      breakIndices.push(0)
    }

    // Walk the outline run by run, sampling each.
    const boundary: Point2[] = []
    const runs: { seamKey?: string; startAt: number; count: number }[] = []

    for (let r = 0; r < breakIndices.length; r += 1) {
      const startIndex = breakIndices[r]!
      const endIndex = breakIndices[(r + 1) % breakIndices.length]!
      const from = piece.outline[startIndex]!.id
      const to = piece.outline[endIndex]!.id
      const seamBreak = breaks.find((b) => b.index === startIndex && b.seam && b.seam.to === to)
      let samples: Point2[]

      if (seamBreak?.seam) {
        samples = sampleRun(runPoints(piece.outline, from, to), seamCounts.get(seamBreak.seam.id)!)
      } else {
        // A free edge keeps its corners: sample each straight part on its own.
        // With a single break the run is the whole outline, round to the start.
        const pts: Point2[] =
          breakIndices.length === 1
            ? [...piece.outline.slice(startIndex), ...piece.outline.slice(0, startIndex + 1)].map((p) => [p.x, p.y] as const)
            : runPoints(piece.outline, from, to)

        samples = [pts[0]!]

        for (let i = 1; i < pts.length; i += 1) {
          const part = sampleRun([pts[i - 1]!, pts[i]!], Math.max(1, Math.round(runLength([pts[i - 1]!, pts[i]!]) / spacing)))
          samples.push(...part.slice(1))
        }
      }

      runs.push({ seamKey: seamBreak?.seam ? `${seamBreak.seam.id}:${seamBreak.seam.side}` : undefined, startAt: boundary.length, count: samples.length })
      // The run's last point is the next run's first.
      boundary.push(...samples.slice(0, -1))
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
      if (!run.seamKey) {
        continue
      }

      const indices: number[] = []

      for (let k = 0; k < run.count; k += 1) {
        indices.push(base + ((run.startAt + k) % boundary.length))
      }

      seamParticles.set(run.seamKey, indices)
    }

    // Stiffer than 1e-7 goes unstable with one pass per substep (spike S1).
    const stretch = piece.stretchCompliance ?? 1e-6
    const bend = piece.bendCompliance ?? 2e-5
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

    for (const key of keys) {
      const [i, j] = key.split(',').map(Number) as [number, number]
      links.push(base + i, base + j)
      rest.push(flatDistance(i, j))
      compliance.push(stretch)
    }

    for (const key of keys) {
      const opposite = edgeTris.get(key)!

      if (opposite.length === 2) {
        links.push(base + opposite[0]!, base + opposite[1]!)
        rest.push(flatDistance(opposite[0]!, opposite[1]!))
        compliance.push(bend)
      }
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
