import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
import { CONCEPT_FEATURES } from '../../lib/concept-flags'
import type { GarmentId, MaterialOverride } from '../../lib/design-schema'
import { resolveGarmentId } from '../../lib/design-schema'
import { getCanonicalDocument, liveStrokeLayerId, useEditorStore } from '../../lib/editor-store'
import { garmentSrc } from '../../lib/garment-parts'
import { applyLayerEdit } from '../../lib/layer-hit'
import { useLayerImageLoad } from '../../lib/layer-images'
import { ATLAS_COMPILER_VERSION, artworkState, useAtlasBuild } from '../../lib/atlas-status'
import { rasterizeLayers } from '../../lib/paint-atlas'
import { useTextFacesVersion } from '../../lib/text-faces'
import { clothNormalMap } from '../../lib/fabric-normal'
import { createClothingMesh } from '../../lib/tee-geometry'
import { ClothingPoseContext } from './clothing-pose'
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

// The alpha's only garment is the tee, so the gown's 900 KB waits until asked for.
if (CONCEPT_FEATURES) {
  useGLTF.preload(DEFAULT_GARMENT_SRC)
}

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
  structural,
  document: documentProp,
}: {
  garmentId?: GarmentId | null
  overrides: MaterialOverride[]
  picking: boolean
  artMap?: string
  structural?: DesignDocument['structural']
  document?: DesignDocument
}) {
  const storeDocument = useEditorStore((state) => state.document)

  return useMemo(() => {
    if (documentProp) {
      return documentProp
    }

    if (artMap || structural) {
      return documentFromDesign({
        design: {
          garmentId: garmentId ?? undefined,
          overrides,
          artMap,
          structural,
        },
      })
    }

    return picking
      ? storeDocument
      : createEmptyDocument({ garmentId })
  }, [
    artMap,
    documentProp,
    garmentId,
    overrides,
    picking,
    storeDocument,
    structural,
  ])
}

export function Garment({
  src,
  garmentId,
  overrides: overridesProp,
  picking = true,
  artMap,
  structural,
  document: documentProp,
}: {
  src?: string
  garmentId?: GarmentId | null
  overrides?: MaterialOverride[]
  picking?: boolean
  artMap?: string
  structural?: DesignDocument['structural']
  document?: DesignDocument
}) {
  const storeOverrides = useEditorStore((state) => state.overrides)
  const overrides = overridesProp ?? storeOverrides
  const inkDocument = useInkDocument({
    garmentId,
    overrides,
    picking,
    artMap,
    structural,
    document: documentProp,
  })
  const resolvedId = resolveGarmentId({ garmentId })

  if (resolvedId === 'tee') {
    return (
      <HouseFormGarment
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

function HouseFormGarment({
  inkDocument,
  overrides,
  picking,
}: {
  inkDocument: DesignDocument
  overrides: MaterialOverride[]
  picking: boolean
}) {
  const pose = useContext(ClothingPoseContext)
  const scene = useMemo(() => {
    return createClothingMesh({
      neck: inkDocument.structural.neck ?? 'crew',
      hem: inkDocument.structural.hem ?? 'long',
      sleeve: inkDocument.structural.sleeve ?? 'short',
      pose,
    })
  }, [
    inkDocument.structural.hem,
    inkDocument.structural.neck,
    inkDocument.structural.sleeve,
    pose,
  ])

  return (
    <SeatedForm
      scene={scene}
      inkDocument={inkDocument}
      overrides={overrides}
      picking={picking}
      clothDetail
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
  clothDetail = false,
}: {
  scene: Object3D
  inkDocument: DesignDocument
  overrides: MaterialOverride[]
  picking: boolean
  clothDetail?: boolean
}) {
  const activeStroke = useEditorStore((state) => state.activeStroke)
  const activeLayerEdit = useEditorStore((state) => state.activeLayerEdit)
  const loadedMaps = useTexture(FABRIC_MAP_SRC)
  const lerpClock = useRef(1)
  // On-demand rendering: each change below asks for a frame.
  const invalidate = useThree((state) => state.invalidate)
  const atlasRef = useRef<CanvasTexture | null>(null)
  const { images: layerImages, settled: imagesSettled } = useLayerImageLoad({ document: inkDocument })
  const textFaces = useTextFacesVersion()

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

    // After the overrides, which can swap a mesh's material for a new one.
    if (clothDetail) {
      for (const mesh of meshes) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material instanceof MeshStandardMaterial && !material.normalMap) {
            material.normalMap = clothNormalMap()
            material.needsUpdate = true
          }
        }
      }
    }

    lerpClock.current = picking ? 0 : 1
    invalidate()
  }, [baseMaterials, clothDetail, invalidate, loadedMaps, meshes, overrides, picking])

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
      document: applyLayerEdit({
        document: inkDocument,
        edit: picking ? activeLayerEdit : null,
      }),
      extraStroke: picking ? activeStroke : null,
      extraStrokeLayerId: picking ? liveStrokeLayerId({ stroke: activeStroke }) : undefined,
      images: layerImages,
      // Words wait for their face here; the 2D panel shows them meanwhile.
      pendingText: 'skip',
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
    invalidate()

    // Only the studio's own document has a revision to be current for.
    const editor = useEditorStore.getState()

    if (inkDocument === editor.document) {
      useAtlasBuild.setState({
        build: {
          document: inkDocument,
          revision: editor.revision,
          templateVersion: getCanonicalDocument().template.version,
          compilerVersion: ATLAS_COMPILER_VERSION,
          state: artworkState({ document: inkDocument, images: layerImages, imagesSettled }),
        },
      })
    }
  }, [activeLayerEdit, activeStroke, imagesSettled, inkDocument, invalidate, layerImages, meshes, picking, textFaces])

  // Nothing is on screen to be current once this form goes.
  useEffect(() => () => useAtlasBuild.setState({ build: null }), [])

  // Switching garments otherwise leaves these on the GPU.
  useEffect(
    () => () => {
      atlasRef.current?.dispose()
      atlasRef.current = null

      for (const mesh of meshes) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.dispose()
        }
      }
    },
    [meshes],
  )

  useFrame((_, delta) => {
    if (!picking || lerpClock.current >= 1) {
      return
    }

    lerpClock.current = Math.min(1, lerpClock.current + delta / 0.4)
    // Finish exactly on the target: with few frames (a background tab, or
    // a capture right after a change) the partial blends alone stop short,
    // leaving the garment near its old colour.
    lerpMaterials({
      meshes,
      amount: lerpClock.current >= 1 ? 1 : 0.18 + lerpClock.current * 0.35,
    })

    if (lerpClock.current < 1) {
      invalidate()
    }
  })

  return <GarmentNode node={tree} picking={picking} />
}
