import {
  ContactShadows,
  Html,
  KeyboardControls,
  OrbitControls,
  PointerLockControls,
  useKeyboardControls,
  useProgress,
} from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react'
import { PCFShadowMap, type PerspectiveCamera } from 'three'

import { useEditorStore } from '../../lib/editor-store'
import { getLocationById, listLocations } from '../../lib/locations'
import { isTypingTarget } from '../../lib/walk-input'
import { BuildingVenue } from './BuildingVenue'
import { Garment } from './Garment'

const STUDIO_CAMERA = {
  position: [1.85, 1.15, 1.95] as const,
  target: [0, 0.72, 0] as const,
  fov: 32,
  near: 0.1,
  far: 2000,
}

const WALK_KEY_MAP = [
  { name: 'forward', keys: ['KeyW', 'w', 'W', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 's', 'S', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'a', 'A', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'd', 'D', 'ArrowRight'] },
  { name: 'up', keys: ['KeyR', 'r', 'R'] },
  { name: 'down', keys: ['KeyF', 'f', 'F'] },
  { name: 'loc1', keys: ['Digit1', '1'] },
  { name: 'loc2', keys: ['Digit2', '2'] },
  { name: 'loc3', keys: ['Digit3', '3'] },
  { name: 'loc4', keys: ['Digit4', '4'] },
  { name: 'loc5', keys: ['Digit5', '5'] },
  { name: 'loc6', keys: ['Digit6', '6'] },
]

type WalkAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'loc1'
  | 'loc2'
  | 'loc3'
  | 'loc4'
  | 'loc5'
  | 'loc6'


function FashionLoader() {
  const { errors, progress } = useProgress()

  return (
    <Html center>
      <p className="font-display text-xs tracking-[0.28em] text-ivory-muted uppercase">
        {errors.length > 0
          ? 'The look failed to load'
          : `Preparing the look ${Math.round(progress)}`}
      </p>
    </Html>
  )
}

function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#f4ead4', '#1a1612', 0.42]} />
      <directionalLight
        castShadow
        color="#fff6e8"
        intensity={1.65}
        position={[2.2, 3.4, 1.6]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight color="#9bb4d0" intensity={0.32} position={[-2.4, 1.2, -1.2]} />
      <directionalLight color="#c4a15a" intensity={0.48} position={[0.2, 1.8, -2.4]} />
    </>
  )
}

function applyLocation({
  camera,
  locationId,
}: {
  camera: PerspectiveCamera
  locationId: string
}) {
  const location = getLocationById({ id: locationId })

  if (!location) {
    return
  }

  camera.position.set(...location.position)
  camera.lookAt(...location.lookAt)
}

