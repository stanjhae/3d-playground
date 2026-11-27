import { CapsuleGeometry, CylinderGeometry, Matrix4, Mesh, Vector3 } from 'three'

import { type AvatarMeasurements, createProceduralAvatar, disposeAvatarGroup } from './avatar-geometry'

/**
 * Try-on fit (founder: the tee didn't sit naturally on the mannequin).
 *
 * The garment mount scales a real model by the body's chest and height, but
 * each build also changes the body's shape inside that frame (a female
 * figure's bust and hips, a male one's broader chest), and a rigid model
 * cut for one body sinks into another. The fit eases the cloth out where
 * the body needs it, in the body's own frame, where every real model is
 * modelled:
 *
 * - **A torso band.** At each height below the armpits the body widens
 *   about its centre line by just enough to clear the torso, bust and hips
 *   there, spread smoothly up and down so it reads as ease, not a dent.
 *   Above the armpits nothing moves: the shoulder seam and collar stay.
 * - **A band round each arm.** A sleeve widens about the arm's axis to clear
 *   it, nothing at the armhole seam (so it stays sewn to the body) and fully
 *   a few centimetres down the sleeve.
 * - **A push.** Any outer point still inside a part moves to its surface.
 *
 * Only the cloth's outer surface is read: seam allowances fold inward,
 * under the body, where nobody sees them. Every vertex keeps its index and
 * UVs, so prints ride along.
 */

export type FitShape = {
  name: string
  /** The part's unit frame (a capsule along y) → the avatar's frame. */
  matrix: Matrix4
  inverse: Matrix4
  radius: number
  half: number
}

/** A mesh of the model, flat xyz in the body's frame. */
export type FitPart = { name: string; positions: ArrayLike<number> }

/** The cloth stands this far off the skin (metres, the body's frame). */
export const FIT_MARGIN = 0.006
/** Shoulder height in the body's frame (the tee's pivot plus the mount lift). */
const SHOULDER_Y = 1.44
/** Above this the torso band leaves the cloth alone (just under the armpits). */
const BAND_TOP = SHOULDER_Y - 0.1
/** The torso band eases to nothing over this far below `BAND_TOP`. */
const BAND_EASE = 0.06
/** Within this of a body vertex, a sleeve vertex is on the armhole seam. */
const SEAM_GAP = 0.006
/** A sleeve band grows to full over this far from the armhole seam. */
const SLEEVE_EASE = 0.03
/** A need is spread this far along the band each way. */
const BAND_SPREAD = 0.05
const BAND_STEP = 0.005
/** The widest a band goes (a model far too small is not this fit's job). */
const BAND_LIMIT = 1.25
/** Within this of the outermost cloth nearby, a point is on the outer surface. */
const OUTER_SLACK = 0.008

const TORSO_PARTS = new Set(['avatar-torso', 'avatar-hips', 'avatar-bust-left', 'avatar-bust-right', 'avatar-shoulders'])
const FIT_PARTS = new Set([...TORSO_PARTS, 'avatar-arm-left', 'avatar-arm-right', 'avatar-neck'])

/** The body parts a garment must clear, in the avatar's own frame. */
export function avatarFitShapes({ measurements }: { measurements: AvatarMeasurements }): FitShape[] {
  const { root } = createProceduralAvatar({ measurements })
  const shapes: FitShape[] = []

  for (const child of root.children) {
    if (!(child instanceof Mesh) || !FIT_PARTS.has(child.name)) {
      continue
    }

    child.updateMatrix()
    const parameters = (child.geometry as { parameters?: Record<string, number> }).parameters ?? {}
    const tube = child.geometry instanceof CapsuleGeometry || child.geometry instanceof CylinderGeometry
    const radius =
      child.geometry instanceof CylinderGeometry
        ? Math.max(parameters.radiusTop ?? 0, parameters.radiusBottom ?? 0)
        : (parameters.radius ?? 0)
    const matrix = child.matrix.clone()
    shapes.push({ name: child.name, matrix, inverse: matrix.clone().invert(), radius, half: tube ? (parameters.height ?? 0) / 2 : 0 })
  }

  disposeAvatarGroup({ group: root })
  return shapes
}

const local = new Vector3()
const nearest = new Vector3()

/** True when `point` is inside `shape` grown by `margin` (in the part's own frame). */
function inside(shape: FitShape, point: Vector3, margin = 0) {
  local.copy(point).applyMatrix4(shape.inverse)
  nearest.set(0, Math.max(-shape.half, Math.min(shape.half, local.y)), 0)
  return local.distanceTo(nearest) < shape.radius + margin
}

