/**
 * Studio camera presets and the published-still framing contract (R04
 * #167). The scene (`StudioStage.tsx`) and the capture path
 * (`capture-still.ts`) both read these, so studio views and published
 * stills use one setup. See docs/template-manifest.md, "Capture and
 * framing".
 */

export const STUDIO_CAMERA = {
  position: [2.35, 1.52, 3.45] as const,
  target: [0, 0.78, 0] as const,
  fov: 36,
  near: 0.1,
  far: 2000,
}

export const CAMERA_PRESET_POSITIONS = {
  front: [0, 1.48, 4.1] as const,
  threeQuarter: STUDIO_CAMERA.position,
  back: [0.15, 1.48, -4.05] as const,
  orbit: STUDIO_CAMERA.position,
} as const

/** Published stills: opaque JPEG, 4:5, centre-cropped from the canvas. */
export const STILL_FRAME = {
  width: 480,
  height: 600,
  /** Smallest gap between the garment and any still edge, as a fraction of that side. */
  minMargin: 0.2,
  /** Shown only where the canvas does not cover the frame (it always does today). */
  fill: '#1c1814',
} as const

const STILL_ASPECT = STILL_FRAME.width / STILL_FRAME.height

/**
 * Vertical fov for the live canvas while stills are captured, so the 4:5
 * centre crop always sees `STUDIO_CAMERA.fov` vertically. A canvas at
 * least as wide as 4:5 is cropped at the sides and keeps the studio fov;
 * a narrower (portrait) canvas is cropped top and bottom, so its fov
 * widens until the crop's height spans the studio fov. Without this a
 * phone-shaped canvas would cut the garment's sides off.
 */
export function captureFov({ aspect }: { aspect: number }) {
  if (!(aspect > 0) || aspect >= STILL_ASPECT) {
    return STUDIO_CAMERA.fov
  }

  const half = (STUDIO_CAMERA.fov * Math.PI) / 360
  return (Math.atan((Math.tan(half) * STILL_ASPECT) / aspect) * 360) / Math.PI
}
