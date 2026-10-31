import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ACESFilmicToneMapping,
  DoubleSide,
  PCFShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  type PerspectiveCamera,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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
  STUDIO_CAMERA,
} from '../../lib/studio-camera'

export { CAMERA_PRESET_POSITIONS, STUDIO_CAMERA }

export const INTRO_DURATION = 1.2
const INTRO_FROM = [3.05, 1.82, 4.25] as const

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
          outdoor ? '#6a8a4a' : '#1a1612',
          outdoor ? 0.55 : 0.28,
        ]}
      />
      <directionalLight
        castShadow
        color={outdoor ? '#fff8e8' : '#fff6e8'}
        intensity={keyIntensity}
        position={outdoor ? [3.2, 4.2, 1.2] : [2.2, 3.4, 1.6]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight
        color={outdoor ? '#8ec5e8' : '#9bb4d0'}
        intensity={outdoor ? 0.62 : 0.38}
        position={[-2.4, 1.2, -1.2]}
      />
      <directionalLight
        color={outdoor ? '#ffe0a8' : '#c4a15a'}
        intensity={outdoor ? 0.55 : 0.42}
        position={[0.2, 1.8, -2.4]}
      />
    </>
  )
}

export function StudioFloor({
  picking = true,
}: {
  picking?: boolean
}) {
  return (
    <>
      <mesh
        position={[0, 0, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()

          if (!picking || useEditorStore.getState().mode !== 'design') {
            return
          }

          useEditorStore.getState().selectMesh({ selectedMeshName: 'body' })
        }}
      >
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial color="#1d1914" metalness={0.08} roughness={0.78} />
      </mesh>
      <mesh position={[0, 2.8, -4]} receiveShadow>
        <cylinderGeometry args={[9.5, 9.5, 6, 48, 1, true]} />
        <meshStandardMaterial
          color="#241f19"
          metalness={0.04}
          roughness={0.92}
          side={DoubleSide}
        />
      </mesh>
      <ContactShadows
        blur={2.8}
        far={4}
        opacity={0.48}
        position={[0, 0.01, 0]}
        scale={10}
      />
    </>
  )
}

export function StudioCamera({
  intro = false,
}: {
  intro?: boolean
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const cameraPreset = useEditorStore((state) => state.cameraPreset)
  const capturingAngles = useEditorStore((state) => state.capturingAngles)
  const reducedMotion = prefersReducedMotion()
  const elapsed = useRef(reducedMotion || !intro ? INTRO_DURATION : 0)
  const freeOrbit = cameraPreset === 'orbit' && !capturingAngles
  const presetSeat =
    cameraPreset === 'orbit'
      ? CAMERA_PRESET_POSITIONS.threeQuarter
      : CAMERA_PRESET_POSITIONS[cameraPreset]

  useLayoutEffect(() => {
    camera.near = STUDIO_CAMERA.near
    camera.far = STUDIO_CAMERA.far
    // Stills crop the canvas to 4:5; keep the garment inside it (#167).
    camera.fov = capturingAngles
      ? captureFov({ aspect: camera.aspect })
      : STUDIO_CAMERA.fov
    camera.updateProjectionMatrix()

    if (freeOrbit) {
      return
    }

    const seat = capturingAngles
      ? presetSeat
      : intro && !reducedMotion && elapsed.current < INTRO_DURATION
        ? INTRO_FROM
        : presetSeat
    camera.position.set(seat[0], seat[1], seat[2])
    camera.lookAt(...STUDIO_CAMERA.target)
  }, [
    camera,
    cameraPreset,
    capturingAngles,
    freeOrbit,
    intro,
    presetSeat,
    reducedMotion,
  ])

  useFrame((_, delta) => {
    if (freeOrbit) {
      return
    }

    if (capturingAngles) {
      camera.position.set(presetSeat[0], presetSeat[1], presetSeat[2])
      camera.lookAt(...STUDIO_CAMERA.target)
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
      camera.lookAt(...STUDIO_CAMERA.target)
      return
    }

    const current = camera.position
    const blend = reducedMotion ? 1 : Math.min(1, delta * 4)
    current.x += (presetSeat[0] - current.x) * blend
    current.y += (presetSeat[1] - current.y) * blend
    current.z += (presetSeat[2] - current.z) * blend
    camera.lookAt(...STUDIO_CAMERA.target)
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
}: {
  cameraView: LandingCameraView
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
    const seat = LANDING_CAMERA_POSITIONS[cameraView]
    camera.position.set(seat[0], seat[1], seat[2])
    camera.lookAt(...STUDIO_CAMERA.target)
    controls?.target.set(...STUDIO_CAMERA.target)
    controls?.update()
  }, [camera, cameraView, controls])

  return null
}

export function StudioStage({
  children,
  picking = false,
  intro = false,
  envMode,
}: {
  children?: ReactNode
  picking?: boolean
  intro?: boolean
  envMode?: StudioEnvMode
}) {
  const storeEnv = useEditorStore((state) => state.studioEnv)
  const resolvedEnv = envMode ?? storeEnv
  const appearance = studioEnvAppearance({ envMode: resolvedEnv })

  return (
    <>
      <color attach="background" args={[appearance.background]} />
      <StudioRenderer exposure={appearance.exposure} />
      <StudioEnvironment intensity={appearance.environmentIntensity} />
      <StudioLights
        keyIntensity={appearance.keyIntensity}
        envMode={resolvedEnv}
      />
      <StudioFloor picking={picking} />
      <StudioCamera intro={intro} />
      {children}
    </>
  )
}

export function StudioOrbit({
  intro = false,
  turntable = false,
  cameraView,
}: {
  intro?: boolean
  turntable?: boolean
  cameraView?: LandingCameraView
}) {
  const reducedMotion = prefersReducedMotion()
  const [enabled, setEnabled] = useState(() => !intro || reducedMotion)
  const lockedView = Boolean(cameraView)
  const [spinning, setSpinning] = useState(
    turntable && !reducedMotion && !lockedView,
  )
  const painting = useEditorStore((state) => Boolean(state.activeStroke))
  const capturingAngles = useEditorStore((state) => state.capturingAngles)

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
      {cameraView ? <LandingCameraSeat cameraView={cameraView} /> : null}
      <OrbitControls
        autoRotate={
          turntable && spinning && enabled && !capturingAngles && !lockedView
        }
        autoRotateSpeed={0.35}
        enabled={enabled && !painting && !capturingAngles && !lockedView}
        enablePan={false}
        maxDistance={6.5}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={3.2}
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
