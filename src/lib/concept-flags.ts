import type { GarmentId } from './design-schema'
import { templateForGarment } from './template-manifest'

/**
 * FLP scope gate (E01 #152). Every garment with a template runs on the
 * canonical v2 document and is in the studio for everyone (real models
 * everywhere). `VITE_FLP_CONCEPT=true` still shows the remaining concept
 * pieces: the hidden house jacket and the landing's community and
 * coming-soon sections.
 */
export const CONCEPT_FEATURES = import.meta.env.VITE_FLP_CONCEPT === 'true'

/**
 * True for garments whose design is stored as the canonical v2 document:
 * those with a template (`template-manifest.ts`).
 */
export function isCanonicalGarment({ garmentId }: { garmentId: GarmentId }) {
  return Boolean(templateForGarment({ garmentId }))
}

export function showsGarmentInStudio({ garmentId }: { garmentId: GarmentId }) {
  return CONCEPT_FEATURES || isCanonicalGarment({ garmentId })
}