/** Moves `point` out of `shape` to its surface plus `margin`; how far it went (0: it was outside). */
function pushOut(shape: FitShape, point: Vector3, margin: number) {
  local.copy(point).applyMatrix4(shape.inverse)
  nearest.set(0, Math.max(-shape.half, Math.min(shape.half, local.y)), 0)
  const offset = local.clone().sub(nearest)
  const distance = offset.length()

  if (distance >= shape.radius) {
    return 0
  }

  if (distance < 1e-6) {
    offset.set(0, 0, 1)
  } else {
    offset.divideScalar(distance)
  }

  const surface = nearest.clone().addScaledVector(offset, shape.radius).applyMatrix4(shape.matrix)
  const out = surface.clone().sub(nearest.clone().applyMatrix4(shape.matrix))
  const length = out.length()

  if (length < 1e-9) {
    return 0
  }

  surface.addScaledVector(out.divideScalar(length), margin)
  const moved = surface.distanceTo(point)
  point.copy(surface)
  return moved
}

/** How deep `point` sits in the deepest part it's inside (0: it's clear). */
function depthIn(shapes: readonly FitShape[], point: Vector3) {
  let deepest = 0

  for (const shape of shapes) {
    deepest = Math.max(deepest, pushOut(shape, point.clone(), 0))
  }

  return deepest
}

/** A straight band axis: points are `origin + t·dir + radial`. */
type Axis = { origin: Vector3; dir: Vector3 }

function axisOf(shape: FitShape): Axis {
  const top = new Vector3(0, shape.half, 0).applyMatrix4(shape.matrix)
  const bottom = new Vector3(0, -shape.half, 0).applyMatrix4(shape.matrix)
  return { origin: top, dir: bottom.sub(top).normalize() }
}

