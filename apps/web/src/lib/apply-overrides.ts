import {
  Color,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type Object3D,
  type Texture,
} from 'three'

import type { MaterialOverride } from './design-schema'
import { detailNormalMap, resolveDetail, type SurfaceChoice } from './fabric-detail'
import { getFabricForOverride } from './fabrics'
import { overrideMatchesMesh } from './mesh-match'

function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh
}

function collectAncestorNames({ node }: { node: Object3D }) {
  const names: string[] = []
  let current = node.parent

  while (current) {
    if (current.name) {
      names.push(current.name)
    }

    current = current.parent
  }

  return names
}

function ancestorNamesFor({ node }: { node: Object3D }) {
  const stamped = node.userData.ancestorNames

  if (Array.isArray(stamped) && stamped.every((name) => typeof name === 'string')) {
    return stamped as string[]
  }

  return collectAncestorNames({ node })
}

export function stampAncestorNames({ root }: { root: Object3D }) {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.userData.ancestorNames = collectAncestorNames({ node })
    }
  })

  return root
}

export function sealClothMaterial<T extends Material>({
  material,
}: {
  material: T
}) {
  if (!(material instanceof MeshStandardMaterial)) {
    return material
  }

  material.transparent = false
  material.opacity = 1
  material.depthWrite = true

  return material
}

/** The colour a seated model's cloth starts as once its baked texture is gone: its template's (#ffffff for every GLB). */
export const NEUTRAL_CLOTH_COLOR = '#ffffff'

/** A seated model's metal or plastic parts (`scripts/ingest-garment.py` names them). */
function isHardware({ node }: { node: Object3D }) {
  return /^hardware(-\d+)?$/.test(node.name)
}

/**
 * Takes the baked colour texture off a seated model's cloth (tester pass 3).
 * Downloaded models carry their original look as a colour map: the hoodie's
 * is green with a white hood and a Style3D logo on the body, the slip's,
 * coat's and tailored suit's are black, the shirt & skirt's skirt is black.
 * Three.js multiplies the garment colour into that map, so the 3D showed the
 * map (or a darkened mix) while the flat panels showed the chosen colour.
 * Without it the cloth is exactly the garment colour, everywhere, as the
 * flat panels draw it; its relief (normal map) and finish stay. Hardware
 * keeps its own look. Every cloth mesh that had a map is marked
 * `bakedCloth`, so the garment colour (the `body` override) reaches all of
 * it, the shirt & skirt's `skirt` pieces included.
 */
export function neutraliseBakedCloth({ root, color = NEUTRAL_CLOTH_COLOR }: { root: Object3D; color?: string }) {
  root.traverse((node) => {
    if (!isMesh(node) || isHardware({ node })) {
      return
    }

    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof MeshStandardMaterial) || !material.map) {
        continue
      }

      material.map = null
      material.color.set(color)
      material.needsUpdate = true
      node.userData.bakedCloth = true
    }
  })

  return root
}

function cloneMaterialEntry({ material }: { material: Material }) {
  if (material instanceof MeshStandardMaterial) {
    return sealClothMaterial({ material: material.clone() })
  }

  return material
}

export function cloneObjectMaterials({ root }: { root: Object3D }) {
  root.traverse((node) => {
    if (!isMesh(node)) {
      return
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) =>
        cloneMaterialEntry({ material }),
      )
      return
    }

    node.material = cloneMaterialEntry({ material: node.material })
  })

  return root
}

function toPhysicalMaterial({
  material,
}: {
  material: MeshStandardMaterial
}) {
  if (material instanceof MeshPhysicalMaterial) {
    return sealClothMaterial({ material: material.clone() })
  }

  const next = new MeshPhysicalMaterial({
    color: material.color.clone(),
    map: material.map,
    metalness: material.metalness,
    opacity: 1,
    roughness: material.roughness,
    side: material.side,
    transparent: false,
    depthWrite: true,
  })
  next.userData = { ...material.userData }
  return sealClothMaterial({ material: next })
}

