import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'

export type AvatarMeasurements = {
  height: number
  chest: number
  waist: number
}

const BASE_HEIGHT_CM = 180
const BASE_CHEST_CM = 102
const BASE_WAIST_CM = 80

function skinMaterial() {
  return new MeshStandardMaterial({
    color: '#c4a07a',
    roughness: 0.72,
    metalness: 0.02,
  })
}

/**
 * Procedural mannequin used when avatar GLBs are missing.
 * Scaled from height / chest / waist centimeters.
 */
export function createProceduralAvatar({
  measurements,
}: {
  measurements: AvatarMeasurements
}) {
  const heightScale = measurements.height / BASE_HEIGHT_CM
  const chestScale = measurements.chest / BASE_CHEST_CM
  const waistScale = measurements.waist / BASE_WAIST_CM
  const torsoScaleX = (chestScale + waistScale) / 2
  const material = skinMaterial()
  const root = new Group()
  root.name = 'avatar-root'

  const hips = new Mesh(
    new CapsuleGeometry(0.16 * torsoScaleX, 0.28 * heightScale, 6, 12),
    material,
  )
  hips.name = 'avatar-hips'
  hips.position.set(0, 0.95 * heightScale, 0)
  hips.castShadow = true

  const torso = new Mesh(
    new CapsuleGeometry(0.2 * chestScale, 0.42 * heightScale, 6, 12),
    material,
  )
  torso.name = 'avatar-torso'
  torso.position.set(0, 1.35 * heightScale, 0)
  torso.castShadow = true

  const head = new Mesh(new SphereGeometry(0.12 * heightScale, 16, 12), material)
  head.name = 'avatar-head'
  head.position.set(0, 1.78 * heightScale, 0)
  head.castShadow = true

  const legLeft = new Mesh(
    new CapsuleGeometry(0.08 * waistScale, 0.55 * heightScale, 4, 10),
    material,
  )
  legLeft.name = 'avatar-leg-left'
  legLeft.position.set(-0.12 * torsoScaleX, 0.42 * heightScale, 0)
  legLeft.castShadow = true

  const legRight = legLeft.clone()
  legRight.name = 'avatar-leg-right'
  legRight.position.x = 0.12 * torsoScaleX

  const armLeft = new Mesh(
    new CapsuleGeometry(0.055 * chestScale, 0.42 * heightScale, 4, 10),
    material,
  )
  armLeft.name = 'avatar-arm-left'
  armLeft.position.set(-0.32 * chestScale, 1.38 * heightScale, 0)
  armLeft.rotation.z = 0.18
  armLeft.castShadow = true

  const armRight = armLeft.clone()
  armRight.name = 'avatar-arm-right'
  armRight.position.x = 0.32 * chestScale
  armRight.rotation.z = -0.18

  root.add(hips, torso, head, legLeft, legRight, armLeft, armRight)

  return {
    root,
    heightScale,
    garmentOffsetY: 1.05 * heightScale,
    garmentScale: 0.92 + (chestScale - 1) * 0.25,
  }
}

export function disposeAvatarGroup({
  group,
}: {
  group: Group
}) {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return
    }

    object.geometry.dispose()

    const material = object.material

    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose()
      }
      return
    }

    material.dispose()
  })
}

export function scaleAvatarGroup({
  group,
  measurements,
}: {
  group: Group
  measurements: AvatarMeasurements
}) {
  const heightScale = measurements.height / BASE_HEIGHT_CM
  const chestScale = measurements.chest / BASE_CHEST_CM
  group.scale.set(
    (chestScale + measurements.waist / BASE_WAIST_CM) / 2,
    heightScale,
    chestScale,
  )
}
