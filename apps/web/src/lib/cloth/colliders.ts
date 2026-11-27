/**
 * The mannequin as simple collision shapes for the cloth solver, in the
 * avatar's own frame (metres, y up, the wearer facing +z). The numbers
 * mirror `createProceduralAvatar` in `avatar-geometry.ts` at base
 * measurements, so draped cloth sits on the body the studio draws.
 */
export type Vec3 = readonly [number, number, number]

/**
 * A capsule from `a` to `b` with radius `r`, squashed about its midpoint
 * by `s` along the world axes (the mannequin's torso and hips are shallow
 * ellipses, not circles).
 */
export type Capsule = {
  name: string
  a: Vec3
  b: Vec3
  r: number
  s: Vec3
  /** Contact friction here, 0 (slides) to 1 (holds); the solver's default when absent. */
  friction?: number
}

/** Cloth resting on the shoulders or hips (a strap, a waistband) stays put. */
const SHOULDER_FRICTION = 0.95

const SLEEVE_PIVOT_X = 0.215
const SHOULDER_Y = 1.44
const ARM_DROP = 0.42 - 0.08
const TORSO_DEPTH = 0.34

export type ColliderBuild = 'male' | 'female' | 'neutral'

/** +x is the wearer's left, as everywhere in the studio. */
export type BodySide = 'left' | 'right'

function sideSign(side: BodySide) {
  return side === 'left' ? 1 : -1
}

function arm(side: BodySide): Capsule {
  const sign = sideSign(side)
  const dirX = sign * Math.sin(ARM_DROP)
  const dirY = -Math.cos(ARM_DROP)
  const start = 0.05
  const length = 0.5
  const sx = sign * SLEEVE_PIVOT_X + dirX * start
  const sy = SHOULDER_Y + dirY * start

  return {
    name: `arm-${side}`,
    a: [sx, sy, 0],
    b: [sx + dirX * length, sy + dirY * length, 0],
    r: 0.042,
    s: [1, 1, 1],
  }
}

/** The hand: a long sleeve gathers at the wrist instead of sliding off. */
function hand(side: BodySide): Capsule {
  const sign = sideSign(side)
  const dirX = sign * Math.sin(ARM_DROP)
  const dirY = -Math.cos(ARM_DROP)
  const reach = 0.05 + 0.5 + 0.08
  const at: Vec3 = [sign * SLEEVE_PIVOT_X + dirX * reach, SHOULDER_Y + dirY * reach, 0]
  return { name: `hand-${side}`, a: at, b: at, r: 0.05, s: [0.8, 1.2, 0.6] }
}

/** The arm's axis, for wrapping a sleeve around it before the drape. */
export function armAxis(side: BodySide) {
  const sign = sideSign(side)
  const dirX = sign * Math.sin(ARM_DROP)
  const dirY = -Math.cos(ARM_DROP)

  return {
    origin: [sign * SLEEVE_PIVOT_X, SHOULDER_Y, 0] as Vec3,
    /** Down the arm. */
    dir: [dirX, dirY, 0] as Vec3,
    /** Away from the body, square to the arm. */
    out: [sign * Math.cos(ARM_DROP), Math.sin(ARM_DROP), 0] as Vec3,
  }
}

export const BODY_LANDMARKS = {
  shoulderY: SHOULDER_Y,
  shoulderX: SLEEVE_PIVOT_X,
  hipY: 0.92,
  neckY: 1.44,
  headY: 1.72,
  legX: 0.078,
} as const

/**
 * The body garments drape on: the mannequin's shapes, made a little more
 * like a dress form so garments hang as they would in a shop. The hips
 * are wider than the waist (a waistband holds) and the shoulders reach
 * the arms (a strap can't slip into the gap). It's the drape body, not
 * the one drawn; the studio shows the garment alone or seated on a preset.
 */
export function bodyColliders({ build = 'neutral' }: { build?: ColliderBuild } = {}): Capsule[] {
  const torsoX = build === 'female' ? 0.9 : build === 'male' ? 1.04 : 1
  const hipX = build === 'female' ? 1.22 : build === 'male' ? 1.08 : 1.14
  const shoulderSpan = 0.15 * (build === 'female' ? 0.92 : build === 'male' ? 1.05 : 1)
  const capsules: Capsule[] = [
    { name: 'leg-left', a: [0.078, 0.1, 0], b: [0.078, 0.84, 0], r: 0.056, s: [1, 1, 1] },
    { name: 'leg-right', a: [-0.078, 0.1, 0], b: [-0.078, 0.84, 0], r: 0.056, s: [1, 1, 1] },
    // A waistband rests on the hips as a strap rests on the shoulders.
    { name: 'hips', a: [0, 0.84, 0], b: [0, 0.94, 0], r: 0.15, s: [hipX, 1, 0.42], friction: SHOULDER_FRICTION },
    // The chest, its lower end rounding in to a waist at about 1 m.
    { name: 'torso', a: [0, 1.1, 0], b: [0, 1.32, 0], r: 0.17, s: [torsoX, 1, TORSO_DEPTH] },
    {
      name: 'shoulders',
      a: [-shoulderSpan, SHOULDER_Y - 0.035, 0],
      b: [shoulderSpan, SHOULDER_Y - 0.035, 0],
      r: 0.045,
      s: [1, 1, 0.9],
      friction: SHOULDER_FRICTION,
    },
    { name: 'neck', a: [0, 1.44, 0], b: [0, 1.62, 0], r: 0.048, s: [1, 1, 1] },
    { name: 'head', a: [0, 1.72, 0.01], b: [0, 1.72, 0.01], r: 0.105, s: [0.95, 1.15, 1] },
    arm('right'),
    arm('left'),
    hand('right'),
    hand('left'),
  ]

  if (build === 'female') {
    for (const side of [-1, 1]) {
      capsules.push({ name: `bust-${side}`, a: [side * 0.068, 1.27, 0.03], b: [side * 0.068, 1.27, 0.03], r: 0.06, s: [1, 0.85, 0.55] })
    }
  }

  return capsules
}