function cloneFabricMap({
  map,
  repeat,
}: {
  map: Texture
  repeat: number
}) {
  const cloned = map.clone()
  cloned.colorSpace = SRGBColorSpace
  cloned.wrapS = RepeatWrapping
  cloned.wrapT = RepeatWrapping
  cloned.repeat.set(repeat, repeat)
  cloned.needsUpdate = true
  return cloned
}

function applyOverrideToMaterial({
  material,
  override,
  map,
  surface,
}: {
  material: MeshStandardMaterial
  override: MaterialOverride
  map?: Texture
  surface?: SurfaceChoice
}) {
  const nextMaterial = toPhysicalMaterial({ material })
  const fabric = getFabricForOverride({
    mapId: override.mapId,
    color: override.color,
  })

  if (override.color !== undefined) {
    nextMaterial.color.set(override.color)
  }

  if (override.roughness !== undefined) {
    nextMaterial.roughness = override.roughness
  }

  if (override.metalness !== undefined) {
    nextMaterial.metalness = override.metalness
  }

  if (override.mapId !== undefined) {
    nextMaterial.userData.mapId = override.mapId
  }

  // The override's own surface wins (a canonical `base.fabric`, written by
  // the projection); older overrides name only a texture, so the preset is
  // found from it.
  const sheen = override.sheen ?? fabric?.sheen
  const clearcoat = override.clearcoat ?? fabric?.clearcoat
  const opacity = override.opacity ?? fabric?.opacity

  if (sheen !== undefined) {
    nextMaterial.sheen = sheen
    nextMaterial.sheenRoughness = override.sheenRoughness ?? fabric?.sheenRoughness ?? 0.3
    nextMaterial.sheenColor = new Color(override.sheenColor ?? fabric?.sheenColor ?? '#ffffff')
  } else {
    nextMaterial.sheen = 0
  }

  if (clearcoat !== undefined) {
    nextMaterial.clearcoat = clearcoat
    nextMaterial.clearcoatRoughness = override.clearcoatRoughness ?? fabric?.clearcoatRoughness ?? 0.4
  } else {
    nextMaterial.clearcoat = 0
  }

  // A chosen fabric brings its own relief, or none: a model's own normal map
  // or an earlier fabric's never shows through it. A colour alone leaves the
  // surface to the model.
  if (override.mapId !== undefined) {
    const detail = resolveDetail({
      detailId: override.detailId ?? fabric?.detailId,
      detailScale: override.detailScale ?? fabric?.detailScale,
      surface,
    })

    nextMaterial.normalMap = detail ? detailNormalMap({ id: detail.id }) : null
    nextMaterial.normalScale = new Vector2(detail?.scale ?? 1, detail?.scale ?? 1)
    nextMaterial.userData.detailId = detail?.id ?? 'none'
    nextMaterial.needsUpdate = true
  }

  if (map) {
    nextMaterial.map = cloneFabricMap({
      map,
      repeat: fabric?.mapRepeat ?? 3,
    })
    nextMaterial.needsUpdate = true
  }

  sealClothMaterial({ material: nextMaterial })

  // Sheer cloth (chiffon) is the one cloth drawn see-through. Its layers all
  // blend, so none hides another; every other cloth stays sealed.
  if (opacity !== undefined && opacity < 1) {
    nextMaterial.transparent = true
    nextMaterial.opacity = opacity
    nextMaterial.depthWrite = false
  }

  return nextMaterial
}

function applyOverrideToSlot({
  material,
  override,
  map,
  surface,
}: {
  material: Material
  override: MaterialOverride
  map?: Texture
  surface?: SurfaceChoice
}) {
  if (!(material instanceof MeshStandardMaterial)) {
    return material
  }

  return applyOverrideToMaterial({ material, override, map, surface })
}

