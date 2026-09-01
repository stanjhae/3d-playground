import {
  Color,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from 'three'

import type { MaterialOverride } from './design-schema'
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
}: {
  material: MeshStandardMaterial
  override: MaterialOverride
  map?: Texture
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

  if (fabric?.sheen !== undefined) {
    nextMaterial.sheen = fabric.sheen
    nextMaterial.sheenRoughness = fabric.sheenRoughness ?? 0.3
    nextMaterial.sheenColor = new Color(fabric.sheenColor ?? '#ffffff')
  } else {
    nextMaterial.sheen = 0
  }

  if (fabric?.clearcoat !== undefined) {
    nextMaterial.clearcoat = fabric.clearcoat
    nextMaterial.clearcoatRoughness = fabric.clearcoatRoughness ?? 0.4
  } else {
    nextMaterial.clearcoat = 0
  }

  if (map) {
    nextMaterial.map = cloneFabricMap({
      map,
      repeat: fabric?.mapRepeat ?? 3,
    })
    nextMaterial.needsUpdate = true
  }

  return sealClothMaterial({ material: nextMaterial })
}

function applyOverrideToSlot({
  material,
  override,
  map,
}: {
  material: Material
  override: MaterialOverride
  map?: Texture
}) {
  if (!(material instanceof MeshStandardMaterial)) {
    return material
  }

  return applyOverrideToMaterial({ material, override, map })
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
}: {
  root: Object3D
  overrides: MaterialOverride[]
  maps?: Record<string, Texture>
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
        applyOverrideToSlot({ material, override, map }),
      )
      return
    }

    node.material = applyOverrideToSlot({
      material: node.material,
      override,
      map,
    })
  })

  return root
}

export function applyOverridesFromBases({
  meshes,
  baseMaterials,
  overrides,
  maps,
}: {
  meshes: Mesh[]
  baseMaterials: Map<string, Mesh['material']>
  overrides: MaterialOverride[]
  maps?: Record<string, Texture>
}) {
  restoreMeshMaterials({ meshes, baseMaterials })

  for (const mesh of meshes) {
    applyDesignOverrides({
      root: mesh,
      overrides,
      maps,
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
}: {
  meshes: Mesh[]
  baseMaterials: Map<string, Mesh['material']>
  overrides: MaterialOverride[]
  maps?: Record<string, Texture>
  animate?: boolean
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
