import { BODY_LANDMARKS, type BodySide, type Vec3, armAxis } from '../cloth/colliders.ts'
import type { PatternPlacement } from './pattern-document.ts'
import type { Point2 } from './triangulate.ts'

/**
 * Where a flat piece starts before the drape: laid on a plane in front of,
 * behind or beside the body, or wrapped round an arm, leg, neck or head.
 * The solver then sews and settles it, so this only has to be close and on
 * the right side of the body.
 *
 * Seen from outside, a piece's +x is to the viewer's right and +y is up
 * (for an arm, up the arm). The body frame is the mannequin's: metres, y
 * up, +x the wearer's left, +z the front.
 */
export type Placement = (point: Point2) => Vec3

type Frame = { origin: Vec3; right: Vec3; up: Vec3; out: Vec3 }

const { shoulderY, hipY, headY, legX } = BODY_LANDMARKS

const PLANES: Record<string, Frame> = {
  front: { origin: [0, shoulderY, 0], right: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] },
  back: { origin: [0, shoulderY, 0], right: [-1, 0, 0], up: [0, 1, 0], out: [0, 0, -1] },
  'side-left': { origin: [0, shoulderY, 0], right: [0, 0, -1], up: [0, 1, 0], out: [1, 0, 0] },
  'side-right': { origin: [0, shoulderY, 0], right: [0, 0, 1], up: [0, 1, 0], out: [-1, 0, 0] },
  'hip-front': { origin: [0, hipY, 0], right: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] },
  'hip-back': { origin: [0, hipY, 0], right: [-1, 0, 0], up: [0, 1, 0], out: [0, 0, -1] },
}

/** Upright axes: the piece wraps round them, its middle at the front. */
const UPRIGHT: Record<string, Vec3> = {
  neck: [0, BODY_LANDMARKS.neckY, 0],
  head: [0, headY, 0.01],
  'leg-left': [legX, hipY, 0],
  'leg-right': [-legX, hipY, 0],
}

function add(a: Vec3, b: Vec3, k: number): Vec3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** The piece's left and right edge at height `y`. */
function spanAt(outline: readonly Point2[], y: number): [number, number] {
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < outline.length; i += 1) {
    const [x0, y0] = outline[i]!
    const [x1, y1] = outline[(i + 1) % outline.length]!

    if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
      const x = y1 === y0 ? Math.min(x0, x1) : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)
      const x2 = y1 === y0 ? Math.max(x0, x1) : x
      min = Math.min(min, x, x2)
      max = Math.max(max, x, x2)
    }
  }

  return Number.isFinite(min) ? [min, max] : [0, 0]
}

function rotate([x, y]: Point2, degrees: number): Point2 {
  if (degrees === 0) {
    return [x, y]
  }

  const r = (degrees * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [x * c - y * s, x * s + y * c]
}

/** Rounds to 0.01 mm, so a placement doesn't carry float noise into the drape. */
function quantise(v: Vec3): Vec3 {
  return [Math.round(v[0] * 1e5) / 1e5, Math.round(v[1] * 1e5) / 1e5, Math.round(v[2] * 1e5) / 1e5]
}

/**
 * A placement for one piece. `outline` is its flattened outline in
 * millimetres, which a wrap needs to measure the piece's girth.
 */
export function placementFor({ place, outline }: { place: PatternPlacement; outline: readonly Point2[] }): Placement {
  const [ox, oy, oz] = place.offset
  const plane = PLANES[place.anchor]

  if (place.wrap === 'plane' || (!plane && !UPRIGHT[place.anchor] && !place.anchor.startsWith('arm-'))) {
    const frame = plane ?? PLANES.front!
    const origin = add(add(add(frame.origin, frame.right, ox / 1000), frame.up, oy / 1000), frame.out, oz / 1000)

    return (point) => {
      const [x, y] = rotate(point, place.rot)
      return quantise(add(add(origin, frame.right, x / 1000), frame.up, y / 1000))
    }
  }

  let top = -Infinity

  for (const [, y] of outline) {
    top = Math.max(top, y)
  }

  // Arms run down from the shoulder; upright wraps run up from their base.
  const axis = place.anchor.startsWith('arm-')
    ? (() => {
        const arm = armAxis(place.anchor.slice(4) as BodySide)
        return { origin: arm.origin, along: arm.dir, out: arm.out, right: cross(arm.out, arm.dir), down: true }
      })()
    : {
        origin: UPRIGHT[place.anchor] ?? PLANES.front!.origin,
        along: [0, 1, 0] as Vec3,
        out: [0, 0, 1] as Vec3,
        right: [1, 0, 0] as Vec3,
        down: false,
      }

  return (point) => {
    const [x, y] = rotate(point, place.rot)
    const [left, right] = spanAt(outline, point[1])
    const half = Math.max(1, (right - left) / 2)
    const mid = (left + right) / 2
    const t = Math.max(-1, Math.min(1, (x - mid) / half))
    const phi = Math.PI * t
    const radius = (half * 2) / (2 * Math.PI) / 1000 + oz / 1000
    const along = axis.down ? (oy + (top - y)) / 1000 : (oy + y) / 1000
    const centre = add(axis.origin, axis.along, along)
    const ring = add(add([0, 0, 0], axis.out, Math.cos(phi)), axis.right, Math.sin(phi))
    return quantise(add(centre, ring, radius))
  }
}
