import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  PCFShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  type PerspectiveCamera,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { ModelFrame } from '../../lib/design-document'
import { onClothHold } from '../../lib/cloth-pointer'
import { useEditorStore } from '../../lib/editor-store'
import {
  LANDING_CAMERA_POSITIONS,
  studioEnvAppearance,
  type LandingCameraView,
  type StudioEnvMode,
} from '../../lib/landing-demo'
import { prefersReducedMotion } from '../../lib/prefers-reduced-motion'
import {
  CAMERA_PRESET_POSITIONS,
  captureFov,
  liveSeat,
  modelSeat,
  presetTarget,
  stillSeat,
  STUDIO_CAMERA,
  type StageFraming,
} from '../../lib/studio-camera'

export { CAMERA_PRESET_POSITIONS, STUDIO_CAMERA }

export const INTRO_DURATION = 1.2
const INTRO_FROM = [3.05, 1.82, 4.25] as const

/**
 * The canvases render on demand (`frameloop="demand"`): an idle studio
 * draws nothing, so two open tabs on software WebGL no longer starve the
 * page (IndexedDB reads stalled for seconds in CI). Anything that changes
 * the picture asks for a frame; animations ask for the next one until they
 * settle. The first frame after an idle gap reports the whole gap as its
 * delta, so that one frame steps by this much instead. Frames that follow
 * an animating frame keep their real delta, so slow machines still finish
 * on time.
 */
export const IDLE_FRAME_STEP = 1 / 60

/** Every editor change (document, paint, camera preset, capture) redraws. */
function RenderOnEditorChange() {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => useEditorStore.subscribe(() => invalidate()), [invalidate])

  return null
}

/**
 * The seamless backdrop: a screen-fixed gradient, so no floor edge or horizon
 * shows from any angle. An sRGB background skips tone mapping, so these are
 * the exact colours on screen and in a still.
 */
function StudioBackdrop({
  top,
  bottom,
}: {
  top: string
  bottom: string
}) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const context = canvas.getContext('2d')

    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
      gradient.addColorStop(0, top)
      gradient.addColorStop(1, bottom)
      context.fillStyle = gradient
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    scene.background = texture
    invalidate()

    return () => {
      scene.background = null
      texture.dispose()
    }
  }, [bottom, invalidate, scene, top])

  return null
}

export function StudioRenderer({
  exposure = 1.12,
}: {
  exposure?: number
}) {
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping = ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.shadowMap.enabled = true
    // PCFSoftShadowMap is deprecated in three@0.185 (falls back with a warning).
    gl.shadowMap.type = PCFShadowMap
  }, [exposure, gl])

  return null
}

export function StudioEnvironment({
  intensity = 0.72,
}: {
  intensity?: number
}) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    const generator = new PMREMGenerator(gl)
    const env = generator.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = intensity

    return () => {
      scene.environment = null
      env.dispose()
      generator.dispose()
    }
  }, [gl, intensity, scene])

  return null
}

