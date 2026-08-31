import { useGLTF, useTexture } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import { Color, Mesh, MeshStandardMaterial, MirroredRepeatWrapping, type Object3D } from 'three'

import { cloneObjectMaterials } from '../../lib/apply-overrides'

const BUILDING_SRC = '/models/informatics_5_4.glb'
const TREE_SRC = '/models/tree_tut2.glb'
const GRASS_SRC = '/images/grass.jpg'
const TREE_XS = [4400, 2700, 1000, -700, -2400, -4100] as const

function isGlassName({ name }: { name: string }) {
  return name.split('_')[0] === 'glass'
}

function applyGlassToMesh({ mesh }: { mesh: Mesh }) {
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((material) => {
      if (!(material instanceof MeshStandardMaterial)) {
        return material
      }

      const glassMaterial = material.clone()
      glassMaterial.transparent = true
      glassMaterial.opacity = 0.2
      glassMaterial.color = new Color(240 / 255, 248 / 255, 255 / 255)
      return glassMaterial
    })
    return
  }

  if (!(mesh.material instanceof MeshStandardMaterial)) {
    return
  }

  const glassMaterial = mesh.material.clone()
  glassMaterial.transparent = true
  glassMaterial.opacity = 0.2
  glassMaterial.color = new Color(240 / 255, 248 / 255, 255 / 255)
  mesh.material = glassMaterial
}

function applyGlassPass({ root }: { root: Object3D }) {
  root.traverse((node) => {
    if (node instanceof Mesh && isGlassName({ name: node.name })) {
      applyGlassToMesh({ mesh: node })
      return
    }

    if (node instanceof Mesh || !isGlassName({ name: node.name })) {
      return
    }

    const pane = node.children[1]

    if (pane instanceof Mesh) {
      applyGlassToMesh({ mesh: pane })
    }
  })
}

function BuildingModel() {
  const { scene } = useGLTF(BUILDING_SRC)
  const cloned = useMemo(() => {
    const root = scene.clone(true)
    cloneObjectMaterials({ root })
    applyGlassPass({ root })
    return root
  }, [scene])

  return <primitive object={cloned} />
}

function VenueTrees() {
  const { scene } = useGLTF(TREE_SRC)
  const trees = useMemo(
    () =>
      TREE_XS.map((x) => ({
        x,
        object: scene.clone(true),
      })),
    [scene],
  )

  return (
    <>
      {trees.map(({ x, object }) => (
        <primitive
          key={x}
          object={object}
          position={[x, 0, -4500]}
          scale={[15, 15, 10]}
        />
      ))}
    </>
  )
}

function VenueGround() {
  const texture = useTexture(GRASS_SRC)

  useLayoutEffect(() => {
    texture.wrapS = MirroredRepeatWrapping
    texture.wrapT = MirroredRepeatWrapping
    texture.repeat.set(20, 20)
    texture.needsUpdate = true
  }, [texture])

  return (
    <mesh position={[0, -100, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[200000, 200000]} />
      <meshLambertMaterial map={texture} />
    </mesh>
  )
}

function VenueLights() {
  return <hemisphereLight args={[0xc9cbca, 0xffffff, 1]} />
}

function BuildingVenueReady() {
  return (
    <group name="building-venue">
      <VenueLights />
      <VenueGround />
      <BuildingModel />
      <VenueTrees />
    </group>
  )
}

export function BuildingVenue({ enabled = false }: { enabled?: boolean }) {
  if (!enabled) {
    return null
  }

  return <BuildingVenueReady />
}
