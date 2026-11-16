import type { Capsule } from './colliders'

/**
 * A "small steps" XPBD cloth solver (Macklin et al. 2019): many short
 * substeps with one constraint pass each. Plain arithmetic and `Math.sqrt`
 * only, with a fixed constraint order, so a run is repeatable on one
 * engine. Cross-engine bit equality isn't promised; the stored mesh is the
 * source of truth (docs/decisions.md).
 */
export const SOLVER_VERSION = 1

export type ClothInput = {
  /** Start positions, metres, xyz per particle. */
  positions: Float64Array
  /** Stretch and bend links: particle pairs, rest lengths, compliance. */
  links: Uint32Array
  rest: Float64Array
  compliance: Float64Array
  /** Seam stitches: particle pairs pulled together as the drape starts. */
  stitches: Uint32Array
  colliders: readonly Capsule[]
  /** Pinned particles keep their start position (none for a garment on a body). */
  pinned?: Uint8Array
}

export type ClothOptions = {
  substepsPerSecond?: number
  /** Simulated seconds before giving up on settling. */
  maxSeconds?: number
  /** Simulated seconds over which gravity and stitches ramp up. */
  rampSeconds?: number
  thickness?: number
  friction?: number
  /** Velocity damping per second. */
  damping?: number
  /** Called about every 1/10 simulated second; return false to stop. */
  onProgress?: (progress: { seconds: number; maxSpeed: number }) => boolean | void
}

export type ClothResult = {
  positions: Float64Array
  seconds: number
  settled: boolean
  substeps: number
  /** Largest gap left at a stitch, metres. */
  stitchGap: number
}

const GRAVITY = -9.81
const SETTLE_SPEED = 0.006

export function simulateCloth(input: ClothInput, options: ClothOptions = {}): ClothResult {
  const hz = options.substepsPerSecond ?? 600
  const dt = 1 / hz
  const maxSeconds = options.maxSeconds ?? 6
  const ramp = options.rampSeconds ?? 0.6
  const thickness = options.thickness ?? 0.004
  const friction = options.friction ?? 0.3
  const damping = options.damping ?? 3
  const n = input.positions.length / 3
  const x = Float64Array.from(input.positions)
  const prev = new Float64Array(x.length)
  const v = new Float64Array(x.length)
  const w = new Float64Array(n)

  for (let i = 0; i < n; i += 1) {
    w[i] = input.pinned?.[i] ? 0 : 1
  }

  const links = input.links
  const linkCount = links.length / 2
  const alphaOverDt2 = new Float64Array(linkCount)

  for (let k = 0; k < linkCount; k += 1) {
    alphaOverDt2[k] = input.compliance[k]! / (dt * dt)
  }

  const stitches = input.stitches
  const stitchCount = stitches.length / 2
  const colliders = input.colliders.map((c) => prepareCollider(c, thickness))
  const maxSteps = Math.round(maxSeconds * hz)
  const reportEvery = Math.round(hz / 10)
  let settledFor = 0
  let step = 0
  let settled = false

  for (; step < maxSteps; step += 1) {
    const t = step * dt
    const rampT = t < ramp ? t / ramp : 1
    const g = GRAVITY * (0.2 + 0.8 * rampT)
    // Stitches start loose and close as the drape begins.
    const stitchAlpha = (rampT < 1 ? 1e-3 * (1 - rampT) * (1 - rampT) + 1e-8 : 1e-8) / (dt * dt)
    const damp = 1 - damping * dt

    for (let i = 0; i < n; i += 1) {
      const o = i * 3

      prev[o] = x[o]!
      prev[o + 1] = x[o + 1]!
      prev[o + 2] = x[o + 2]!

      if (w[i] === 0) {
        continue
      }

      v[o + 1] = v[o + 1]! + g * dt
      x[o] = x[o]! + v[o]! * dt
      x[o + 1] = x[o + 1]! + v[o + 1]! * dt
      x[o + 2] = x[o + 2]! + v[o + 2]! * dt
    }

    for (let k = 0; k < linkCount; k += 1) {
      solveDistance(x, w, links[k * 2]!, links[k * 2 + 1]!, input.rest[k]!, alphaOverDt2[k]!)
    }

    for (let k = 0; k < stitchCount; k += 1) {
      solveDistance(x, w, stitches[k * 2]!, stitches[k * 2 + 1]!, 0, stitchAlpha)
    }

    for (let i = 0; i < n; i += 1) {
      if (w[i] === 0) {
        continue
      }

      for (let c = 0; c < colliders.length; c += 1) {
        collide(x, prev, i * 3, colliders[c]!, friction)
      }

      // The floor.
      if (x[i * 3 + 1]! < thickness) {
        x[i * 3 + 1] = thickness
      }
    }

    let maxSpeed2 = 0

    for (let o = 0; o < x.length; o += 1) {
      const speed = ((x[o]! - prev[o]!) / dt) * damp
      v[o] = speed

      const s2 = speed * speed

      if (s2 > maxSpeed2) {
        maxSpeed2 = s2
      }
    }

    if (step % reportEvery === 0 && options.onProgress) {
      if (options.onProgress({ seconds: t, maxSpeed: Math.sqrt(maxSpeed2) }) === false) {
        break
      }
    }

    if (rampT >= 1 && maxSpeed2 < SETTLE_SPEED * SETTLE_SPEED) {
      settledFor += dt

      if (settledFor >= 0.25) {
        settled = true
        step += 1
        break
      }
    } else {
      settledFor = 0
    }
  }

  let stitchGap = 0

  for (let k = 0; k < stitchCount; k += 1) {
    const a = stitches[k * 2]! * 3
    const b = stitches[k * 2 + 1]! * 3
    const dx = x[a]! - x[b]!
    const dy = x[a + 1]! - x[b + 1]!
    const dz = x[a + 2]! - x[b + 2]!
    stitchGap = Math.max(stitchGap, Math.sqrt(dx * dx + dy * dy + dz * dz))
  }

  // Weld: each stitched group of particles meets at its average, so seams
  // close exactly. Groups are joined through shared particles (a corner
  // can sit on two seams).
  weldStitches(x, stitches, n)

  return { positions: x, seconds: step * dt, settled, substeps: step, stitchGap }
}

