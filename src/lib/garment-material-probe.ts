import { MeshPhysicalMaterial, MeshStandardMaterial, type Mesh } from 'three'
import { create } from 'zustand'

/**
 * What the studio's 3D garment cloth is drawn with right now (writer W): the
 * texture, finish, sheen, relief and see-through of the cloth material, read
 * back from three.js after the overrides land. The Color step shows it as
 * `data-*` on a hidden element, so a test can tell the 3D look changed
 * without reading pixels.
 */
export type GarmentMaterialProbe = {
  mapId: string | null
  roughness: number
  metalness: number
  sheen: number
  clearcoat: number
  opacity: number
  detailId: string | null
}

export const useGarmentMaterialProbe = create<{ probe: GarmentMaterialProbe | null }>(() => ({ probe: null }))

function materialsOf({ mesh }: { mesh: Mesh }) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Reads the cloth: the first material with a fabric texture, else the first cloth one. */
export function readGarmentMaterial({ meshes }: { meshes: Mesh[] }): GarmentMaterialProbe | null {
  const all = meshes.flatMap((mesh) => materialsOf({ mesh })).filter((material) => material instanceof MeshStandardMaterial)
  const material = all.find((entry) => typeof entry.userData.mapId === 'string') ?? all[0]

  if (!material) {
    return null
  }

  const physical = material instanceof MeshPhysicalMaterial ? material : null
  const roughness = typeof material.userData.targetRoughness === 'number' ? material.userData.targetRoughness : material.roughness

  return {
    mapId: typeof material.userData.mapId === 'string' ? material.userData.mapId : null,
    roughness: Math.round(roughness * 1000) / 1000,
    metalness: Math.round(material.metalness * 1000) / 1000,
    sheen: Math.round((physical?.sheen ?? 0) * 1000) / 1000,
    clearcoat: Math.round((physical?.clearcoat ?? 0) * 1000) / 1000,
    opacity: material.transparent ? Math.round(material.opacity * 1000) / 1000 : 1,
    detailId: typeof material.userData.detailId === 'string' ? material.userData.detailId : null,
  }
}
