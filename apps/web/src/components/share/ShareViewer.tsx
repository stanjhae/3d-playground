import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PerspectiveCamera } from 'three'

import { readCanonicalDocument } from '../../lib/canonical-document'
import type { DesignDocument, ModelFrame } from '../../lib/design-document'
import { resolveGarmentId } from '../../lib/design-schema'
import { studioStageBackdrop } from '../../lib/landing-demo'
import { LIBRARY_ASSET_SOURCES } from '../../lib/library-assets'
import { prefersReducedMotion } from '../../lib/prefers-reduced-motion'
import { toRenderDocument } from '../../lib/render-projection'
import { getPublicScene, type ShareViewPreset } from '../../lib/share-3d'
import { liveSeat, modelSeat, presetTarget, type StageFraming } from '../../lib/studio-camera'
import { Garment } from '../scene/Garment'
import { StudioStage } from '../scene/StudioStage'

/**
 * The share page's 3D view: the published version on its own garment model,
 * drawn by the studio's renderer (`toRenderDocument`, `Garment`,
 * `StudioStage`). Read-only: no picking, no editor state. A drag turns it
 * round; the page's buttons glide it to the views the stills show. Any
 * failure (no scene, an image that won't load, a lost context) calls
 * `onFail`, and the page keeps its stills.
 */

type Vec3 = readonly [number, number, number]

type Prepared = { document: DesignDocument; sources: string[] }

/** No 3D for this design: the page keeps its stills, without a failure note. */
const UNSUPPORTED = 'unsupported' as const

/** Each uploaded image as a local blob, so a missing one fails the view instead of drawing a gap. */
async function loadAssets({ assets }: { assets: Record<string, string> }) {
  const entries = await Promise.all(
    Object.entries(assets).map(async ([assetId, url]) => {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('asset unavailable')
      }

      return [assetId, URL.createObjectURL(await response.blob())] as const
    }),
  )

  return Object.fromEntries(entries)
}

async function prepare({ slug, seq }: { slug: string; seq: number }): Promise<Prepared | typeof UNSUPPORTED | null> {
  const result = await getPublicScene({ slug, seq })

  if (!result.ok) {
    return null
  }

  const read = readCanonicalDocument({ value: result.scene.document })

  if (!read.ok) {
    return null
  }

  // A pattern design is drawn from its stored drape, never re-simulated on a
  // visitor's device (docs/decisions.md, Pattern mode rule 2), and that drape
  // has no public read yet.
  if (read.document.pattern) {
    return UNSUPPORTED
  }

  const uploaded = await loadAssets({ assets: result.scene.assets })
  const sources = Object.values(uploaded)

  try {
    const projected = toRenderDocument({ document: read.document, assetSources: { ...LIBRARY_ASSET_SOURCES, ...uploaded } })

    if (projected.missingAssets.length > 0) {
      sources.forEach((url) => URL.revokeObjectURL(url))
      return null
    }

    return { document: projected.document, sources }
  } catch (error) {
    sources.forEach((url) => URL.revokeObjectURL(url))
    throw error
  }
}

/** Seat and aim for a view: a real model's fitted seats, or the tee's own. */
function viewSeat({
  preset,
  modelFrame,
  framing,
}: {
  preset: ShareViewPreset
  modelFrame?: ModelFrame
  framing: StageFraming
}): { seat: Vec3; target: Vec3 } {
  return modelFrame
    ? modelSeat({ preset, frame: modelFrame, live: true })
    : { seat: liveSeat({ preset, framing }), target: presetTarget({ preset }) }
}

type Controls = { target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }; update: () => void }

/**
 * Glides the camera to the chosen view, then leaves it to the hand. A view
 * picked again (`turn` changes) glides again; a drag stops the glide.
 */
function ViewSeat({
  preset,
  turn,
  modelFrame,
  framing,
  gliding,
}: {
  preset: ShareViewPreset
  turn: number
  modelFrame?: ModelFrame
  framing: StageFraming
  gliding: { current: boolean }
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controls = useThree((state) => state.controls) as Controls | null
  const invalidate = useThree((state) => state.invalidate)
  const goal = useMemo(() => viewSeat({ preset, modelFrame, framing }), [framing, modelFrame, preset])
  const first = useRef(true)

  useEffect(() => {
    if (!controls) {
      return
    }

    // The first view, and every view under reduced motion, is a cut.
    if (first.current || prefersReducedMotion()) {
      first.current = false
      camera.position.set(...goal.seat)
      controls.target.set(...goal.target)
      controls.update()
      gliding.current = false
    } else {
      gliding.current = true
    }

    invalidate()
  }, [camera, controls, gliding, goal, invalidate, turn])

  useFrame((_, delta) => {
    if (!gliding.current || !controls) {
      return
    }

    const blend = Math.min(1, Math.min(delta, 1 / 30) * 6)
    const position = camera.position
    const target = controls.target
    position.set(
      position.x + (goal.seat[0] - position.x) * blend,
      position.y + (goal.seat[1] - position.y) * blend,
      position.z + (goal.seat[2] - position.z) * blend,
    )
    target.set(
      target.x + (goal.target[0] - target.x) * blend,
      target.y + (goal.target[1] - target.y) * blend,
      target.z + (goal.target[2] - target.z) * blend,
    )
    controls.update()

    const left =
      Math.hypot(goal.seat[0] - position.x, goal.seat[1] - position.y, goal.seat[2] - position.z) +
      Math.hypot(goal.target[0] - target.x, goal.target[1] - target.y, goal.target[2] - target.z)

    if (left < 1e-3) {
      position.set(...goal.seat)
      target.set(...goal.target)
      controls.update()
      gliding.current = false
    } else {
      invalidate()
    }
  })

  return null
}

/** Reports a lost context, and lets a phone scroll the page past the canvas. */
function CanvasWatch({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const canvas = gl.domElement
    // The orbit sets `touch-action: none`; a vertical swipe should still scroll the page.
    const frame = requestAnimationFrame(() => {
      canvas.style.touchAction = 'pan-y'
    })
    const lost = (event: Event) => {
      event.preventDefault()
      onLost()
    }

    canvas.addEventListener('webglcontextlost', lost)
    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('webglcontextlost', lost)
    }
  }, [gl, onLost])

  return null
}