function smoothstep(t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/** One band: an axis, the parts it clears, and a weight per vertex (0 = never moves). */
type Band = {
  axis: Axis
  shapes: FitShape[]
  /** Flat indices into the region's vertices. */
  vertices: { part: number; index: number; weight: number }[]
}

type Coordinates = { t: number; radial: Vector3; r: number; angle: number }

function coordinates(axis: Axis, x: number, y: number, z: number, side: Vector3): Coordinates {
  const offset = new Vector3(x, y, z).sub(axis.origin)
  const t = offset.dot(axis.dir)
  const radial = offset.addScaledVector(axis.dir, -t)
  const up = new Vector3().crossVectors(axis.dir, side)
  return { t, radial, r: radial.length(), angle: Math.atan2(radial.dot(up), radial.dot(side)) }
}

/** Which of a band's vertices are on the cloth's outer surface (not a seam allowance folded in). */
function outerOf({ band, parts, side }: { band: Band; parts: readonly FitPart[]; side: Vector3 }) {
  const angleStep = Math.PI / 36
  const key = (t: number, angle: number) => `${t}:${angle}`
  const most = new Map<string, number>()
  const coords = band.vertices.map(({ part, index }) => {
    const positions = parts[part]!.positions
    return coordinates(band.axis, positions[index]!, positions[index + 1]!, positions[index + 2]!, side)
  })

  for (const c of coords) {
    const k = key(Math.round(c.t / 0.01), Math.round(c.angle / angleStep))
    most.set(k, Math.max(most.get(k) ?? 0, c.r))
  }

  return coords.map((c) => {
    const t = Math.round(c.t / 0.01)
    const angle = Math.round(c.angle / angleStep)
    let reach = 0

    for (let dt = -1; dt <= 1; dt += 1) {
      for (let da = -1; da <= 1; da += 1) {
        reach = Math.max(reach, most.get(key(t + dt, angle + da)) ?? 0)
      }
    }

    return c.r >= reach - OUTER_SLACK
  })
}

/** Band needs are kept per height and per angle round the axis. */
const ANGLE_STEP = Math.PI / 18
/** A need is spread this far round the axis each way. */
const ANGLE_SPREAD = Math.PI / 6

/**
 * The band's scale at each `t` and angle: the least that lifts every outer
 * point there clear, spread smoothly along and round, so the cloth eases
 * out where the body is (the sides of a broad torso) and nowhere else.
 */
function bandScale({ band, parts, outer, side }: { band: Band; parts: readonly FitPart[]; outer: boolean[]; side: Vector3 }) {
  const needs = new Map<string, number>()
  const point = new Vector3()
  const at = (c: Coordinates, scale: number) => point.copy(band.axis.origin).addScaledVector(band.axis.dir, c.t).addScaledVector(c.radial, scale)
  const clear = (c: Coordinates, scale: number) => band.shapes.every((shape) => !inside(shape, at(c, scale), FIT_MARGIN))
  const angleBins = Math.round((2 * Math.PI) / ANGLE_STEP)
  const angleKey = (angle: number) => ((Math.round(angle / ANGLE_STEP) % angleBins) + angleBins) % angleBins

  band.vertices.forEach(({ part, index, weight }, vertex) => {
    if (!outer[vertex] || weight === 0) {
      return
    }

    const positions = parts[part]!.positions
    const c = coordinates(band.axis, positions[index]!, positions[index + 1]!, positions[index + 2]!, side)

    if (c.r < 1e-6 || clear(c, 1)) {
      return
    }

    let low = 1
    let high = BAND_LIMIT

    if (clear(c, high)) {
      for (let step = 0; step < 14; step += 1) {
        const middle = (low + high) / 2
        if (clear(c, middle)) high = middle
        else low = middle
      }
    }

    const key = `${Math.round(c.t / BAND_STEP)}:${angleKey(c.angle)}`
    needs.set(key, Math.max(needs.get(key) ?? 1, Math.min(BAND_LIMIT, 1 + (high - 1) / weight)))
  })

  const reach = Math.round(BAND_SPREAD / BAND_STEP)
  const turn = Math.round(ANGLE_SPREAD / ANGLE_STEP)
  const cache = new Map<string, number>()

  return (t: number, angle: number) => {
    const tKey = Math.round(t / BAND_STEP)
    const aKey = angleKey(angle)
    const cached = cache.get(`${tKey}:${aKey}`)
    if (cached !== undefined) return cached
    let scale = 1

    for (let offset = -reach; offset <= reach; offset += 1) {
      for (let around = -turn; around <= turn; around += 1) {
        const need = needs.get(`${tKey + offset}:${(((aKey + around) % angleBins) + angleBins) % angleBins}`)
        if (need !== undefined) {
          const falloff = (1 - smoothstep(Math.abs(offset) / (reach + 1))) * (1 - smoothstep(Math.abs(around) / (turn + 1)))
          scale = Math.max(scale, 1 + (need - 1) * falloff)
        }
      }
    }

    cache.set(`${tKey}:${aKey}`, scale)
    return scale
  }
}

/** Body vertices on a grid, to find the armhole seam quickly. */
function seamFinder(parts: readonly FitPart[], body: number[]) {
  const cell = (value: number) => Math.floor(value / SEAM_GAP)
  const grid = new Map<string, number[]>()

  for (const part of body) {
    const positions = parts[part]!.positions
    for (let index = 0; index < positions.length; index += 3) {
      const k = `${cell(positions[index]!)}:${cell(positions[index + 1]!)}:${cell(positions[index + 2]!)}`
      let list = grid.get(k)
      if (!list) grid.set(k, (list = []))
      list.push(positions[index]!, positions[index + 1]!, positions[index + 2]!)
    }
  }

  return (x: number, y: number, z: number) => {
    for (let dx = -1; dx <= 1; dx += 1)
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = grid.get(`${cell(x) + dx}:${cell(y) + dy}:${cell(z) + dz}`)
          for (let at = 0; list && at < list.length; at += 3) {
            if (Math.hypot(list[at]! - x, list[at + 1]! - y, list[at + 2]! - z) < SEAM_GAP) return true
          }
        }
    return false
  }
}

const isSleeve = (name: string) => /sleeve/i.test(name)

/**
 * Fits a model's meshes to one avatar. Returns new positions per part, in
 * the order given; a part nothing touches comes back as an equal copy.
 */
