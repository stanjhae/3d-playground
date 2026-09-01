import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

import type { GarmentId, MaterialOverride } from '../../lib/design-schema'
import { FashionLoader } from './FashionLoader'
import { Garment } from './Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from './StudioStage'

export function LookStage({
  overrides,
  garmentId,
}: {
  overrides: MaterialOverride[]
  garmentId?: GarmentId
}) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Canvas
        shadows
        camera={{
          position: [...STUDIO_CAMERA.position],
          fov: STUDIO_CAMERA.fov,
          near: STUDIO_CAMERA.near,
          far: STUDIO_CAMERA.far,
        }}
        gl={{ antialias: true }}
        className="h-full min-h-80 w-full bg-atelier"
      >
        <StudioStage>
          <Suspense fallback={<FashionLoader />}>
            <Garment
              garmentId={garmentId}
              overrides={overrides}
              picking={false}
            />
          </Suspense>
        </StudioStage>
        <StudioOrbit />
      </Canvas>
    </div>
  )
}