/** Says when the garment has drawn: the first frame after its model loads. */
function Drawn({ onDrawn }: { onDrawn: () => void }) {
  const done = useRef(false)

  useFrame(() => {
    if (!done.current) {
      done.current = true
      // After this frame is on screen.
      requestAnimationFrame(() => onDrawn())
    }
  })

  return null
}

class ViewerBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function ShareViewer({
  slug,
  seq,
  preset,
  turn,
  onReady,
  onFail,
  onUnsupported,
  onHandTurn,
}: {
  slug: string
  seq: number
  preset: ShareViewPreset
  /** Bumped on every view button press, so the same view can glide back. */
  turn: number
  onReady: (details: { sleeves: boolean }) => void
  onFail: () => void
  /** This design has no 3D view (a pattern design): keep the stills, say nothing. */
  onUnsupported: () => void
  /** A drag by hand: no view button is current any more. */
  onHandTurn: () => void
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const gliding = useRef(false)
  // Callbacks change every render of the page; the effects only need the latest.
  const handlers = useRef({ onReady, onFail, onUnsupported, onHandTurn })
  handlers.current = { onReady, onFail, onUnsupported, onHandTurn }
  // A press on the canvas; only a press that turns it counts as a hand turn.
  const pressing = useRef(false)

  useEffect(() => {
    let live = true
    let sources: string[] = []

    prepare({ slug, seq })
      .then((result) => {
        if (!live) {
          if (result && result !== UNSUPPORTED) {
            result.sources.forEach((url) => URL.revokeObjectURL(url))
          }
          return
        }

        if (result === UNSUPPORTED) {
          handlers.current.onUnsupported()
          return
        }

        if (!result) {
          handlers.current.onFail()
          return
        }

        sources = result.sources
        setPrepared(result)
      })
      .catch(() => {
        if (live) {
          handlers.current.onFail()
        }
      })

    return () => {
      live = false
      sources.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [seq, slug])

  if (!prepared) {
    return null
  }

  const { document } = prepared
  // As in the studio and the look page (#435): a real model stands at its true height.
  const framing: StageFraming = resolveGarmentId({ garmentId: document.garmentId }) === 'tee' && !document.modelSrc ? 'garment' : 'figure'
  const sleeves = document.modelFrame ? Boolean(document.modelFrame.sleeves.left || document.modelFrame.sleeves.right) : true

  return (
    <ViewerBoundary onError={() => handlers.current.onFail()}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 36, near: 0.1, far: 2000 }}
        gl={{ antialias: true }}
        className="h-full w-full"
        style={{ background: studioStageBackdrop() }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute('data-testid', 'share-3d-canvas')
        }}
      >
        <CanvasWatch onLost={() => handlers.current.onFail()} />
        {/* The stage holds no camera of its own: the view buttons seat it here. */}
        <StudioStage framing={framing} modelFrame={document.modelFrame} cameraHeld>
          <Suspense fallback={null}>
            <Garment garmentId={document.garmentId} document={document} overrides={document.overrides} picking={false} />
            <Drawn onDrawn={() => handlers.current.onReady({ sleeves })} />
          </Suspense>
        </StudioStage>
        <OrbitControls
          makeDefault
          enablePan={false}
          // The wheel and a pinch scroll and zoom the page, not the garment.
          enableZoom={false}
          maxPolarAngle={Math.PI / 2.05}
          minPolarAngle={Math.PI / 4}
          onStart={() => {
            pressing.current = true
          }}
          onChange={() => {
            if (pressing.current) {
              gliding.current = false
              handlers.current.onHandTurn()
            }
          }}
          onEnd={() => {
            pressing.current = false
          }}
        />
        <ViewSeat preset={preset} turn={turn} modelFrame={document.modelFrame} framing={framing} gliding={gliding} />
      </Canvas>
    </ViewerBoundary>
  )
}