export function fitGarment({ measurements, parts }: { measurements: AvatarMeasurements; parts: readonly FitPart[] }) {
  const shapes = avatarFitShapes({ measurements })
  const torsoShapes = shapes.filter((shape) => TORSO_PARTS.has(shape.name))
  const out = parts.map((part) => Float32Array.from(part.positions as ArrayLike<number>))
  const bodyParts = parts.flatMap((part, index) => (isSleeve(part.name) ? [] : [index]))

  // The torso band: a vertical axis through the cloth's centre.
  let sumZ = 0
  let count = 0
  for (const index of bodyParts) {
    const positions = parts[index]!.positions
    for (let at = 2; at < positions.length; at += 3) {
      sumZ += positions[at]!
      count += 1
    }
  }

  const torso: Band = { axis: { origin: new Vector3(0, 0, count ? sumZ / count : 0), dir: new Vector3(0, 1, 0) }, shapes: torsoShapes, vertices: [] }
  const arms = (['left', 'right'] as const).flatMap((side) => {
    const shape = shapes.find((entry) => entry.name === `avatar-arm-${side}`)
    return shape ? [{ side: side === 'left' ? -1 : 1, band: { axis: axisOf(shape), shapes: [shape], vertices: [] } as Band }] : []
  })
  const onSeam = seamFinder(parts, bodyParts)

  parts.forEach((part, partIndex) => {
    const positions = part.positions
    for (let index = 0; index < positions.length; index += 3) {
      const [x, y, z] = [positions[index]!, positions[index + 1]!, positions[index + 2]!]
      if (!isSleeve(part.name)) {
        torso.vertices.push({ part: partIndex, index, weight: smoothstep((BAND_TOP - y) / BAND_EASE) })
        continue
      }
      const arm = arms.find((entry) => Math.sign(x) === entry.side)
      if (arm) arm.band.vertices.push({ part: partIndex, index, weight: onSeam(x, y, z) ? 0 : 1 })
    }
  })

  // A sleeve vertex's weight grows with its distance from the armhole seam.
  for (const { band } of arms) {
    const seam = band.vertices.filter((vertex) => vertex.weight === 0).map(({ part, index }) => new Vector3().fromArray(parts[part]!.positions as number[], index))
    const point = new Vector3()
    for (const vertex of band.vertices) {
      if (vertex.weight === 0) continue
      point.fromArray(parts[vertex.part]!.positions as number[], vertex.index)
      let least = Infinity
      for (const seamPoint of seam) least = Math.min(least, seamPoint.distanceToSquared(point))
      vertex.weight = seam.length ? smoothstep(Math.sqrt(least) / SLEEVE_EASE) : 1
    }
  }

  const bands = [{ band: torso, side: new Vector3(1, 0, 0) }, ...arms.map(({ band }) => ({ band, side: new Vector3(0, 0, 1) }))]
  const outerByPart = parts.map((part) => new Uint8Array(part.positions.length / 3))
  const point = new Vector3()

  for (const { band, side } of bands) {
    const outer = outerOf({ band, parts, side })
    const scaleAt = bandScale({ band, parts, outer, side })

    band.vertices.forEach(({ part, index, weight }, vertex) => {
      if (outer[vertex]) outerByPart[part]![index / 3] = 1
      if (weight === 0) return
      const positions = parts[part]!.positions
      const c = coordinates(band.axis, positions[index]!, positions[index + 1]!, positions[index + 2]!, side)
      const scale = 1 + (scaleAt(c.t, c.angle) - 1) * weight
      point.copy(band.axis.origin).addScaledVector(band.axis.dir, c.t).addScaledVector(c.radial, scale)
      out[part]![index] = point.x
      out[part]![index + 1] = point.y
      out[part]![index + 2] = point.z
    })
  }

  // Whatever outer cloth a band couldn't reach (the armholes) steps out of the body.
  out.forEach((positions, part) => {
    for (let index = 0; index < positions.length; index += 3) {
      if (!outerByPart[part]![index / 3]) continue
      point.fromArray(positions, index)
      for (let pass = 0; pass < 8; pass += 1) {
        let moved = 0
        for (const shape of shapes) moved += pushOut(shape, point, FIT_MARGIN)
        if (moved === 0) break
      }
      point.toArray(positions, index)
    }
  })

  return { positions: out, outer: outerByPart }
}

/**
 * How deep the outer cloth sinks into the body: the deepest point, in
 * metres (0: none does). `outer` marks which vertices are on the outside.
 */
export function deepestClip({ measurements, parts, outer }: { measurements: AvatarMeasurements; parts: readonly FitPart[]; outer: readonly Uint8Array[] }) {
  const shapes = avatarFitShapes({ measurements })
  const point = new Vector3()
  let deepest = { depth: 0, part: '', at: [0, 0, 0] as number[] }

  parts.forEach((part, partIndex) => {
    for (let index = 0; index < part.positions.length; index += 3) {
      if (!outer[partIndex]![index / 3]) continue
      point.set(part.positions[index]!, part.positions[index + 1]!, part.positions[index + 2]!)
      const depth = depthIn(shapes, point)
      if (depth > deepest.depth) deepest = { depth, part: part.name, at: point.toArray() }
    }
  })

  return deepest
}
