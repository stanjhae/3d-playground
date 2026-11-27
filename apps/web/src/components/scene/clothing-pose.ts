import { createContext } from 'react'

import type { AvatarMeasurements } from '../../lib/avatar-geometry'
import type { ClothingPose } from '../../lib/tee-geometry'

/** AvatarBody sets 'worn' so house-form sleeves hang over the mannequin's arms. */
export const ClothingPoseContext = createContext<ClothingPose>('flat')

/**
 * AvatarBody sets the figure a real model is fitted to (its bust and hips:
 * `fitGarment`); null wherever a garment is shown on its own.
 */
export const GarmentFitContext = createContext<AvatarMeasurements | null>(null)
