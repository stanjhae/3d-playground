import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

import type { DesignDocument } from '../../lib/design-document'
import { resolveGarmentId, type GarmentId, type MaterialOverride } from '../../lib/design-schema'
import { studioStageBackdrop } from '../../lib/landing-demo'
import { FashionLoader } from './FashionLoader'
import { Garment } from './Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from './StudioStage'

export function LookStage({
  overrides,
  garmentId,
  document,
}: {
  overrides: MaterialOverride[]
  garmentId?: GarmentId
  /** The look as drawn (`lookRenderDocument`): its model and live layers. */
  document: DesignDocument
}) {
  return (
    <div className="relative h-full min-h-80 w-full">
      <Canvas
        shadows
        frameloop="demand"
        camera={{
          position: [...STUDIO_CAMERA.position],
          fov: STUDIO_CAMERA.fov,
          near: STUDIO_CAMERA.near,
          far: STUDIO_CAMERA.far,
        }}
        gl={{ antialias: true }}
        className="h-full min-h-80 w-full touch-none"
        style={{ background: studioStageBackdrop() }}
      >
        {/* As in the studio: a real model stands at its true height, fitted to its frame. */}
        <StudioStage
          framing={resolveGarmentId({ garmentId }) === 'tee' && !document.modelSrc ? 'garment' : 'figure'}
          modelFrame={document.modelFrame}
        >
          <Suspense fallback={<FashionLoader />}>
            <Garment
              garmentId={garmentId}
              overrides={overrides}
              document={document}
              picking={false}
            />
          </Suspense>
        </StudioStage>
        <StudioOrbit turntable />
      </Canvas>
    </div>
  )
}
