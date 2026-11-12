/**
 * Studio camera presets and the published-still framing contract (R04
 * #167). The scene (`StudioStage.tsx`) and the capture path
 * (`capture-still.ts`) both read these, so studio views and published
 * stills use one setup. See docs/template-manifest.md, "Capture and
 * framing".
 */

export const STUDIO_CAMERA = {
  position: [1.22, 1.24, 1.79] as const,
  target: [0, 0.85, 0] as const,
  fov: 36,
  near: 0.1,
  far: 2000,
}

export const CAMERA_PRESET_POSITIONS = {
  front: [0, 1.18, 2.17] as const,
  threeQuarter: STUDIO_CAMERA.position,
  back: [0.08, 1.18, -2.14] as const,
  // Sleeve views, named like the render panels: `left` frames the sleeve
  // at −x, the wearer's right; `right` the wearer's left. The sleeves
  // stand out nearly level and each sleeve panel's centre faces backwards,
  // so a side-on seat sees only the cuff end-on (#179). These sit behind
  // and outside the sleeve, a little above it, aimed at the sleeve.
  left: [-0.85, 1.44, -1.07] as const,
  right: [0.85, 1.44, -1.07] as const,
  orbit: STUDIO_CAMERA.position,
} as const

export type CameraPresetName = keyof typeof CAMERA_PRESET_POSITIONS

/**
 * What the camera has to fit. `garment` is the tee alone, large in frame.
 * `figure` is anything taller: the try-on mannequin, and the concept garments.
 */
export type StageFraming = 'garment' | 'figure'

const FIGURE_SEATS: Partial<Record<CameraPresetName, readonly [number, number, number]>> = {
  front: [0, 1.48, 4.1],
  threeQuarter: [2.35, 1.52, 3.45],
  back: [0.15, 1.48, -4.05],
  orbit: [2.35, 1.52, 3.45],
}

/** Where a still is taken for a preset. */
export function stillSeat({
  preset,
  framing = 'garment',
}: {
  preset: CameraPresetName
  framing?: StageFraming
}): readonly [number, number, number] {
  return (framing === 'figure' ? FIGURE_SEATS[preset] : undefined) ?? CAMERA_PRESET_POSITIONS[preset]
}

/** Where each sleeve view looks: between the flat and worn sleeve centres. */
const SLEEVE_TARGETS: Partial<Record<CameraPresetName, readonly [number, number, number]>> = {
  left: [-0.26, 1.12, -0.02],
  right: [0.26, 1.12, -0.02],
}

/** What a preset looks at: the garment's centre, or one sleeve for the sleeve views. */
export function presetTarget({ preset }: { preset: CameraPresetName }) {
  return SLEEVE_TARGETS[preset] ?? STUDIO_CAMERA.target
}

/**
 * How far the live sleeve views sit back from their sleeve, compared with the
 * stills. A still is a tight 4:5 crop; the live canvas also has the avatar and
 * the page's own controls over it, so up close the sleeve ends up behind them.
 */
const LIVE_SLEEVE_PULL_BACK = 2.4

/** Where the live studio sits for a preset. Stills use `CAMERA_PRESET_POSITIONS`. */
export function liveSeat({
  preset,
  framing = 'garment',
}: {
  preset: CameraPresetName
  framing?: StageFraming
}): readonly [number, number, number] {
  const seat = stillSeat({ preset, framing })
  const aim = SLEEVE_TARGETS[preset]

  if (!aim) {
    return seat
  }

  return [
    aim[0] + (seat[0] - aim[0]) * LIVE_SLEEVE_PULL_BACK,
    aim[1] + (seat[1] - aim[1]) * LIVE_SLEEVE_PULL_BACK,
    aim[2] + (seat[2] - aim[2]) * LIVE_SLEEVE_PULL_BACK,
  ]
}

type Vec3 = readonly [number, number, number]

