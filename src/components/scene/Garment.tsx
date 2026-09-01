import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from 'three'

import {
  applyLiveOverrides,
  captureMeshMaterials,
  cloneObjectMaterials,
  listMeshes,
  stampAncestorNames,
} from '../../lib/apply-overrides'
import type { GarmentId, MaterialOverride } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { garmentSrc } from '../../lib/garment-parts'
import { SelectableMesh } from './SelectableMesh'

const DRACO_DECODER_PATH = '/draco/'
const DEFAULT_GARMENT_SRC = garmentSrc({ garmentId: 'gown' })

const FABRIC_MAP_SRC = {
  'cotton-weave': '/fabrics/cotton-weave.png',
  'silk-shine': '/fabrics/silk-shine.png',
  'wool-nap': '/fabrics/wool-nap.png',
  'denim-twill': '/fabrics/denim-twill.png',
  'leather-grain': '/fabrics/leather-grain.png',
} as const

useGLTF.setDecoderPath(DRACO_DECODER_PATH)
useGLTF.preload(DEFAULT_GARMENT_SRC)

type DetachedNode = {
  object: Object3D
  children: DetachedNode[]
}

function detachChildren({ object }: { object: Object3D }): DetachedNode {
  const children = [...object.children]

  for (const child of children) {
    object.remove(child)
  }

  return {
    object,
    children: children.map((child) => detachChildren({ object: child })),
  }
}

function GarmentNode({
  node,
  picking,
}: {
  node: DetachedNode
  picking: boolean
}) {
  if (node.object instanceof Mesh) {
    return (
      <SelectableMesh
        name={node.object.name}
        mesh={node.object}
        picking={picking}
      >
        {node.children.map((child) => (
          <GarmentNode
            key={child.object.uuid}
            node={child}
            picking={picking}
          />
        ))}
      </SelectableMesh>
    )
  }

  return (
    <primitive object={node.object}>
      {node.children.map((child) => (
        <GarmentNode key={child.object.uuid} node={child} picking={picking} />
      ))}
    </primitive>
  )
}

function lerpMaterials({
  meshes,
  amount,
}: {
  meshes: Mesh[]
  amount: number
}) {
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]

    for (const material of materials) {
      if (
        !(material instanceof MeshStandardMaterial) &&
        !(material instanceof MeshPhysicalMaterial)
      ) {
        continue
      }

      const target = material.userData.targetColor as Color | undefined

      if (target) {
        material.color.lerp(target, amount)
      }

      if (typeof material.userData.targetRoughness === 'number') {
        material.roughness +=
          (material.userData.targetRoughness - material.roughness) * amount
      }
    }
  }
}

export function Garment({
  src,
  garmentId,
  overrides: overridesProp,
  picking = true,
}: {
  src?: string
  garmentId?: GarmentId | null
  overrides?: MaterialOverride[]
  picking?: boolean
}) {
  const resolvedSrc = src ?? garmentSrc({ garmentId })
  const { scene } = useGLTF(resolvedSrc)
  const storeOverrides = useEditorStore((state) => state.overrides)
  const overrides = overridesProp ?? storeOverrides
  const loadedMaps = useTexture(FABRIC_MAP_SRC)
  const lerpClock = useRef(1)

  const { tree, meshes, baseMaterials } = useMemo(() => {
    const root = scene.clone(true)
    cloneObjectMaterials({ root })
    stampAncestorNames({ root })
    const baseMaterials = captureMeshMaterials({ root })
    const meshes = listMeshes({ root })
    const tree = detachChildren({ object: root })

    return { tree, meshes, baseMaterials }
  }, [scene])

  useLayoutEffect(() => {
    for (const texture of Object.values(loadedMaps)) {
      texture.colorSpace = SRGBColorSpace
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
    }
  }, [loadedMaps])

  useLayoutEffect(() => {
    applyLiveOverrides({
      meshes,
      baseMaterials,
      overrides,
      maps: loadedMaps as Record<string, Texture>,
      animate: picking,
    })

    lerpClock.current = picking ? 0 : 1
  }, [baseMaterials, loadedMaps, meshes, overrides, picking])

  useFrame((_, delta) => {
    if (!picking || lerpClock.current >= 1) {
      return
    }

    lerpClock.current = Math.min(1, lerpClock.current + delta / 0.4)
    lerpMaterials({ meshes, amount: 0.18 + lerpClock.current * 0.35 })
  })

  return <GarmentNode node={tree} picking={picking} />
}
