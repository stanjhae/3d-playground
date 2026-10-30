import type { GarmentId } from './design-schema'

/**
 * FLP scope gate (E01 #152). The tee runs on the canonical v2 document;
 * everything else in the studio is a labelled concept outside the MVP
 * slice (PRD §5). `VITE_FLP_CONCEPT=true` shows concept garments in the
 * studio; remixing a concept look from the board still opens it.
 */
export const CONCEPT_FEATURES = import.meta.env.VITE_FLP_CONCEPT === 'true'

/** True for garments whose design is stored as the canonical v2 document. */
export function isCanonicalGarment({ garmentId }: { garmentId: GarmentId }) {
  return garmentId === 'tee'
}

export function showsGarmentInStudio({ garmentId }: { garmentId: GarmentId }) {
  return CONCEPT_FEATURES || isCanonicalGarment({ garmentId })
}
