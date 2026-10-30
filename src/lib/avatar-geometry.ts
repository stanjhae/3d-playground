import {
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three'

import { SLEEVE_PIVOT, WORN_SLEEVE_DROP } from './tee-geometry'

export type AvatarMeasurements = {
  height: number
  chest: number
  waist: number
}

const BASE_HEIGHT_CM = 180
const BASE_CHEST_CM = 102
const BASE_WAIST_CM = 80

/**
 * The mannequin is modelled at BASE measurements in the tee's own frame
 * (tee-geometry.ts), lifted so the tee's shoulder pivot meets the
 * mannequin's shoulder. Measurements then scale the mannequin and the
 * garment by the same factors, so they cannot drift apart per preset.
 */
const GARMENT_LIFT = 0.28
const SHOULDER_Y = SLEEVE_PIVOT.y + GARMENT_LIFT
/** Arms hang a little inside the worn sleeves' drop. */
const ARM_DROP = WORN_SLEEVE_DROP - 0.08
/** Torso depth stays inside the tee's shallowest ring (the back of the waist). */
const TORSO_DEPTH = 0.34

function skinMaterial() {
  return new MeshStandardMaterial({
    color: '#c4a07a',
    roughness: 0.72,
    metalness: 0.02,
  })
}

function part({
  name,
  geometry,
  material,
}: {
  name: string
  geometry: BufferGeometry
  material: MeshStandardMaterial
}) {
  const mesh = new Mesh(geometry, material)
  mesh.name = name
  mesh.castShadow = true
  return mesh
}

function buildArm({
  side,
  material,
}: {
  side: 'left' | 'right'
  material: MeshStandardMaterial
}) {
  const sign = side === 'left' ? -1 : 1
  const length = 0.5
  // Start just down the arm from the pivot so the cap stays inside the sleeve.
  const start = 0.05
  const dirX = sign * Math.sin(ARM_DROP)
  const dirY = -Math.cos(ARM_DROP)
  const shoulderX = sign * SLEEVE_PIVOT.x + dirX * start
  const shoulderY = SHOULDER_Y + dirY * start

  const arm = part({
    name: `avatar-arm-${side}`,
    geometry: new CapsuleGeometry(0.042, length, 4, 10),
    material,
  })
  arm.rotation.z = sign * ARM_DROP
  arm.position.set(
    shoulderX + dirX * (length / 2),
    shoulderY + dirY * (length / 2),
    0,
  )

  const hand = part({
    name: `avatar-hand-${side}`,
    geometry: new SphereGeometry(0.05, 12, 10),
    material,
  })
  hand.scale.set(0.8, 1.2, 0.6)
  hand.position.set(
    shoulderX + dirX * (length + 0.08),
    shoulderY + dirY * (length + 0.08),
    0,
  )

  return [arm, hand]
}

/**
 * Procedural mannequin used when avatar GLBs are missing: a neutral
 * standing pose, arms down through the worn tee's sleeves.
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
  const material = skinMaterial()
  const root = new Group()
  root.name = 'avatar-root'

  const legLeft = part({
    name: 'avatar-leg-left',
    geometry: new CapsuleGeometry(0.056, 0.74, 4, 10),
    material,
  })
  legLeft.position.set(-0.078, 0.47, 0)
  const legRight = legLeft.clone()
  legRight.name = 'avatar-leg-right'
  legRight.position.x = 0.078

  const hips = part({
    name: 'avatar-hips',
    geometry: new CapsuleGeometry(0.15, 0.12, 6, 16),
    material,
  })
  hips.position.set(0, 0.92, 0)
  // Hips follow the waist; the shared root scale already carries the chest.
  const hipRatio = waistScale / chestScale
  hips.scale.set(hipRatio, 1, TORSO_DEPTH * hipRatio)

  const torso = part({
    name: 'avatar-torso',
    geometry: new CapsuleGeometry(0.17, 0.3, 6, 16),
    material,
  })
  torso.position.set(0, 1.17, 0)
  torso.scale.z = TORSO_DEPTH

  const shoulders = part({
    name: 'avatar-shoulders',
    geometry: new CapsuleGeometry(0.045, 0.26, 4, 10),
    material,
  })
  shoulders.rotation.z = Math.PI / 2
  shoulders.position.set(0, SHOULDER_Y - 0.035, 0)
  shoulders.scale.z = 0.9

  const neck = part({
    name: 'avatar-neck',
    geometry: new CylinderGeometry(0.046, 0.05, 0.18, 14),
    material,
  })
  neck.position.set(0, 1.53, 0)

  const head = part({
    name: 'avatar-head',
    geometry: new SphereGeometry(0.105, 18, 14),
    material,
  })
  head.scale.set(0.95, 1.15, 1)
  head.position.set(0, 1.72, 0.01)

  root.add(
    legLeft,
    legRight,
    hips,
    torso,
    shoulders,
    neck,
    head,
    ...buildArm({ side: 'left', material }),
    ...buildArm({ side: 'right', material }),
  )
  root.scale.set(chestScale, heightScale, chestScale)

  return {
    root,
    heightScale,
    garment: {
      position: [0, GARMENT_LIFT * heightScale, 0.004 * chestScale] as [
        number,
        number,
        number,
      ],
      scale: [chestScale, heightScale, chestScale] as [number, number, number],
    },
    shoulderY: SHOULDER_Y * heightScale,
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
