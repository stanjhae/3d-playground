import { createContext } from 'react'

import type { ClothingPose } from '../../lib/tee-geometry'

/** AvatarBody sets 'worn' so house-form sleeves hang over the mannequin's arms. */
export const ClothingPoseContext = createContext<ClothingPose>('flat')
