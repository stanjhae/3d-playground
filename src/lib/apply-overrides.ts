import {
  Material,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Object3D,
  type Texture,
} from 'three'

import type { MaterialOverride } from './design-schema'

function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh
}

function cloneMaterialEntry({ material }: { material: Material }) {
  if (material instanceof MeshStandardMaterial) {
    return material.clone()
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

function applyOverrideToMaterial({
  material,
  override,
  map,
}: {
  material: MeshStandardMaterial
  override: MaterialOverride
  map?: Texture
}) {
  const nextMaterial = material.clone()

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

  if (map) {
    map.colorSpace = SRGBColorSpace
    nextMaterial.map = map
    nextMaterial.needsUpdate = true
  }

  return nextMaterial
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
  const overrideByMeshName = new Map(
    overrides.map((override) => [override.meshName, override]),
  )

  root.traverse((node) => {
    if (!isMesh(node)) {
      return
    }

    const override = overrideByMeshName.get(node.name)

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
