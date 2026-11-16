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
}

const SLEEVE_PIVOT_X = 0.215
const SHOULDER_Y = 1.44
const ARM_DROP = 0.42 - 0.08
const TORSO_DEPTH = 0.34

export type ColliderBuild = 'male' | 'female' | 'neutral'

function arm(sign: 1 | -1): Capsule {
  const dirX = sign * Math.sin(ARM_DROP)
  const dirY = -Math.cos(ARM_DROP)
  const start = 0.05
  const length = 0.5
  const sx = sign * SLEEVE_PIVOT_X + dirX * start
  const sy = SHOULDER_Y + dirY * start

  return {
    name: sign > 0 ? 'arm-right' : 'arm-left',
    a: [sx, sy, 0],
    b: [sx + dirX * length, sy + dirY * length, 0],
    r: 0.042,
    s: [1, 1, 1],
  }
}

/** The arm's axis, for wrapping a sleeve around it before the drape. */
export function armAxis(sign: 1 | -1) {
  const dirX = sign * Math.sin(ARM_DROP)
  const dirY = -Math.cos(ARM_DROP)

  return {
    origin: [sign * SLEEVE_PIVOT_X, SHOULDER_Y, 0] as Vec3,
    dir: [dirX, dirY, 0] as Vec3,
    /** Away from the body, square to the arm. */
    out: [sign * Math.cos(ARM_DROP), Math.sin(ARM_DROP), 0] as Vec3,
  }
}

export const BODY_LANDMARKS = {
  shoulderY: SHOULDER_Y,
  shoulderX: SLEEVE_PIVOT_X,
} as const

export function bodyColliders({ build = 'neutral' }: { build?: ColliderBuild } = {}): Capsule[] {
  const torsoX = build === 'female' ? 0.9 : build === 'male' ? 1.04 : 1
  const shoulderSpan = 0.13 * (build === 'female' ? 0.86 : build === 'male' ? 1.08 : 1)
  const capsules: Capsule[] = [
    { name: 'leg-left', a: [-0.078, 0.1, 0], b: [-0.078, 0.84, 0], r: 0.056, s: [1, 1, 1] },
    { name: 'leg-right', a: [0.078, 0.1, 0], b: [0.078, 0.84, 0], r: 0.056, s: [1, 1, 1] },
    { name: 'hips', a: [0, 0.86, 0], b: [0, 0.98, 0], r: 0.15, s: [1, 1, TORSO_DEPTH] },
    { name: 'torso', a: [0, 1.02, 0], b: [0, 1.32, 0], r: 0.17, s: [torsoX, 1, TORSO_DEPTH] },
    {
      name: 'shoulders',
      a: [-shoulderSpan, SHOULDER_Y - 0.035, 0],
      b: [shoulderSpan, SHOULDER_Y - 0.035, 0],
      r: 0.045,
      s: [1, 1, 0.9],
    },
    { name: 'neck', a: [0, 1.44, 0], b: [0, 1.62, 0], r: 0.048, s: [1, 1, 1] },
    { name: 'head', a: [0, 1.72, 0.01], b: [0, 1.72, 0.01], r: 0.105, s: [0.95, 1.15, 1] },
    arm(-1),
    arm(1),
  ]

  if (build === 'female') {
    for (const side of [-1, 1]) {
      capsules.push({ name: `bust-${side}`, a: [side * 0.068, 1.27, 0.03], b: [side * 0.068, 1.27, 0.03], r: 0.06, s: [1, 0.85, 0.55] })
    }
  }

  return capsules
}
