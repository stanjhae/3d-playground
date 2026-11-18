import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import type { DesignDocument } from '../../lib/design-document'
import type { MaterialOverride } from '../../lib/design-schema'
import { GRAPHIC_DROP_EVENT, type GraphicDropDetail, droppedGraphic } from '../../lib/graphic-drag'
import { LANDING_VIEW_PANEL, stampLandingGraphic, type LandingCameraView } from '../../lib/landing-demo'
import { useLandingDemoStore, type LandingSurfaceMode } from '../../lib/landing-demo-store'
import { landingRenderDocument, toSketchPoint, withLandingOverlays } from '../../lib/landing-real-tee'
import { FashionLoader } from '../scene/FashionLoader'
import { Garment } from '../scene/Garment'
import { createPanelPointAt, type PanelPointAt } from '../scene/panel-point-at'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from '../scene/StudioStage'
import { addLandingGraphic } from './HeroToolDock'
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
      // After a hand turn the pad and drops follow the side in view.
      useLandingDemoStore.getState().syncSide(Number(azimuth))
    }
  })

  return null
}

/**
 * On touch, Turn leaves vertical swipes to the page (one finger turns the
 * tee sideways), and Draw keeps every finger on the tee. Set on the element
 * the orbit listens on, after it has claimed `touch-action: none` for itself.
 */
function LandingTouchAction({ mode }: { mode: LandingSurfaceMode }) {
  const element = useThree((state) => state.events.connected as HTMLElement | null | undefined)
  const controls = useThree((state) => state.controls)

  useEffect(() => {
    if (element) element.style.touchAction = mode === 'draw' ? 'none' : 'pan-y'
  }, [controls, element, mode])

  return null
}

/**
 * A graphic let go over the tee lands where it was dropped, on the side it
 * was dropped on (the studio's `ClothDropTarget` lookup, on the hero's
 * render document, written back to the sketch). Off the cloth, it lands in
 * the middle of the side in view. Mouse drags come as HTML5 drops, a
 * finger's as `GRAPHIC_DROP_EVENT`. The canvas carries `flvPanelPointAt`
 * for tests, as the studio's does.
 */
function LandingDropTarget({ document }: { document: DesignDocument }) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const element = useThree((state) => state.events.connected as HTMLElement | null | undefined)
  const panelUv = useRef(document.panelUv)
  panelUv.current = document.panelUv

  useEffect(() => {
    if (!element) return
    const target = element
    const canvas = gl.domElement as HTMLCanvasElement & { flvPanelPointAt?: PanelPointAt }
    const panelPointAt = createPanelPointAt({ element: canvas, camera, scene, panelUv: () => panelUv.current })

    function place({ src, clientX, clientY }: { src: string; clientX: number; clientY: number }) {
      const store = useLandingDemoStore.getState()
      const hit = panelPointAt(clientX, clientY)
      const point = hit ? toSketchPoint(hit) : null
      store.setDraggingGraphic(false)
      addLandingGraphic((previous) =>
        stampLandingGraphic({
          document: previous,
          src,
          ...(point ? { panel: point.panel, x: point.x, y: point.y } : { panel: LANDING_VIEW_PANEL[store.side] }),
        }),
      )
    }

    function onDrop(event: DragEvent) {
      const src = droppedGraphic({ dataTransfer: event.dataTransfer })

      if (!src) return
      // Taken here: the stage's own drop (the side's middle) is for the poster.
      event.preventDefault()
      event.stopPropagation()
      place({ src, clientX: event.clientX, clientY: event.clientY })
    }

    function onTouchDrop(event: Event) {
      const detail = (event as CustomEvent<GraphicDropDetail>).detail
      detail.handled = true
      event.stopPropagation()
      place(detail)
    }

    canvas.flvPanelPointAt = panelPointAt
    target.addEventListener('drop', onDrop)
    target.addEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)

    return () => {
      delete canvas.flvPanelPointAt
      target.removeEventListener('drop', onDrop)
      target.removeEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
    }
  }, [camera, element, gl, scene])

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
  interactive = true,
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
  /** Off until the first frame shows: till then, presses reach the poster. */
  interactive?: boolean
  /** A touch screen: no shadows, to keep phones cool. */
  coarsePointer?: boolean
  onReady?: () => void
  onLost?: () => void
}) {
  // The studio's real tee, not the drawn one, so the demo matches the editor.
  const base = useMemo(() => landingRenderDocument({ document: documentProp }), [documentProp])
  const selectedLayerId = useLandingDemoStore((state) => state.selectedLayerId)
  const surfaceMode = useLandingDemoStore((state) => state.surfaceMode)
  const releaseCameraView = useLandingDemoStore((state) => state.releaseCameraView)
  const handTurned = useLandingDemoStore((state) => state.handTurned)
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
      className={cn('size-full', { 'pointer-events-none': !interactive, 'cursor-crosshair': surfaceMode === 'draw' })}
    >
      {/* The landing seats its own camera (`StudioOrbit`), so the stage never pulls it back. */}
      <StudioStage envMode="studio" framing="figure" modelFrame={document.modelFrame} cameraHeld>
        <Suspense fallback={<FashionLoader />}>
          <LandingTeeSurface document={document} onLiveStroke={onLiveStroke} onPress={onTeePress} onTurn={releaseCameraView}>
            {/* The real tee stands on its own, as in the studio: the mannequin was posed for the drawn one. */}
            <Garment garmentId="tee" overrides={overrides} document={document} picking={false} />
          </LandingTeeSurface>
          <FirstFrame onReady={onReady} />
        </Suspense>
      </StudioStage>
      <StudioOrbit
        // Still while the visitor draws on it or has a logo picked, and for good once they turn it by hand.
        turntable={spin && !cameraView && !handTurned && active && surfaceMode === 'turn' && !selectedLayerId}
        zoom={false}
        cameraView={cameraView}
        modelFrame={document.modelFrame}
        onTurn={releaseCameraView}
      />
      <CameraAzimuth />
      <LandingTouchAction mode={surfaceMode} />
      <LandingDropTarget document={document} />
    </Canvas>
  )
}