function solveDistance(x: Float64Array, w: Float64Array, i: number, j: number, rest: number, alpha: number) {
  const wi = w[i]!
  const wj = w[j]!
  const wsum = wi + wj

  if (wsum === 0) {
    return
  }

  const a = i * 3
  const b = j * 3
  const dx = x[a]! - x[b]!
  const dy = x[a + 1]! - x[b + 1]!
  const dz = x[a + 2]! - x[b + 2]!
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

  if (len < 1e-12) {
    return
  }

  const c = len - rest
  const lambda = -c / (wsum + alpha)
  const sx = (dx / len) * lambda
  const sy = (dy / len) * lambda
  const sz = (dz / len) * lambda

  x[a] = x[a]! + sx * wi
  x[a + 1] = x[a + 1]! + sy * wi
  x[a + 2] = x[a + 2]! + sz * wi
  x[b] = x[b]! - sx * wj
  x[b + 1] = x[b + 1]! - sy * wj
  x[b + 2] = x[b + 2]! - sz * wj
}

type PreparedCollider = {
  mx: number
  my: number
  mz: number
  isx: number
  isy: number
  isz: number
  sx: number
  sy: number
  sz: number
  ax: number
  ay: number
  az: number
  ux: number
  uy: number
  uz: number
  len2: number
  r: number
  /** Loose bounds for a cheap early out. */
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

function prepareCollider(c: Capsule, thickness: number): PreparedCollider {
  const [sx, sy, sz] = c.s
  const mx = (c.a[0] + c.b[0]) / 2
  const my = (c.a[1] + c.b[1]) / 2
  const mz = (c.a[2] + c.b[2]) / 2
  // In squashed space the capsule is round; work there.
  const ax = (c.a[0] - mx) / sx
  const ay = (c.a[1] - my) / sy
  const az = (c.a[2] - mz) / sz
  const bx = (c.b[0] - mx) / sx
  const by = (c.b[1] - my) / sy
  const bz = (c.b[2] - mz) / sz
  const ux = bx - ax
  const uy = by - ay
  const uz = bz - az
  const pad = c.r + thickness * 4

  return {
    mx,
    my,
    mz,
    isx: 1 / sx,
    isy: 1 / sy,
    isz: 1 / sz,
    sx,
    sy,
    sz,
    ax,
    ay,
    az,
    ux,
    uy,
    uz,
    len2: ux * ux + uy * uy + uz * uz,
    // Thickness is applied in world space along the smallest squash, so the
    // shallow torso still keeps the cloth off its skin.
    r: c.r + thickness / Math.min(sx, sy, sz),
    minX: Math.min(c.a[0], c.b[0]) - pad,
    maxX: Math.max(c.a[0], c.b[0]) + pad,
    minY: Math.min(c.a[1], c.b[1]) - pad,
    maxY: Math.max(c.a[1], c.b[1]) + pad,
    minZ: Math.min(c.a[2], c.b[2]) - pad,
    maxZ: Math.max(c.a[2], c.b[2]) + pad,
  }
}

function collide(x: Float64Array, prev: Float64Array, o: number, c: PreparedCollider, friction: number) {
  const px = x[o]!
  const py = x[o + 1]!
  const pz = x[o + 2]!

  if (px < c.minX || px > c.maxX || py < c.minY || py > c.maxY || pz < c.minZ || pz > c.maxZ) {
    return
  }

  const lx = (px - c.mx) * c.isx
  const ly = (py - c.my) * c.isy
  const lz = (pz - c.mz) * c.isz
  let t = c.len2 > 0 ? ((lx - c.ax) * c.ux + (ly - c.ay) * c.uy + (lz - c.az) * c.uz) / c.len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = c.ax + c.ux * t
  const qy = c.ay + c.uy * t
  const qz = c.az + c.uz * t
  const dx = lx - qx
  const dy = ly - qy
  const dz = lz - qz
  const d2 = dx * dx + dy * dy + dz * dz

  if (d2 >= c.r * c.r) {
    return
  }

  const d = Math.sqrt(d2)

  if (d < 1e-9) {
    return
  }

  const k = c.r / d
  const nx = c.mx + (qx + dx * k) * c.sx
  const ny = c.my + (qy + dy * k) * c.sy
  const nz = c.mz + (qz + dz * k) * c.sz

  // Friction: hold back the motion along the surface since the last step.
  const ox = prev[o]!
  const oy = prev[o + 1]!
  const oz = prev[o + 2]!
  x[o] = nx
  x[o + 1] = ny
  x[o + 2] = nz

  if (friction > 0) {
    // Surface normal in world space (squash scales the gradient by 1/s).
    let gx = dx * c.isx
    let gy = dy * c.isy
    let gz = dz * c.isz
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz)
    gx /= gl
    gy /= gl
    gz /= gl
    const mxv = nx - ox
    const myv = ny - oy
    const mzv = nz - oz
    const along = mxv * gx + myv * gy + mzv * gz
    const tx = mxv - along * gx
    const ty = myv - along * gy
    const tz = mzv - along * gz
    x[o] = nx - tx * friction
    x[o + 1] = ny - ty * friction
    x[o + 2] = nz - tz * friction
  }
}

