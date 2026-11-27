/**
 * Two-colour motifs for the garment's base (tester, 22 Nov: "a few more
 * interesting patterns", such as dragon scales, honeycomb and leopard).
 * Like stripes and check they are drawn per atlas pixel from a rule, so the
 * 2D panel, the 3D garment and published art agree at any size, and they
 * carry no third-party rights.
 *
 * `x` and `y` are in bands along the pattern's own axes: one repeat
 * (`period`) is two bands, as for stripes.
 */

export const MOTIF_IDS = ['dots', 'chevron', 'houndstooth', 'honeycomb', 'scales', 'leopard'] as const

export type MotifId = (typeof MOTIF_IDS)[number]

export const MOTIF_LABELS: Record<MotifId, string> = {
  dots: 'Dots',
  chevron: 'Chevron',
  houndstooth: 'Houndstooth',
  honeycomb: 'Honeycomb',
  scales: 'Scales',
  leopard: 'Leopard',
}

export function isMotifId(value: unknown): value is MotifId {
  return typeof value === 'string' && (MOTIF_IDS as readonly string[]).includes(value)
}

const fract = (value: number) => value - Math.floor(value)

/** Deterministic 0–1 hash of a cell, so a motif is the same on every draw. */
function cellHash(i: number, j: number, salt: number) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(salt, 2246822519)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Polka dots on a half-drop grid. */
function dots(x: number, y: number) {
  const row = Math.floor(y / 2)
  const u = fract(x / 2 + (row % 2 === 0 ? 0 : 0.5)) - 0.5
  const v = fract(y / 2) - 0.5
  return u * u + v * v < 0.28 * 0.28
}

/** Zigzag bands. */
function chevron(x: number, y: number) {
  return Math.floor(y + Math.abs(fract(x / 2) * 2 - 1) * 2) % 2 === 0
}

/** A broken check: solid squares, and diagonal teeth in the others. */
function houndstooth(x: number, y: number) {
  const u = fract(x / 2)
  const v = fract(y / 2)

  if ((Math.floor(u * 2) + Math.floor(v * 2)) % 2 === 0) {
    return u < 0.5 && v < 0.5
      ? true
      : fract((u + v) * 2) < 0.5
  }

  return false
}

const ROOT3 = Math.sqrt(3)

/** Hexagon outlines, pointy side up. */
function honeycomb(x: number, y: number) {
  // One hexagon across a repeat.
  const size = 1 / ROOT3
  const px = x / 2
  const py = y / 2
  const q = ((ROOT3 / 3) * px - py / 3) / size
  const r = ((2 / 3) * py) / size
  // Round to the nearest hexagon (cube coordinates).
  let rx = Math.round(q)
  let rz = Math.round(r)
  const ry = Math.round(-q - r)
  const dx = Math.abs(rx - q)
  const dz = Math.abs(rz - r)
  const dy = Math.abs(ry + q + r)

  if (dx > dy && dx > dz) {
    rx = -ry - rz
  } else if (!(dy > dz)) {
    rz = -rx - ry
  }

  const cx = size * ROOT3 * (rx + rz / 2)
  const cy = size * 1.5 * rz
  const ox = Math.abs(px - cx)
  const oy = Math.abs(py - cy)
  const inradius = (size * ROOT3) / 2
  const edge = Math.max(ox, ox * 0.5 + oy * (ROOT3 / 2)) / inradius
  return edge > 0.8
}

/** Overlapping scales: each row's arcs sit over the row below. */
function scales(x: number, y: number) {
  const px = x / 2
  const py = y / 2
  const row = Math.floor(py)

  // The scale in front is the one whose centre is lowest and still covers the point.
  for (const j of [row + 1, row]) {
    const shift = j % 2 === 0 ? 0 : 0.5
    const i = Math.round(px - shift)
    const cx = i + shift
    const distance = Math.hypot(px - cx, py - j)

    if (distance <= 0.62) {
      return distance > 0.48
    }
  }

  return false
}

/** Rosettes: broken rings around a dark centre, scattered from cell to cell. */
function leopard(x: number, y: number) {
  const px = x / 2
  const py = y / 2
  const ci = Math.floor(px)
  const cj = Math.floor(py)

  for (let j = cj - 1; j <= cj + 1; j += 1) {
    for (let i = ci - 1; i <= ci + 1; i += 1) {
      const cx = i + 0.25 + cellHash(i, j, 1) * 0.5
      const cy = j + 0.25 + cellHash(i, j, 2) * 0.5
      const size = 0.22 + cellHash(i, j, 3) * 0.12
      const dx = (px - cx) / size
      const dy = (py - cy) / (size * 0.82)
      const distance = Math.hypot(dx, dy)

      if (distance > 1.15) {
        continue
      }

      // A small solid spot in some rosettes.
      if (distance < 0.28 && cellHash(i, j, 4) > 0.5) {
        return true
      }

      if (distance > 0.72 && distance < 1.15) {
        // The ring breaks in two or three places.
        const angle = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5
        const gaps = 2 + Math.floor(cellHash(i, j, 5) * 2)
        return fract(angle * gaps + cellHash(i, j, 6)) > 0.22
      }

      return false
    }
  }

  return false
}

const RULES: Record<MotifId, (x: number, y: number) => boolean> = {
  dots,
  chevron,
  houndstooth,
  honeycomb,
  scales,
  leopard,
}

/** Whether a point of `motif` takes the second (ink) colour. */
export function motifInk({ motif, x, y }: { motif: MotifId; x: number; y: number }) {
  return RULES[motif](x, y)
}
