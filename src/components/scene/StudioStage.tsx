import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ACESFilmicToneMapping,
  DoubleSide,
  PCFSoftShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  type PerspectiveCamera,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { useEditorStore } from '../../lib/editor-store'
import { prefersReducedMotion } from '../../lib/prefers-reduced-motion'

export const STUDIO_CAMERA = {
  position: [2.35, 1.52, 3.45] as const,
  target: [0, 0.78, 0] as const,
  fov: 36,
  near: 0.1,
  far: 2000,
}

export const INTRO_DURATION = 1.2
const INTRO_FROM = [3.05, 1.82, 4.25] as const

export function StudioRenderer() {
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping = ACESFilmicToneMapping
    gl.toneMappingExposure = 1.12
    gl.shadowMap.enabled = true
    gl.shadowMap.type = PCFSoftShadowMap
  }, [gl])

  return null
}

export function StudioEnvironment() {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)

  useLayoutEffect(() => {
    const generator = new PMREMGenerator(gl)
    const env = generator.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.72

    return () => {
      scene.environment = null
      env.dispose()
      generator.dispose()
    }
  }, [gl, scene])

  return null
}

export function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#f4ead4', '#1a1612', 0.28]} />
      <directionalLight
        castShadow
        color="#fff6e8"
        intensity={1.85}
        position={[2.2, 3.4, 1.6]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight color="#9bb4d0" intensity={0.38} position={[-2.4, 1.2, -1.2]} />
      <directionalLight color="#c4a15a" intensity={0.42} position={[0.2, 1.8, -2.4]} />
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
  const reducedMotion = prefersReducedMotion()
  const elapsed = useRef(reducedMotion || !intro ? INTRO_DURATION : 0)

  useLayoutEffect(() => {
    camera.near = STUDIO_CAMERA.near
    camera.far = STUDIO_CAMERA.far
    camera.fov = STUDIO_CAMERA.fov
    camera.updateProjectionMatrix()
    const seat = intro && !reducedMotion ? INTRO_FROM : STUDIO_CAMERA.position
    camera.position.set(seat[0], seat[1], seat[2])
    camera.lookAt(...STUDIO_CAMERA.target)
  }, [camera, intro, reducedMotion])

  useFrame((_, delta) => {
    if (!intro || reducedMotion || elapsed.current >= INTRO_DURATION) {
      return
    }

    elapsed.current = Math.min(INTRO_DURATION, elapsed.current + delta)
    const t = 1 - (1 - elapsed.current / INTRO_DURATION) ** 3

    camera.position.set(
      INTRO_FROM[0] + (STUDIO_CAMERA.position[0] - INTRO_FROM[0]) * t,
      INTRO_FROM[1] + (STUDIO_CAMERA.position[1] - INTRO_FROM[1]) * t,
      INTRO_FROM[2] + (STUDIO_CAMERA.position[2] - INTRO_FROM[2]) * t,
    )
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

export function StudioStage({
  children,
  picking = false,
  intro = false,
}: {
  children?: ReactNode
  picking?: boolean
  intro?: boolean
}) {
  return (
    <>
      <color attach="background" args={['#1c1814']} />
      <StudioRenderer />
      <StudioEnvironment />
      <StudioLights />
      <StudioFloor picking={picking} />
      <StudioCamera intro={intro} />
      {children}
    </>
  )
}

export function StudioOrbit({
  intro = false,
}: {
  intro?: boolean
}) {
  const [enabled, setEnabled] = useState(
    () => !intro || prefersReducedMotion(),
  )

  useEffect(() => {
    if (!intro || prefersReducedMotion()) {
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
  }, [intro])

  return (
    <OrbitControls
      enabled={enabled}
      enablePan={false}
      maxDistance={6.5}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={3.2}
      minPolarAngle={Math.PI / 4}
      target={[...STUDIO_CAMERA.target]}
    />
  )
}