function weldStitches(x: Float64Array, stitches: Uint32Array, n: number) {
  const parent = new Int32Array(n)

  for (let i = 0; i < n; i += 1) {
    parent[i] = i
  }

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }

    return i
  }

  for (let k = 0; k < stitches.length; k += 2) {
    const a = find(stitches[k]!)
    const b = find(stitches[k + 1]!)

    if (a !== b) {
      // The lower index is the root, so the result doesn't depend on order.
      parent[Math.max(a, b)] = Math.min(a, b)
    }
  }

  const sum = new Map<number, [number, number, number, number]>()

  for (let k = 0; k < stitches.length; k += 1) {
    const i = stitches[k]!
    const root = find(i)
    const entry = sum.get(root) ?? [0, 0, 0, 0]
    sum.set(root, entry)
  }

  const members = new Set<number>(stitches)

  for (const i of [...members].sort((a, b) => a - b)) {
    const entry = sum.get(find(i))!
    entry[0] += x[i * 3]!
    entry[1] += x[i * 3 + 1]!
    entry[2] += x[i * 3 + 2]!
    entry[3] += 1
  }

  for (const i of members) {
    const [sx, sy, sz, count] = sum.get(find(i))!
    x[i * 3] = sx / count
    x[i * 3 + 1] = sy / count
    x[i * 3 + 2] = sz / count
  }
}
