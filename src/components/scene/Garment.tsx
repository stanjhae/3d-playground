import { useGLTF, useTexture } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import {
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from 'three'

import {
  applyOverridesFromBases,
  captureMeshMaterials,
  cloneObjectMaterials,
  listMeshes,
} from '../../lib/apply-overrides'
import { useEditorStore } from '../../lib/editor-store'
import { SelectableMesh } from './SelectableMesh'

const DRACO_DECODER_PATH = '/draco/'
const DEFAULT_GARMENT_SRC = '/models/garment.glb'

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

function GarmentNode({ node }: { node: DetachedNode }) {
  if (node.object instanceof Mesh) {
    return (
      <SelectableMesh name={node.object.name} mesh={node.object}>
        {node.children.map((child) => (
          <GarmentNode key={child.object.uuid} node={child} />
        ))}
      </SelectableMesh>
    )
  }

  return (
    <primitive object={node.object}>
      {node.children.map((child) => (
        <GarmentNode key={child.object.uuid} node={child} />
      ))}
    </primitive>
  )
}

export function Garment({ src = DEFAULT_GARMENT_SRC }: { src?: string }) {
  const { scene } = useGLTF(src)
  const overrides = useEditorStore((state) => state.overrides)
  const loadedMaps = useTexture(FABRIC_MAP_SRC)

  const { tree, meshes, baseMaterials } = useMemo(() => {
    const root = scene.clone(true)
    cloneObjectMaterials({ root })
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
      texture.repeat.set(3, 3)
    }
  }, [loadedMaps])

  useLayoutEffect(() => {
    applyOverridesFromBases({
      meshes,
      baseMaterials,
      overrides,
      maps: loadedMaps as Record<string, Texture>,
    })
  }, [baseMaterials, loadedMaps, meshes, overrides])

  return <GarmentNode node={tree} />
}