function findOverrideForMesh({
  node,
  overrides,
}: {
  node: Object3D
  overrides: MaterialOverride[]
}) {
  const ancestorNames = ancestorNamesFor({ node })

  for (let index = overrides.length - 1; index >= 0; index -= 1) {
    const override = overrides[index]

    if (
      override &&
      overrideMatchesMesh({
        meshName: override.meshName,
        nodeName: node.name,
        ancestorNames,
      })
    ) {
      return override
    }
  }

  // A model's cloth, whatever its node is called, takes the garment colour
  // when nothing names it (`neutraliseBakedCloth`).
  if (node.userData.bakedCloth === true) {
    return overrides.findLast((override) => override.meshName === 'body')
  }

  return undefined
}

export function listMeshes({ root }: { root: Object3D }) {
  const meshes: Mesh[] = []

  root.traverse((node) => {
    if (isMesh(node)) {
      meshes.push(node)
    }
  })

  return meshes
}

export function captureMeshMaterials({ root }: { root: Object3D }) {
  const materials = new Map<string, Mesh['material']>()

  root.traverse((node) => {
    if (isMesh(node)) {
      materials.set(node.uuid, node.material)
    }
  })

  return materials
}

export function restoreMeshMaterials({
  meshes,
  baseMaterials,
}: {
  meshes: Mesh[]
  baseMaterials: Map<string, Mesh['material']>
}) {
  for (const mesh of meshes) {
    const base = baseMaterials.get(mesh.uuid)

    if (base) {
      mesh.material = base
    }
  }
}

export function applyDesignOverrides({
  root,
  overrides,
  maps,
  surface,
}: {
  root: Object3D
  overrides: MaterialOverride[]
  maps?: Record<string, Texture>
  /** The studio's Surface choice; the fabric's own relief when unset. */
  surface?: SurfaceChoice
}) {
  root.traverse((node) => {
    if (!isMesh(node)) {
      return
    }

    const override = findOverrideForMesh({ node, overrides })

    if (!override) {
      return
    }

    const map = override.mapId ? maps?.[override.mapId] : undefined

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) =>
        applyOverrideToSlot({ material, override, map, surface }),
      )
      return
    }

    node.material = applyOverrideToSlot({
      material: node.material,
      override,
      map,
      surface,
    })
  })

  return root
}

export function applyOverridesFromBases({
  meshes,
  baseMaterials,
  overrides,
  maps,
  surface,
}: {
  meshes: Mesh[]
  baseMaterials: Map<string, Mesh['material']>
  overrides: MaterialOverride[]
  maps?: Record<string, Texture>
  surface?: SurfaceChoice
}) {
  restoreMeshMaterials({ meshes, baseMaterials })

  for (const mesh of meshes) {
    applyDesignOverrides({
      root: mesh,
      overrides,
      maps,
      surface,
    })
  }

  return meshes
}

function meshMaterials({ mesh }: { mesh: Mesh }) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

export function applyLiveOverrides({
  meshes,
  baseMaterials,
  overrides,
  maps,
  animate = true,
  surface,
}: {
  meshes: Mesh[]
  baseMaterials: Map<string, Mesh['material']>
  overrides: MaterialOverride[]
  maps?: Record<string, Texture>
  animate?: boolean
  surface?: SurfaceChoice
}) {
  const priors = new Map<string, Color>()

  if (animate) {
    for (const mesh of meshes) {
      for (const material of meshMaterials({ mesh })) {
        if (material instanceof MeshStandardMaterial) {
          priors.set(mesh.uuid, material.color.clone())
          break
        }
      }
    }
  }

  applyOverridesFromBases({
    meshes,
    baseMaterials,
    overrides,
    maps,
    surface,
  })

  for (const mesh of meshes) {
    const prior = priors.get(mesh.uuid)

    for (const material of meshMaterials({ mesh })) {
      if (!(material instanceof MeshStandardMaterial)) {
        continue
      }

      material.userData.targetColor = material.color.clone()
      material.userData.targetRoughness = material.roughness

      if (animate && prior) {
        material.color.copy(prior)
      }
    }
  }

  return meshes
}
