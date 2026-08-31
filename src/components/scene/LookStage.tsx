import { Html, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

import type { GarmentId, MaterialOverride } from '../../lib/design-schema'
import { Garment } from './Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from './StudioStage'

function FashionLoader() {
  const { errors, progress } = useProgress()

  return (
    <Html center>
      <p className="font-display text-xs tracking-[0.28em] text-ivory-muted uppercase">
        {errors.length > 0
          ? 'The look could not open'
          : `Opening the look ${Math.round(progress)}`}
      </p>
    </Html>
  )
}

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
