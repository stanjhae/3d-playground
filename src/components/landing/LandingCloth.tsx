import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useMemo, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import type { DesignDocument } from '../../lib/design-document'
import type { MaterialOverride } from '../../lib/design-schema'
import type { LandingCameraView } from '../../lib/landing-demo'
import { useLandingDemoStore } from '../../lib/landing-demo-store'
import { landingRenderDocument, withLandingOverlays } from '../../lib/landing-real-tee'
import { FashionLoader } from '../scene/FashionLoader'
import { Garment } from '../scene/Garment'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from '../scene/StudioStage'
import { LandingTeeSurface, TAP_SLOP, type LiveStroke } from './LandingTeeSurface'

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
 * Says which way the camera faces the tee (radians round it, 0 = the front)
 * on the canvas, for tests: `data-camera-azimuth`.
 */
function CameraAzimuth() {
  useFrame(({ camera, controls, gl }) => {
    const target = (controls as { target?: { x: number; z: number } } | null)?.target ?? { x: 0, z: 0 }
    const azimuth = Math.atan2(camera.position.x - target.x, camera.position.z - target.z).toFixed(3)

    if (gl.domElement.dataset.cameraAzimuth !== azimuth) {
      gl.domElement.dataset.cameraAzimuth = azimuth
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
  const base = useMemo(() => landingRenderDocument({ document: documentProp }), [documentProp])
  const selectedLayerId = useLandingDemoStore((state) => state.selectedLayerId)
  const surfaceMode = useLandingDemoStore((state) => state.surfaceMode)
  const releaseCameraView = useLandingDemoStore((state) => state.releaseCameraView)
  const [liveStroke, setLiveStroke] = useState<LiveStroke | null>(null)
  const onLiveStroke = useCallback((stroke: LiveStroke | null) => setLiveStroke(stroke), [])
  const pressedTee = useRef(false)
  const press = useRef<{ x: number; y: number; tee: boolean } | null>(null)
  const onTeePress = useCallback(() => {
    pressedTee.current = true
  }, [])
  const document = useMemo(
    () => withLandingOverlays({ document: base, selectedLayerId, liveStroke }),
    [base, selectedLayerId, liveStroke],
  )

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
      // A tap off the tee lets go of the picked logo. The scene's own handlers
      // run first (they listen on this element), so a press on the tee is known.
      onPointerDown={(event) => {
        press.current = { x: event.clientX, y: event.clientY, tee: pressedTee.current }
        pressedTee.current = false
      }}
      onPointerUp={(event) => {
        const start = press.current
        press.current = null

        if (start && !start.tee && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_SLOP) {
          useLandingDemoStore.getState().selectLayer(null)
        }
      }}
      className={cn('size-full', { 'pointer-events-none': coarsePointer, 'cursor-crosshair': surfaceMode === 'draw' })}
    >
      {/* The landing seats its own camera (`StudioOrbit`), so the stage never pulls it back. */}
      <StudioStage envMode="studio" framing="figure" modelFrame={document.modelFrame} cameraHeld>
        <Suspense fallback={<FashionLoader />}>
          <LandingTeeSurface document={document} onLiveStroke={onLiveStroke} onPress={onTeePress}>
            {/* The real tee stands on its own, as in the studio: the mannequin was posed for the drawn one. */}
            <Garment garmentId="tee" overrides={overrides} document={document} picking={false} />
          </LandingTeeSurface>
          <FirstFrame onReady={onReady} />
        </Suspense>
      </StudioStage>
      <StudioOrbit
        // Still while the visitor draws on it or has a logo picked.
        turntable={spin && !cameraView && active && surfaceMode === 'turn' && !selectedLayerId}
        zoom={false}
        cameraView={cameraView}
        modelFrame={document.modelFrame}
        onTurn={releaseCameraView}
      />
      <CameraAzimuth />
    </Canvas>
  )
}