export function StudioLights({
  keyIntensity = 1.85,
  envMode = 'studio',
}: {
  keyIntensity?: number
  envMode?: StudioEnvMode
}) {
  const outdoor = envMode === 'outdoor'

  return (
    <>
      <hemisphereLight
        args={[
          outdoor ? '#d7e8f5' : '#f4ead4',
          outdoor ? '#6a8a4a' : '#cfccc6',
          outdoor ? 0.55 : 0.32,
        ]}
      />
      <directionalLight
        castShadow
        color={outdoor ? '#fff8e8' : '#fffaf2'}
        intensity={keyIntensity}
        position={outdoor ? [3.2, 4.2, 1.2] : [2.2, 3.4, 1.6]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight
        color={outdoor ? '#8ec5e8' : '#e4e8ee'}
        intensity={outdoor ? 0.62 : 1.1}
        position={[-2.4, 1.2, -1.2]}
      />
      <directionalLight
        color={outdoor ? '#ffe0a8' : '#f2ede4'}
        intensity={outdoor ? 0.55 : 1.2}
        position={[0.2, 1.8, -2.4]}
      />
    </>
  )
}

/** Just under the tee's hem, so its shadow sits in frame; a figure stands on 0. */
const FLOOR_HEIGHT: Record<StageFraming, number> = { garment: 0.3, figure: 0 }

/**
 * A soft pool of shade under the tee. `ContactShadows` can't draw this one: it
 * looks up from the floor, and from there an open tube is nearly all back faces,
 * which its depth pass skips.
 */
function HemShadow({ height }: { height: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')

    if (context) {
      const shade = context.createRadialGradient(64, 64, 0, 64, 64, 64)
      shade.addColorStop(0, 'rgba(44, 42, 40, 0.3)')
      shade.addColorStop(0.55, 'rgba(44, 42, 40, 0.14)')
      shade.addColorStop(1, 'rgba(44, 42, 40, 0)')
      context.fillStyle = shade
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    return map
  }, [])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={[0, height + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[1.1, 0.5]} />
      <meshBasicMaterial depthWrite={false} map={texture} toneMapped={false} transparent />
    </mesh>
  )
}

export function StudioFloor({
  picking = true,
  framing = 'garment',
}: {
  picking?: boolean
  framing?: StageFraming
}) {
  const height = FLOOR_HEIGHT[framing]

  return (
    <>
      {/* Unseen: the backdrop is the floor. It only catches clicks off the garment. */}
      <mesh
        position={[0, height, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        // Not the garment: a graphic dropped here must not land on a panel.
        userData={{ stageCatcher: true }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()

          if (!picking || useEditorStore.getState().mode !== 'design') {
            return
          }

          useEditorStore.getState().selectMesh({ selectedMeshName: 'body' })
        }}
      >
        <circleGeometry args={[10, 64]} />
        <meshBasicMaterial depthWrite={false} opacity={0} transparent />
      </mesh>
      {framing === 'garment' ? (
        <HemShadow height={height} />
      ) : (
        <ContactShadows blur={2.8} far={4} opacity={0.36} position={[0, height + 0.01, 0]} scale={10} />
      )}
    </>
  )
}

export function StudioCamera({
  intro = false,
  framing = 'garment',
  modelFrame,
  held = false,
}: {
  intro?: boolean
  framing?: StageFraming
  /** A real model's bounds; the camera fits it instead of the preset seat. */
  modelFrame?: ModelFrame
  /** Another seat owns the camera (a landing view button): don't pull it back. */
  held?: boolean
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const aspect = useThree((state) => state.size.width / state.size.height)
  const invalidate = useThree((state) => state.invalidate)
  const cameraPreset = useEditorStore((state) => state.cameraPreset)
  const capturingAngles = useEditorStore((state) => state.capturingAngles)
  const reducedMotion = prefersReducedMotion()
  const elapsed = useRef(reducedMotion || !intro ? INTRO_DURATION : 0)
  // Whether the last frame asked for another one (see IDLE_FRAME_STEP).
  const moving = useRef(false)
  const freeOrbit = (cameraPreset === 'orbit' || held) && !capturingAngles
  const seatPreset = cameraPreset === 'orbit' ? 'threeQuarter' : cameraPreset
  // A real model (template-built garment) is fitted by its own size and
  // sleeves. Only the stage showing the design passes one: other stages
  // (a look page, the landing) frame their own garment by its preset.
  const fitted = useMemo(
    () => (modelFrame ? modelSeat({ preset: seatPreset, frame: modelFrame, live: !capturingAngles }) : null),
    [capturingAngles, modelFrame, seatPreset],
  )
  const presetSeat = fitted
    ? fitted.seat
    : capturingAngles
      ? stillSeat({ preset: seatPreset, framing })
      : liveSeat({ preset: seatPreset, framing })
  // The sleeve views aim at their sleeve; every other preset at the garment.
  const presetAim = fitted ? fitted.target : presetTarget({ preset: seatPreset })

  useLayoutEffect(() => {
    camera.near = STUDIO_CAMERA.near
    camera.far = STUDIO_CAMERA.far
    // Stills crop the canvas to 4:5, and a narrow live canvas is no wider than
    // that; keep the garment inside it (#167).
    camera.fov = captureFov({ aspect })
    camera.updateProjectionMatrix()
    invalidate()

    if (freeOrbit) {
      return
    }

    const seat = capturingAngles
      ? presetSeat
      : intro && !reducedMotion && elapsed.current < INTRO_DURATION
        ? INTRO_FROM
        : presetSeat
    camera.position.set(seat[0], seat[1], seat[2])
    camera.lookAt(...presetAim)
  }, [
    aspect,
    camera,
    cameraPreset,
    capturingAngles,
    freeOrbit,
    intro,
    invalidate,
    presetAim,
    presetSeat,
    reducedMotion,
  ])

  useFrame((_, frameDelta) => {
    const delta = moving.current ? frameDelta : Math.min(frameDelta, IDLE_FRAME_STEP)
    moving.current = false

    if (freeOrbit) {
      return
    }

    if (capturingAngles) {
      camera.position.set(presetSeat[0], presetSeat[1], presetSeat[2])
      camera.lookAt(...presetAim)
      return
    }

    if (intro && !reducedMotion && elapsed.current < INTRO_DURATION) {
      elapsed.current = Math.min(INTRO_DURATION, elapsed.current + delta)
      const t = 1 - (1 - elapsed.current / INTRO_DURATION) ** 3

      camera.position.set(
        INTRO_FROM[0] + (presetSeat[0] - INTRO_FROM[0]) * t,
        INTRO_FROM[1] + (presetSeat[1] - INTRO_FROM[1]) * t,
        INTRO_FROM[2] + (presetSeat[2] - INTRO_FROM[2]) * t,
      )
      camera.lookAt(...presetAim)
      moving.current = true
      invalidate()
      return
    }

    const current = camera.position
    const blend = reducedMotion ? 1 : Math.min(1, delta * 4)
    current.x += (presetSeat[0] - current.x) * blend
    current.y += (presetSeat[1] - current.y) * blend
    current.z += (presetSeat[2] - current.z) * blend
    camera.lookAt(...presetAim)

    // Keep drawing until the camera reaches its seat.
    if (current.distanceToSquared({ x: presetSeat[0], y: presetSeat[1], z: presetSeat[2] }) > 1e-8) {
      moving.current = true
      invalidate()
    }
  })

  return null
}

export function IntroCamera({
  enabled = true,
}: {
  enabled?: boolean
}) {
  return <StudioCamera intro={enabled} />
}

function LandingCameraSeat({
  cameraView,
  modelFrame,
}: {
  cameraView: LandingCameraView
  /** The real tee's bounds: its own fitted seats, not the drawn tee's. */
  modelFrame?: ModelFrame
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controls = useThree((state) => state.controls) as
    | {
        target: { set: (x: number, y: number, z: number) => void }
        update: () => void
      }
    | null
    | undefined

  useLayoutEffect(() => {
    // The studio's own seats for a real model, so Left and Right find its
    // sleeves as the studio's views do (render `left` is the wearer's right).
    const fitted = modelFrame ? modelSeat({ preset: cameraView, frame: modelFrame, live: true }) : null
    const seat = fitted?.seat ?? LANDING_CAMERA_POSITIONS[cameraView]
    const target = fitted?.target ?? STUDIO_CAMERA.target
    camera.position.set(seat[0], seat[1], seat[2])
    camera.lookAt(target[0], target[1], target[2])
    controls?.target.set(target[0], target[1], target[2])
    controls?.update()
  }, [camera, cameraView, controls, modelFrame])

  return null
}

export function StudioStage({
  children,
  picking = false,
  intro = false,
  envMode,
  framing = 'garment',
  modelFrame,
  cameraHeld = false,
}: {
  children?: ReactNode
  picking?: boolean
  intro?: boolean
  envMode?: StudioEnvMode
  framing?: StageFraming
  modelFrame?: ModelFrame
  /** A landing view seats the camera itself (`StudioOrbit`'s `cameraView`). */
  cameraHeld?: boolean
}) {
  const storeEnv = useEditorStore((state) => state.studioEnv)
  const resolvedEnv = envMode ?? storeEnv
  const appearance = studioEnvAppearance({ envMode: resolvedEnv })

  return (
    <>
      <StudioBackdrop top={appearance.background} bottom={appearance.backgroundLow} />
      <StudioRenderer exposure={appearance.exposure} />
      <StudioEnvironment intensity={appearance.environmentIntensity} />
      <StudioLights
        keyIntensity={appearance.keyIntensity}
        envMode={resolvedEnv}
      />
      <StudioFloor picking={picking} framing={framing} />
      <StudioCamera intro={intro} framing={framing} modelFrame={modelFrame} held={cameraHeld} />
      <RenderOnEditorChange />
      {children}
    </>
  )
}

export function StudioOrbit({
  intro = false,
  turntable = false,
  zoom = true,
  cameraView,
  modelFrame,
}: {
  intro?: boolean
  turntable?: boolean
  /** Off on the landing, where the wheel scrolls the page. */
  zoom?: boolean
  cameraView?: LandingCameraView
  /** With `cameraView`: the real model whose seats the views use. */
  modelFrame?: ModelFrame
}) {
  const reducedMotion = prefersReducedMotion()
  const [enabled, setEnabled] = useState(() => !intro || reducedMotion)
  const lockedView = Boolean(cameraView)
  const [spinning, setSpinning] = useState(
    turntable && !reducedMotion && !lockedView,
  )
  const painting = useEditorStore((state) => Boolean(state.activeStroke))
  const capturingAngles = useEditorStore((state) => state.capturingAngles)
  // A graphic being dragged across the cloth holds the view as ink does.
  const draggingLayer = useEditorStore((state) => state.activeLayerEdit !== null)
  const controlsRef = useRef<{ enabled: boolean } | null>(null)
  const orbitEnabled = enabled && !painting && !draggingLayer && !capturingAngles && !lockedView

  // Ink or a dragged graphic holds the cloth: stand the orbit down in the
  // same pointer event, and give it back only when the press lets go.
  useEffect(() => {
    return onClothHold((held) => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !held && orbitEnabled
      }
    })
  }, [orbitEnabled])

  useEffect(() => {
    if (!intro || reducedMotion) {
      setEnabled(true)
      return
    }

    setEnabled(false)
    const timer = window.setTimeout(() => {
      setEnabled(true)
    }, INTRO_DURATION * 1000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [intro, reducedMotion])

  useEffect(() => {
    setSpinning(turntable && !reducedMotion && !lockedView)
  }, [lockedView, reducedMotion, turntable])

  return (
    <>
      {cameraView ? <LandingCameraSeat cameraView={cameraView} modelFrame={modelFrame} /> : null}
      <OrbitControls
        autoRotate={
          turntable && spinning && enabled && !capturingAngles && !lockedView
        }
        autoRotateSpeed={0.35}
        ref={controlsRef as never}
        // Shared through the scene, so a two-finger turn can drive it.
        makeDefault
        enabled={orbitEnabled}
        enablePan={false}
        enableZoom={zoom}
        maxDistance={6.5}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1.7}
        minPolarAngle={Math.PI / 4}
        onStart={() => {
          setSpinning(false)
        }}
        onEnd={() => {
          if (turntable && !reducedMotion && !lockedView) {
            setSpinning(true)
          }
        }}
        target={[...STUDIO_CAMERA.target]}
      />
    </>
  )
}
