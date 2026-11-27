import { type ShapeSpec, shapeSpecFor } from './garment-shape-params.ts'

/**
 * Shape sliders beyond the T-shirt (hoodie, vest, crop top, dress,
 * trousers): every build reads and renders such a shape, but the studio
 * writes one only when the build sets `VITE_SHAPE_ALL_GARMENTS=true`. The
 * owner turns it on once a release carrying the reader has been deployed
 * for 24 h (reader first, `docs/release.md`). The tee's sliders don't
 * depend on it.
 */
export const SHAPE_ALL_GARMENTS = import.meta.env.VITE_SHAPE_ALL_GARMENTS === 'true'

/** The shape map the studio may write on this template, or null. */
export function writableShapeSpec({
  template,
  allGarments = SHAPE_ALL_GARMENTS,
}: {
  template: { id: string; version: number }
  allGarments?: boolean
}): ShapeSpec | null {
  const spec = shapeSpecFor({ template })
  return spec && (template.id === 'tee-crew-short' || allGarments) ? spec : null
}
