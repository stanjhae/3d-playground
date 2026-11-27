/**
 * Meshes a flat pattern piece: its resampled outline plus an even
 * triangular lattice inside it, joined by a Delaunay triangulation and
 * trimmed to the outline. Deterministic: same input, same triangles.
 */
export type Point2 = readonly [number, number]

export type PieceMesh = {
  /** Outline points first (in order), then each hole's ring (in order), then the lattice. */
  points: Point2[]
  /** Points on the outline. */
  boundaryCount: number
  /** Points on each hole's ring, in hole order, after the outline. */
  holeCounts: number[]
  triangles: Uint32Array
}

export function pointInPolygon(p: Point2, polygon: readonly Point2[]) {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!

    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}

function distanceToSegment(p: Point2, a: Point2, b: Point2) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const len2 = ux * ux + uy * uy
  let t = len2 > 0 ? ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = p[0] - (a[0] + ux * t)
  const dy = p[1] - (a[1] + uy * t)
  return Math.sqrt(dx * dx + dy * dy)
}

export function distanceToPolygon(p: Point2, polygon: readonly Point2[]) {
  let best = Infinity

  for (let i = 0; i < polygon.length; i += 1) {
    best = Math.min(best, distanceToSegment(p, polygon[i]!, polygon[(i + 1) % polygon.length]!))
  }

  return best
}

/** Bowyer–Watson Delaunay triangulation; returns index triples. */
export function delaunay(points: readonly Point2[]): number[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [px, py] of points) {
    minX = Math.min(minX, px)
    minY = Math.min(minY, py)
    maxX = Math.max(maxX, px)
    maxY = Math.max(maxY, py)
  }

  const span = Math.max(maxX - minX, maxY - minY) * 20 + 1
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const all: Point2[] = [...points, [cx - span, cy - span], [cx + span, cy - span], [cx, cy + span]]
  const n = points.length

  type Tri = { a: number; b: number; c: number; x: number; y: number; r2: number }

  const circum = (a: number, b: number, c: number): Tri => {
    const [ax, ay] = all[a]!
    const [bx, by] = all[b]!
    const [qx, qy] = all[c]!
    const d = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by))
    const a2 = ax * ax + ay * ay
    const b2 = bx * bx + by * by
    const c2 = qx * qx + qy * qy
    const x = (a2 * (by - qy) + b2 * (qy - ay) + c2 * (ay - by)) / d
    const y = (a2 * (qx - bx) + b2 * (ax - qx) + c2 * (bx - ax)) / d
    return { a, b, c, x, y, r2: (ax - x) * (ax - x) + (ay - y) * (ay - y) }
  }

  let tris: Tri[] = [circum(n, n + 1, n + 2)]

  for (let i = 0; i < n; i += 1) {
    const [px, py] = all[i]!
    const keep: Tri[] = []
    const edges = new Map<string, [number, number, number]>()

    for (const t of tris) {
      const dx = px - t.x
      const dy = py - t.y

      if (dx * dx + dy * dy < t.r2 * (1 - 1e-12)) {
        for (const [e0, e1] of [
          [t.a, t.b],
          [t.b, t.c],
          [t.c, t.a],
        ] as const) {
          const key = e0 < e1 ? `${e0},${e1}` : `${e1},${e0}`
          const seen = edges.get(key)

          if (seen) {
            seen[2] += 1
          } else {
            edges.set(key, [e0, e1, 1])
          }
        }
      } else {
        keep.push(t)
      }
    }

    for (const [e0, e1, count] of edges.values()) {
      if (count === 1) {
        keep.push(circum(e0, e1, i))
      }
    }

    tris = keep
  }

  const out: number[] = []

  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) {
      continue
    }

    // Counter-clockwise.
    const [ax, ay] = all[t.a]!
    const [bx, by] = all[t.b]!
    const [qx, qy] = all[t.c]!
    const cross = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax)
    out.push(...(cross >= 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]))
  }

  return out
}

/** Even-odd inside test over several rings: an outline and its holes. */
export function pointInRings(p: Point2, rings: readonly (readonly Point2[])[]) {
  let inside = false

  for (const ring of rings) {
    if (pointInPolygon(p, ring)) {
      inside = !inside
    }
  }

  return inside
}

/**
 * The piece's mesh from its closed outline (already resampled at about
 * `spacing`, counter-clockwise, no repeated last point) and its holes
 * (resampled the same way, clockwise). Without holes the mesh is exactly
 * what it was before holes existed.
 */
export function triangulatePiece({
  outline,
  holes = [],
  spacing,
}: {
  outline: readonly Point2[]
  holes?: readonly (readonly Point2[])[]
  spacing: number
}): PieceMesh {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [px, py] of outline) {
    minX = Math.min(minX, px)
    minY = Math.min(minY, py)
    maxX = Math.max(maxX, px)
    maxY = Math.max(maxY, py)
  }

  const lattice: Point2[] = []
  const rowStep = (spacing * Math.sqrt(3)) / 2
  const margin = spacing * 0.55
  let row = 0

  for (let y = minY + rowStep / 2; y < maxY; y += rowStep, row += 1) {
    const offset = row % 2 === 0 ? 0 : spacing / 2

    for (let x = minX + offset; x < maxX; x += spacing) {
      const p: Point2 = [x, y]

      if (
        pointInPolygon(p, outline) &&
        distanceToPolygon(p, outline) >= margin &&
        holes.every((hole) => !pointInPolygon(p, hole) && distanceToPolygon(p, hole) >= margin)
      ) {
        lattice.push(p)
      }
    }
  }

  const rings = [outline, ...holes]
  const points = [...outline, ...holes.flat(), ...lattice]
  const raw = delaunay(points)
  const triangles: number[] = []

  for (let t = 0; t < raw.length; t += 3) {
    const a = points[raw[t]!]!
    const b = points[raw[t + 1]!]!
    const c = points[raw[t + 2]!]!
    const centroid: Point2 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]

    if (pointInRings(centroid, rings)) {
      triangles.push(raw[t]!, raw[t + 1]!, raw[t + 2]!)
    }
  }

  return { points, boundaryCount: outline.length, holeCounts: holes.map((hole) => hole.length), triangles: Uint32Array.from(triangles) }
}
