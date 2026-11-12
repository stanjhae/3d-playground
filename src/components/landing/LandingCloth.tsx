import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'

import type { DesignDocument } from '../../lib/design-document'
import type { MaterialOverride } from '../../lib/design-schema'
import type { LandingCameraView } from '../../lib/landing-demo'
import { landingRenderDocument } from '../../lib/landing-real-tee'
import { FashionLoader } from '../scene/FashionLoader'
import { Garment } from '../scene/Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from '../scene/StudioStage'

/** Tells the hero the first real frame is on screen, so the poster can go. */
function FirstFrame({ onReady }: { onReady?: () => void }) {
  const done = useRef(false)

  useFrame(() => {
    if (!done.current) {
      done.current = true
      onReady?.()
    }
  })

  return null
}

/**
 * The landing hero's live tee, loaded lazily by HeroStage so three.js never
 * sits on the landing's critical path. Transparent, over the hero's poster.
 */
export default function LandingCloth({
  overrides,
  document: documentProp,
  cameraView,
  active = true,
  coarsePointer = false,
  spin = true,
  onReady,
  onLost,
}: {
  /** The turntable; off for the baked poster. */
  spin?: boolean
  overrides: MaterialOverride[]
  document?: DesignDocument
  cameraView?: LandingCameraView
  /** Off screen, the scene stops drawing. */
  active?: boolean
  /** On touch screens the page scrolls over the tee; the view buttons turn it. */
  coarsePointer?: boolean
  onReady?: () => void
  onLost?: () => void
}) {
  // The studio's real tee, not the drawn one, so the demo matches the editor.
  const document = useMemo(() => landingRenderDocument({ document: documentProp }), [documentProp])

  return (
    <Canvas
      shadows={!coarsePointer}
      dpr={[1, 1.75]}
      frameloop={active ? 'demand' : 'never'}
      camera={{
        position: [...STUDIO_CAMERA.position],
        fov: STUDIO_CAMERA.fov,
        near: STUDIO_CAMERA.near,
        far: STUDIO_CAMERA.far,
      }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0)
        gl.domElement.addEventListener('webglcontextlost', () => onLost?.(), { once: true })
      }}
      data-engine="landing"
      className={coarsePointer ? 'pointer-events-none size-full' : 'size-full'}
    >
      <StudioStage envMode="studio" framing="figure" modelFrame={document.modelFrame} cameraHeld={Boolean(cameraView)}>
        <Suspense fallback={<FashionLoader />}>
          {/* The real tee stands on its own, as in the studio: the mannequin was posed for the drawn one. */}
          <Garment garmentId="tee" overrides={overrides} document={document} picking={false} />
          <FirstFrame onReady={onReady} />
        </Suspense>
      </StudioStage>
      <StudioOrbit
        turntable={spin && !cameraView && active}
        zoom={false}
        cameraView={cameraView}
        modelFrame={document.modelFrame}
      />
    </Canvas>
  )
}
