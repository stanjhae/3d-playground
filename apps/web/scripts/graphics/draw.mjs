// Drawing helpers for scripts/build-graphics.mjs. Every graphic in the
// editor's library is drawn from these primitives, so the art is original
// to this project (CC0, see public/graphics/LICENSES.md).

export const INK = '#1a1c22'
export const PAPER = '#fffaf0'
export const RED = '#d7262e'
export const OX = '#6b1d2a'
export const BRASS = '#c4a15a'

const num = (value) => {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

export const deg = (degrees) => (degrees * Math.PI) / 180
export const lerp = (a, b, t) => a + (b - a) * t

/** Seeded random numbers, so a rebuild draws the same pictures. */
export function rng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── transforms: plain functions from local (x, y) to picture (x, y) ──

export const IDENTITY = (x, y) => [x, y]

/** Scale, then turn by `degrees`, then move to (cx, cy). */
export function place(cx, cy, degrees = 0, sx = 1, sy = sx) {
  const c = Math.cos(deg(degrees))
  const s = Math.sin(deg(degrees))
  return (x, y) => {
    const px = x * sx
    const py = y * sy
    return [cx + px * c - py * s, cy + px * s + py * c]
  }
}

export const then = (outer, inner) => (x, y) => outer(...inner(x, y))

// ── paths ──

export function path(T = IDENTITY) {
  const out = []
  const p = (x, y) => {
    const [a, b] = T(x, y)
    return `${num(a)} ${num(b)}`
  }
  const api = {
    M: (x, y) => (out.push(`M${p(x, y)}`), api),
    L: (x, y) => (out.push(`L${p(x, y)}`), api),
    Q: (x1, y1, x, y) => (out.push(`Q${p(x1, y1)} ${p(x, y)}`), api),
    C: (x1, y1, x2, y2, x, y) => (out.push(`C${p(x1, y1)} ${p(x2, y2)} ${p(x, y)}`), api),
    /** A circular arc; `scale` keeps the radius right under a scaled T. */
    A: (r, large, sweep, x, y, scale = 1) => (out.push(`A${num(r * scale)} ${num(r * scale)} 0 ${large} ${sweep} ${p(x, y)}`), api),
    Z: () => (out.push('Z'), api),
    d: () => out.join(''),
  }
  return api
}

/**
 * A shape mirrored about the local y axis. `segs` draw the right half from
 * `start` (on the axis): ['L', x, y] or ['C', x1, y1, x2, y2, x, y].
 */
export function sym(start, segs, T = IDENTITY) {
  const p = ([x, y]) => {
    const [a, b] = T(x, y)
    return `${num(a)} ${num(b)}`
  }
  const mx = ([x, y]) => [-x, y]
  const ends = [start]
  let d = `M${p(start)}`
  for (const seg of segs) {
    if (seg[0] === 'L') {
      d += `L${p([seg[1], seg[2]])}`
      ends.push([seg[1], seg[2]])
    } else {
      d += `C${p([seg[1], seg[2]])} ${p([seg[3], seg[4]])} ${p([seg[5], seg[6]])}`
      ends.push([seg[5], seg[6]])
    }
  }
  d += `L${p(mx(ends[ends.length - 1]))}`
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const seg = segs[i]
    const from = ends[i]
    d += seg[0] === 'L' ? `L${p(mx(from))}` : `C${p(mx([seg[3], seg[4]]))} ${p(mx([seg[1], seg[2]]))} ${p(mx(from))}`
  }
  return `${d}Z`
}

/** A full circle as a path, for rings cut with fill-rule="evenodd". */
export function ringPath(cx, cy, r, reverse = false) {
  const sweep = reverse ? 0 : 1
  return `M${num(cx)} ${num(cy - r)}A${num(r)} ${num(r)} 0 1 ${sweep} ${num(cx)} ${num(cy + r)}A${num(r)} ${num(r)} 0 1 ${sweep} ${num(cx)} ${num(cy - r)}Z`
}