function toward({ from, to, distance }: { from: Vec3; to: Vec3; distance: number }): [number, number, number] {
  const direction = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const length = Math.hypot(direction[0]!, direction[1]!, direction[2]!) || 1
  return [
    from[0] + (direction[0]! / length) * distance,
    from[1] + (direction[1]! / length) * distance,
    from[2] + (direction[2]! / length) * distance,
  ]
}

/** Room around a real model in its view; a little more than a still's margin. */
const MODEL_FIT = 1.8
/** Sleeve views come closer than the whole-garment views. */
const MODEL_SLEEVE_FIT = 0.55

/**
 * Seat and aim for a real model (`DesignDocument.modelFrame`): the same
 * directions as the tee's presets, at a distance that fits the model's own
 * size, and sleeve views aimed at the model's own sleeves. Without a sleeve
 * on that side the sleeve view falls back to a side-on view of the garment.
 */
export function modelSeat({
  preset,
  frame,
  live = false,
}: {
  preset: CameraPresetName
  frame: { min: Vec3; max: Vec3; sleeves: { left?: Vec3; right?: Vec3 } }
  live?: boolean
}): { seat: [number, number, number]; target: [number, number, number] } {
  const center: [number, number, number] = [
    (frame.min[0] + frame.max[0]) / 2,
    (frame.min[1] + frame.max[1]) / 2,
    (frame.min[2] + frame.max[2]) / 2,
  ]
  const height = frame.max[1] - frame.min[1]
  const width = Math.max(frame.max[0] - frame.min[0], frame.max[2] - frame.min[2])
  const half = Math.max(height, width * 1.25) / 2
  const distance = (half / Math.tan((STUDIO_CAMERA.fov * Math.PI) / 360)) * MODEL_FIT
  const sleeveTarget = SLEEVE_TARGETS[preset]

  if (sleeveTarget) {
    const sleeve = preset === 'left' ? frame.sleeves.left : frame.sleeves.right
    const target: [number, number, number] = sleeve ? [...sleeve] : center
    // The tee's seat for this sleeve, relative to its aim, gives the direction.
    const offset = CAMERA_PRESET_POSITIONS[preset].map((value, axis) => value - sleeveTarget[axis]!) as [number, number, number]
    const from: [number, number, number] = [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]]
    const reach = distance * (sleeve ? MODEL_SLEEVE_FIT : 1) * (live ? LIVE_SLEEVE_PULL_BACK * 0.6 : 1)
    return { seat: toward({ from: target, to: from, distance: reach }), target }
  }

  const tee = CAMERA_PRESET_POSITIONS[preset]
  const offset = [tee[0] - STUDIO_CAMERA.target[0], tee[1] - STUDIO_CAMERA.target[1], tee[2] - STUDIO_CAMERA.target[2]]
  const from: [number, number, number] = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]]
  return { seat: toward({ from: center, to: from, distance }), target: center }
}

/** Published stills: opaque JPEG, 4:5, centre-cropped from the canvas. */
export const STILL_FRAME = {
  width: 480,
  height: 600,
  /** Smallest gap between the garment and any still edge, as a fraction of that side. */
  minMargin: 0.12,
  /** Shown only where the canvas does not cover the frame (it always does today). */
  fill: '#d9d8d4',
} as const

const STILL_ASPECT = STILL_FRAME.width / STILL_FRAME.height

/**
 * Vertical fov for the canvas, so its centre 4:5 always sees
 * `STUDIO_CAMERA.fov` vertically. A canvas at least as wide as 4:5 is cropped
 * at the sides and keeps the studio fov; a narrower (portrait) canvas is
 * cropped top and bottom, so its fov widens until the crop's height spans the
 * studio fov. Without this a phone-shaped canvas would cut the garment's sides
 * off, in the live view as much as in a still.
 */
export function captureFov({ aspect }: { aspect: number }) {
  if (!(aspect > 0) || aspect >= STILL_ASPECT) {
    return STUDIO_CAMERA.fov
  }

  const half = (STUDIO_CAMERA.fov * Math.PI) / 360
  return (Math.atan((Math.tan(half) * STILL_ASPECT) / aspect) * 360) / Math.PI
}
