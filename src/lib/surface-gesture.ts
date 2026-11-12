import type { DesignTool } from './editor-store'

export type SurfaceGesture = 'drag-layer' | 'place-text' | 'stroke' | 'none'

/**
 * What a press on the garment surface (2D panel or 3D cloth) does.
 *
 * Ink only goes down while the Draw tool is on and the view is not held for
 * turning: with any other tool a drag on the cloth turns the garment, so a
 * shopper rotating it never paints by accident.
 */
export function surfaceGesture({
  designTool,
  wordArmed,
  hitsLayer,
  rotatingView,
}: {
  designTool: DesignTool
  /** Text tool with "Tap to place" on and a word typed. */
  wordArmed: boolean
  hitsLayer: boolean
  rotatingView: boolean
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

  return designTool === 'draw' ? 'stroke' : 'none'
}
