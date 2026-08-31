import {
  Html,
  KeyboardControls,
  PointerLockControls,
  useKeyboardControls,
  useProgress,
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react'
import type { PerspectiveCamera } from 'three'

import { listDesigns } from '../../lib/designs-api'
import type { Design } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { getLocationById, listLocations } from '../../lib/locations'
import { rankDesigns } from '../../lib/rank-designs'
import { isTypingTarget } from '../../lib/walk-input'
import { Garment } from './Garment'
import { prefersReducedMotion } from '../../lib/prefers-reduced-motion'
import { STUDIO_CAMERA, StudioOrbit, StudioStage } from './StudioStage'

const BuildingVenue = lazy(async () => {
  const module = await import('./BuildingVenue')
  return { default: module.BuildingVenue }
})

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

const PEDESTAL_POSITION = [-80, 0, -2680] as const
const CINEMATIC_CAMERA = {
  position: [-80, 90, -2500] as const,
  target: [-80, 55, -2680] as const,
}
const CINEMATIC_DOLLY = [-80, 82, -2540] as const

function LeaderPedestal() {
  const [leader, setLeader] = useState<Design | null>(null)

  useEffect(() => {
    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (!cancelled) {
          setLeader(rankDesigns({ designs })[0] ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeader(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!leader) {
    return null
  }

  return (
    <group name="leader-pedestal" position={[...PEDESTAL_POSITION]} scale={70}>
      <pointLight
        color="#fff6e8"
        intensity={2.2}
        position={[0.4, 2.4, 0.8]}
        distance={14}
      />
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.14, 24]} />
        <meshStandardMaterial color="#241f19" metalness={0.08} roughness={0.86} />
      </mesh>
      <Garment
        garmentId={leader.garmentId}
        overrides={leader.overrides}
        picking={false}
      />
    </group>
  )
}

function FashionLoader() {
  const { errors, progress } = useProgress()

  return (
    <Html center>
      <p className="font-display text-xs tracking-[0.28em] text-ivory-muted uppercase">
        {errors.length > 0
          ? 'The look could not open'
          : `Opening the look ${Math.round(progress)}`}
      </p>
    </Html>
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

function WalkRig({
  onLock,
  onUnlock,
  roomsOpen,
}: {
  onLock: () => void
  onUnlock: () => void
  roomsOpen: boolean
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
    camera.position.set(...CINEMATIC_CAMERA.position)
    camera.lookAt(...CINEMATIC_CAMERA.target)
  }, [camera])

  useEffect(() => {
    const unsubscribers = locations.map((location, index) => {
      const action = `loc${index + 1}` as WalkAction

      return subscribeKeys(
        (state) => state[action],
        (pressed) => {
          if (!pressed || !roomsOpen || !controlsRef.current?.isLocked) {
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
  }, [camera, locations, roomsOpen, subscribeKeys])

  useFrame((_, delta) => {
    if (!roomsOpen) {
      const ease = Math.min(1, delta * 0.35)
      camera.position.x += (CINEMATIC_DOLLY[0] - camera.position.x) * ease
      camera.position.y += (CINEMATIC_DOLLY[1] - camera.position.y) * ease
      camera.position.z += (CINEMATIC_DOLLY[2] - camera.position.z) * ease
      camera.lookAt(...CINEMATIC_CAMERA.target)
      return
    }

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

  if (!roomsOpen) {
    return null
  }

  return (
    <PointerLockControls
      ref={controlsRef}
      selector="#walk-start"
      onLock={onLock}
      onUnlock={onUnlock}
    />
  )
}

function WalkEnterFade() {
  const [ready, setReady] = useState(prefersReducedMotion)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReady(true)
      return
    }

    const timer = window.setTimeout(() => {
      setReady(true)
    }, 40)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className={
        ready
          ? 'pointer-events-none absolute inset-0 z-20 bg-atelier opacity-0 transition-opacity duration-700'
          : 'pointer-events-none absolute inset-0 z-20 bg-atelier opacity-100 transition-opacity duration-700'
      }
    />
  )
}

function HouseOverlay({
  locked,
  roomsOpen,
  leaderTitle,
  onOpenRooms,
}: {
  locked: boolean
  roomsOpen: boolean
  leaderTitle: string
  onOpenRooms: () => void
}) {
  if (locked) {
    return null
  }

  if (!roomsOpen) {
    return (
      <div className="absolute inset-0 z-10 flex items-end bg-gradient-to-t from-atelier via-atelier/20 to-transparent">
        <div className="flex w-full flex-col gap-3 p-6">
          <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
            The Leader
          </p>
          <p className="font-display text-3xl text-ivory">{leaderTitle}</p>
          <button
            type="button"
            onClick={onOpenRooms}
            className="w-fit border border-atelier-line px-4 py-2 font-display text-xs tracking-[0.18em] text-ivory-muted uppercase hover:text-brass"
          >
            Walk the rooms
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-atelier/80">
      <div className="flex max-w-md flex-col gap-4 border border-atelier-line bg-atelier-raised p-6">
        <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
          The house
        </p>
        <p className="text-sm leading-relaxed text-ivory-muted">
          Move with WASD. R and F raise and lower. Keys 1 to 6 jump the rooms.
          Esc returns the cursor.
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
  roomsOpen,
  onLock,
  onUnlock,
}: {
  children?: ReactNode
  isWalk: boolean
  roomsOpen: boolean
  onLock: () => void
  onUnlock: () => void
}) {
  const garmentId = useEditorStore((state) => state.garmentId)

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
      className="h-full min-h-80 w-full bg-atelier"
    >
      {isWalk ? (
        <>
          <color attach="background" args={['#12100d']} />
          <Suspense fallback={<FashionLoader />}>
            <LeaderPedestal />
          </Suspense>
          <Suspense fallback={null}>
            <BuildingVenue enabled />
          </Suspense>
          <WalkRig
            roomsOpen={roomsOpen}
            onLock={onLock}
            onUnlock={onUnlock}
          />
        </>
      ) : (
        <>
          <StudioStage picking intro>
            <Suspense fallback={<FashionLoader />}>
              <Garment garmentId={garmentId} />
              {children}
            </Suspense>
          </StudioStage>
          <StudioOrbit intro />
        </>
      )}
    </Canvas>
  )
}

export function AtelierScene({ children }: { children?: ReactNode }) {
  const mode = useEditorStore((state) => state.mode)
  const isWalk = mode === 'atelier'
  const [locked, setLocked] = useState(false)
  const [roomsOpen, setRoomsOpen] = useState(false)
  const [leaderTitle, setLeaderTitle] = useState('The Leader')

  useEffect(() => {
    if (!isWalk) {
      setLocked(false)
      setRoomsOpen(false)
    }
  }, [isWalk])

  useEffect(() => {
    if (!isWalk) {
      return
    }

    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (!cancelled) {
          setLeaderTitle(
            rankDesigns({ designs })[0]?.title ?? 'The Leader',
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderTitle('The Leader')
        }
      })

    return () => {
      cancelled = true
    }
  }, [isWalk])

  return (
    <div className="relative h-full min-h-80 w-full">
      {isWalk ? (
        <>
          <WalkEnterFade />
          <HouseOverlay
            locked={locked}
            roomsOpen={roomsOpen}
            leaderTitle={leaderTitle}
            onOpenRooms={() => {
              setRoomsOpen(true)
            }}
          />
        </>
      ) : null}
      <KeyboardControls map={WALK_KEY_MAP}>
        <AtelierCanvas
          isWalk={isWalk}
          roomsOpen={roomsOpen}
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
