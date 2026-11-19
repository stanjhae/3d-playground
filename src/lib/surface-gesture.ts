import type { DesignTool } from './editor-store'

export type SurfaceGesture = 'drag-layer' | 'place-text' | 'stroke' | 'none'

/**
 * What a press on the garment surface (2D panel or 3D cloth) does.
 *
 * Ink only goes down while the Draw tool is on and the view is not held for
 * turning: with any other tool a drag on the cloth turns the garment, so a
 * shopper rotating it never paints by accident.
 *
 * On the 3D cloth the camera's Orbit view is for turning, so there a drag
 * turns the garment even with Draw on ("I accidentally painted when
 * rotating"): drawing on the cloth needs a view such as Front or 3/4. The
 * flat panels never orbit, so they always draw.
 */
export function surfaceGesture({
  designTool,
  wordArmed,
  hitsLayer,
  rotatingView,
  orbiting = false,
}: {
  designTool: DesignTool
  /** Text tool with "Tap to place" on and a word typed. */
  wordArmed: boolean
  hitsLayer: boolean
  rotatingView: boolean
  /** The 3D camera is on Orbit (never for the flat panels). */
  orbiting?: boolean
}): SurfaceGesture {
  if (rotatingView) {
    return 'none'
  }

  // A press on a placed mark always takes hold of it, even with a word armed.
  if (hitsLayer) {
    return 'drag-layer'
  }

  if (wordArmed) {
    return 'place-text'
  }

  return designTool === 'draw' && !orbiting ? 'stroke' : 'none'
}
