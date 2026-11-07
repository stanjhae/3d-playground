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
