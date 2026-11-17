/**
 * How small and large an image, word or print may be (`scale`, and `scaleY`
 * when stretched), as a fraction of its panel. Every way of resizing keeps
 * to it: the corner and edge handles, two fingers, the Size slider and the
 * Size, Width and Height fields.
 */
export const LAYER_SCALE_RANGE = { min: 0.05, max: 0.8 } as const

export function clampLayerScale(value: number) {
  return Math.min(LAYER_SCALE_RANGE.max, Math.max(LAYER_SCALE_RANGE.min, value))
}
