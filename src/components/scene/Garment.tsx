import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from 'three'

import { bindInkMap } from '../../lib/apply-ink'
import {
  applyLiveOverrides,
  captureMeshMaterials,
  cloneObjectMaterials,
  listMeshes,
  stampAncestorNames,
} from '../../lib/apply-overrides'
import {
  createEmptyDocument,
  documentFromDesign,
  documentHasInk,
  type DesignDocument,
} from '../../lib/design-document'
import type { GarmentId, MaterialOverride } from '../../lib/design-schema'
import { resolveGarmentId } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { garmentSrc } from '../../lib/garment-parts'
import { useLayerImages } from '../../lib/layer-images'
import { rasterizeLayers } from '../../lib/paint-atlas'
import { createTeeMesh } from '../../lib/tee-geometry'
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

function useInkDocument({
  garmentId,
  overrides,
  picking,
  artMap,
  document: documentProp,
}: {
  garmentId?: GarmentId | null
  overrides: MaterialOverride[]
  picking: boolean
  artMap?: string
  document?: DesignDocument
}) {
  const storeDocument = useEditorStore((state) => state.document)

  return useMemo(() => {
    if (documentProp) {
      return documentProp
    }

    if (artMap) {
      return documentFromDesign({
        design: {
          garmentId: garmentId ?? undefined,
          overrides,
          artMap,
        },
      })
    }

    return picking
      ? storeDocument
      : createEmptyDocument({ garmentId })
  }, [artMap, documentProp, garmentId, overrides, picking, storeDocument])
}

export function Garment({
  src,
  garmentId,
  overrides: overridesProp,
  picking = true,
  artMap,
  document: documentProp,
}: {
  src?: string
  garmentId?: GarmentId | null
  overrides?: MaterialOverride[]
  picking?: boolean
  artMap?: string
  document?: DesignDocument
}) {
  const storeOverrides = useEditorStore((state) => state.overrides)
  const overrides = overridesProp ?? storeOverrides
  const inkDocument = useInkDocument({
    garmentId,
    overrides,
    picking,
    artMap,
    document: documentProp,
  })
  const resolvedId = resolveGarmentId({ garmentId })

  if (resolvedId === 'tee') {
    return (
      <TeeGarment
        inkDocument={inkDocument}
        overrides={overrides}
        picking={picking}
      />
    )
  }

  return (
    <GltfGarment
      src={
        src ??
        garmentSrc({
          garmentId,
          structural: inkDocument.structural,
        })
      }
      inkDocument={inkDocument}
      overrides={overrides}
      picking={picking}
    />
  )
}

function TeeGarment({
  inkDocument,
  overrides,
  picking,
}: {
  inkDocument: DesignDocument
  overrides: MaterialOverride[]
  picking: boolean
}) {
  const scene = useMemo(() => {
    const mesh = createTeeMesh({
      neck: inkDocument.structural.neck ?? 'crew',
    })
    return mesh
  }, [inkDocument.structural.neck])

  return (
    <SeatedForm
      scene={scene}
      inkDocument={inkDocument}
      overrides={overrides}
      picking={picking}
    />
  )
}

function GltfGarment({
  src,
  inkDocument,
  overrides,
  picking,
}: {
  src: string
  inkDocument: DesignDocument
  overrides: MaterialOverride[]
  picking: boolean
}) {
  const { scene } = useGLTF(src)

  return (
    <SeatedForm
      scene={scene}
      inkDocument={inkDocument}
      overrides={overrides}
      picking={picking}
    />
  )
}

function SeatedForm({
  scene,
  inkDocument,
  overrides,
  picking,
}: {
  scene: Object3D
  inkDocument: DesignDocument
  overrides: MaterialOverride[]
  picking: boolean
}) {
  const activeStroke = useEditorStore((state) => state.activeStroke)
  const loadedMaps = useTexture(FABRIC_MAP_SRC)
  const lerpClock = useRef(1)
  const atlasRef = useRef<CanvasTexture | null>(null)
  const layerImages = useLayerImages({ document: inkDocument })

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

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    if (!atlasRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      atlasRef.current = texture
    }

    const texture = atlasRef.current
    const buffer = rasterizeLayers({
      document: inkDocument,
      extraStroke: picking ? activeStroke : null,
      images: layerImages,
    })
    const canvas = texture.image as HTMLCanvasElement
    canvas.width = buffer.width
    canvas.height = buffer.height
    canvas.getContext('2d')?.putImageData(
      new ImageData(
        new Uint8ClampedArray(buffer.pixels),
        buffer.width,
        buffer.height,
      ),
      0,
      0,
    )
    texture.needsUpdate = true

    const hasInk =
      documentHasInk({ document: inkDocument }) || Boolean(picking && activeStroke)

    bindInkMap({
      meshes,
      inkMap: hasInk ? texture : null,
    })
  }, [activeStroke, inkDocument, layerImages, meshes, picking])

  useFrame((_, delta) => {
    if (!picking || lerpClock.current >= 1) {
      return
    }

    lerpClock.current = Math.min(1, lerpClock.current + delta / 0.4)
    lerpMaterials({ meshes, amount: 0.18 + lerpClock.current * 0.35 })
  })

  return <GarmentNode node={tree} picking={picking} />
}
