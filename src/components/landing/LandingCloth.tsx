import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

import type { AvatarMeasurements } from '../../lib/avatar-geometry'
import type { DesignDocument } from '../../lib/design-document'
import type { GarmentId, MaterialOverride } from '../../lib/design-schema'
import type {
  LandingCameraView,
  StudioEnvMode,
} from '../../lib/landing-demo'
import { AvatarBody } from '../scene/AvatarBody'
import { FashionLoader } from '../scene/FashionLoader'
import { Garment } from '../scene/Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from '../scene/StudioStage'

export function LandingCloth({
  garmentId,
  overrides,
  structural,
  document: documentProp,
  measurements,
  cameraView,
  envMode = 'studio',
}: {
  garmentId: GarmentId
  overrides: MaterialOverride[]
  structural?: DesignDocument['structural']
  document?: DesignDocument
  measurements?: AvatarMeasurements
  cameraView?: LandingCameraView
  envMode?: StudioEnvMode
  /** @deprecated Kept for callers; tee always seats on the mannequin. */
  tryOn?: boolean
}) {
  const seatTee = garmentId === 'tee'

  return (
    <div className="relative h-full min-h-80 w-full overflow-hidden bg-flv-ink">
      <Canvas
        shadows
        camera={{
          position: [...STUDIO_CAMERA.position],
          fov: STUDIO_CAMERA.fov,
          near: STUDIO_CAMERA.near,
          far: STUDIO_CAMERA.far,
        }}
        gl={{ antialias: true }}
        className="h-full min-h-80 w-full touch-none"
      >
        <StudioStage envMode={envMode}>
          <Suspense fallback={<FashionLoader />}>
            {seatTee ? (
              <AvatarBody measurements={measurements}>
                <Garment
                  garmentId={garmentId}
                  overrides={overrides}
                  structural={structural}
                  document={documentProp}
                  picking={false}
                />
              </AvatarBody>
            ) : (
              <Garment
                garmentId={garmentId}
                overrides={overrides}
                structural={structural}
                document={documentProp}
                picking={false}
              />
            )}
          </Suspense>
        </StudioStage>
        <StudioOrbit turntable={!cameraView} cameraView={cameraView} />
      </Canvas>
    </div>
  )
}