export function poly(points, T = IDENTITY, close = true) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${T(x, y).map(num).join(' ')}`).join('') + (close ? 'Z' : '')
}

/** Points of a regular star: `n` tips, alternating radii. */
export function starPoints(n, outer, inner, rotation = -90) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer
    const a = deg(rotation + (i * 180) / n)
    return [r * Math.cos(a), r * Math.sin(a)]
  })
}

/** A smooth curve from a heading and a curvature along its length. */
export function turtle({ x, y, heading, length, k, steps = 120 }) {
  const points = [[x, y]]
  let h = deg(heading)
  const ds = length / steps
  for (let i = 0; i < steps; i += 1) {
    h += k(i * ds) * ds
    x += Math.cos(h) * ds
    y += Math.sin(h) * ds
    points.push([x, y])
  }
  return points
}

/** A filled ribbon along `points`, `width(t)` wide at t in 0..1. */
export function ribbon(points, width) {
  const left = []
  const right = []
  points.forEach(([x, y], i) => {
    const [ax, ay] = points[Math.max(0, i - 1)]
    const [bx, by] = points[Math.min(points.length - 1, i + 1)]
    const len = Math.hypot(bx - ax, by - ay) || 1
    const nx = -(by - ay) / len
    const ny = (bx - ax) / len
    const w = width(i / (points.length - 1)) / 2
    left.push([x + nx * w, y + ny * w])
    right.push([x - nx * w, y - ny * w])
  })
  return poly([...left, ...right.reverse()])
}

/** A brush stroke that swells in the middle and tapers at both ends. */
export const swell = (max, min = 0.6) => (t) => Math.max(min, max * Math.sin(Math.PI * Math.min(1, Math.max(0, t))))
export const taper = (start, end) => (t) => lerp(start, end, t)

// ── elements ──

const attrs = (extra) => (extra ? ` ${extra}` : '')
export const P = (d, extra) => `<path d="${d}"${attrs(extra)}/>`
export const circle = (cx, cy, r, extra) => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"${attrs(extra)}/>`
export const ellipse = (cx, cy, rx, ry, extra) => `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(rx)}" ry="${num(ry)}"${attrs(extra)}/>`
export const rect = (x, y, w, h, extra) => `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${attrs(extra)}/>`

/**
 * One silhouette with a clean outer outline: the parts are drawn once in the
 * outline colour with a wide stroke, then again on top in the fill.
 */
export function outlined(parts, fill, { stroke = INK, width = 6 } = {}) {
  return `<g fill="${stroke}" stroke="${stroke}" stroke-width="${width * 2}" stroke-linejoin="round" stroke-linecap="round">${parts}</g><g fill="${fill}">${parts}</g>`
}

// ── gradients ──

export function linear(id, colors, [x1, y1, x2, y2] = [0, 0, 0, 1], user = false) {
  const stops = colors.map((c, i) => {
    const [color, offset] = Array.isArray(c) ? c : [c, i / (colors.length - 1)]
    return `<stop offset="${num(offset * 100)}%" stop-color="${color}"/>`
  })
  const units = user ? ' gradientUnits="userSpaceOnUse"' : ''
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${units}>${stops.join('')}</linearGradient>`
}

export function radial(id, colors, [cx, cy, r] = [0.5, 0.5, 0.5], user = false, focus) {
  const stops = colors.map((c, i) => {
    const [color, offset] = Array.isArray(c) ? c : [c, i / (colors.length - 1)]
    return `<stop offset="${num(offset * 100)}%" stop-color="${color}"/>`
  })
  const units = user ? ' gradientUnits="userSpaceOnUse"' : ''
  const f = focus ? ` fx="${focus[0]}" fy="${focus[1]}"` : ''
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${f}${units}>${stops.join('')}</radialGradient>`
}

export const GOLD = ['#fff2bf', '#efc560', '#b07c1c', '#f4d57e', '#9a6a14']
export const SILVER = ['#ffffff', '#d5d9e0', '#8a919c', '#eef0f4', '#9ba2ad']
export const STEEL = ['#6c7380', '#30343c', '#15171c', '#4a4f59', '#202329']
export const FIRE_OUTER = ['#a8101a', '#d7262e', '#f2521b']
export const FIRE_MID = ['#ff6a13', '#ff9a1f', '#ffc13a']
export const FIRE_CORE = ['#ffd84d', '#fff0a8', '#fffbe8']

export function svg({ width, height, body, defs = '' }) {
  const inner = defs ? `<defs>${defs}</defs>${body}` : body
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>\n`
}

/** A smooth closed curve through points (Catmull-Rom as cubic Béziers). */
export function smoothClosed(points) {
  const n = points.length
  let d = `M${points[0].map(num).join(' ')}`
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1.map(num).join(' ')} ${c2.map(num).join(' ')} ${p2.map(num).join(' ')}`
  }
  return `${d}Z`
}

/** An organic blob around (cx, cy). */
export function blob(cx, cy, r, random, { points = 8, jitter = 0.35, stretch = 1 } = {}) {
  const pts = []
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2
    const rr = r * (1 - jitter / 2 + random() * jitter)
    pts.push([cx + rr * Math.cos(a) * stretch, cy + rr * Math.sin(a)])
  }
  return smoothClosed(pts)
}
