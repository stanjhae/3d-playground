import { ContactShadows, Html, OrbitControls, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, type ReactNode } from 'react'
import { PCFShadowMap } from 'three'

import { Garment } from './Garment'

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

export function AtelierScene({ children }: { children?: ReactNode }) {
  return (
    <Canvas
      shadows
      camera={{ position: [1.85, 1.15, 1.95], fov: 32 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = PCFShadowMap
      }}
      className="h-full min-h-80 w-full bg-atelier"
    >
      <color attach="background" args={['#1f1a14']} />
      <StudioLights />
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#241f19" metalness={0} roughness={0.92} />
      </mesh>
      <Suspense fallback={<FashionLoader />}>
        <Garment src="/models/garment.glb" />
        {children}
      </Suspense>
      <ContactShadows
        blur={2.6}
        far={4}
        opacity={0.42}
        position={[0, 0.01, 0]}
        scale={6}
      />
      <OrbitControls
        enablePan={false}
        maxDistance={4.2}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1.5}
        minPolarAngle={Math.PI / 4}
        target={[0, 0.72, 0]}
      />
    </Canvas>
  )
}