function StudioCameraReset() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera

  useLayoutEffect(() => {
    camera.position.set(...STUDIO_CAMERA.position)
    camera.near = STUDIO_CAMERA.near
    camera.far = STUDIO_CAMERA.far
    camera.lookAt(...STUDIO_CAMERA.target)
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

function WalkRig({
  onLock,
  onUnlock,
}: {
  onLock: () => void
  onUnlock: () => void
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const controlsRef = useRef<ComponentRef<typeof PointerLockControls>>(null)
  const [, getKeys] = useKeyboardControls<WalkAction>()
  const [subscribeKeys] = useKeyboardControls<WalkAction>()
  const locations = useMemo(() => listLocations(), [])

  useLayoutEffect(() => {
    camera.near = 1
    camera.far = 250000
    camera.updateProjectionMatrix()
    applyLocation({ camera, locationId: 'entrance' })
  }, [camera])

  useEffect(() => {
    const unsubscribers = locations.map((location, index) => {
      const action = `loc${index + 1}` as WalkAction

      return subscribeKeys(
        (state) => state[action],
        (pressed) => {
          if (!pressed) {
            return
          }

          if (!controlsRef.current?.isLocked) {
            return
          }

          if (
            isTypingTarget({
              target: document.activeElement,
            })
          ) {
            return
          }

          applyLocation({ camera, locationId: location.id })
        },
      )
    })

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
    }
  }, [camera, locations, subscribeKeys])

  useFrame((_, delta) => {
    const keys = getKeys()
    const controls = controlsRef.current
    const forwardStep = 1800 * delta
    const strafeStep = 600 * delta
    const climbStep = 1500 * delta

    if (!controls?.isLocked) {
      return
    }

    if (keys.forward) {
      controls.moveForward(forwardStep)
    }

    if (keys.backward) {
      controls.moveForward(-forwardStep)
    }

    if (keys.left) {
      controls.moveRight(-strafeStep)
    }

    if (keys.right) {
      controls.moveRight(strafeStep)
    }

    if (keys.up) {
      camera.position.y += climbStep
    }

    if (keys.down && camera.position.y > 100) {
      camera.position.y -= climbStep
    }
  })

  return (
    <PointerLockControls
      ref={controlsRef}
      selector="#walk-start"
      onLock={onLock}
      onUnlock={onUnlock}
    />
  )
}

function WalkOverlay({ locked }: { locked: boolean }) {
  return (
    <div
      className={
        locked
          ? 'pointer-events-none invisible absolute inset-0 z-10 flex items-center justify-center bg-atelier/80'
          : 'absolute inset-0 z-10 flex items-center justify-center bg-atelier/80'
      }
    >
      <div className="flex max-w-md flex-col gap-4 border border-atelier-line bg-atelier-raised p-6">
        <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
          Walk the atelier
        </p>
        <p className="text-sm leading-relaxed text-ivory-muted">
          WASD or arrows to move. R and F raise and lower. Keys 1 to 6 jump to
          rooms. Esc returns your cursor. Your look stays on the gown.
        </p>
        <button
          id="walk-start"
          type="button"
          className="border border-brass px-4 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase"
        >
          Start walking
        </button>
      </div>
    </div>
  )
}

function AtelierCanvas({
  children,
  isWalk,
  onLock,
  onUnlock,
}: {
  children?: ReactNode
  isWalk: boolean
  onLock: () => void
  onUnlock: () => void
}) {
  return (
    <Canvas
      shadows={!isWalk}
      camera={{
        position: [...STUDIO_CAMERA.position],
        fov: STUDIO_CAMERA.fov,
        near: STUDIO_CAMERA.near,
        far: STUDIO_CAMERA.far,
      }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = PCFShadowMap
      }}
      className="h-full min-h-80 w-full bg-atelier"
    >
      <color attach="background" args={['#1f1a14']} />
      {isWalk ? null : <StudioLights />}
      {isWalk ? null : (
        <mesh
          position={[0, 0, 0]}
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation()

            if (useEditorStore.getState().mode !== 'design') {
              return
            }

            useEditorStore.getState().selectMesh({ selectedMeshName: null })
          }}
        >
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#241f19" metalness={0} roughness={0.92} />
        </mesh>
      )}
      <Suspense fallback={<FashionLoader />}>
        <Garment src="/models/garment.glb" />
        {children}
      </Suspense>
      <Suspense fallback={isWalk ? <FashionLoader /> : null}>
        <BuildingVenue enabled={isWalk} />
      </Suspense>
      {isWalk ? null : (
        <ContactShadows
          blur={2.6}
          far={4}
          opacity={0.42}
          position={[0, 0.01, 0]}
          scale={6}
        />
      )}
      {isWalk ? (
        <WalkRig onLock={onLock} onUnlock={onUnlock} />
      ) : (
        <>
          <StudioCameraReset />
          <OrbitControls
            enablePan={false}
            maxDistance={4.2}
            maxPolarAngle={Math.PI / 2.05}
            minDistance={1.5}
            minPolarAngle={Math.PI / 4}
            target={[0, 0.72, 0]}
          />
        </>
      )}
    </Canvas>
  )
}

export function AtelierScene({ children }: { children?: ReactNode }) {
  const mode = useEditorStore((state) => state.mode)
  const isWalk = mode === 'atelier'
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (!isWalk) {
      setLocked(false)
    }
  }, [isWalk])

  return (
    <div className="relative h-full min-h-80 w-full">
      {isWalk ? <WalkOverlay locked={locked} /> : null}
      <KeyboardControls map={WALK_KEY_MAP}>
        <AtelierCanvas
          isWalk={isWalk}
          onLock={() => {
            setLocked(true)
          }}
          onUnlock={() => {
            setLocked(false)
          }}
        >
          {children}
        </AtelierCanvas>
      </KeyboardControls>
    </div>
  )
}
