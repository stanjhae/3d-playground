import {
  Box3,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three'

import type { ModelFrame } from './design-document'
import { SLEEVE_PIVOT, WORN_SLEEVE_DROP, createTeeMesh } from './tee-geometry'

export type AvatarMeasurements = {
  height: number
  chest: number
  waist: number
  /** Hip girth; absent, the hips follow the waist as before. */
  hip?: number
  /** Male and female mannequins differ in shoulders, bust and hips. */
  build?: 'male' | 'female' | 'neutral'
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
  const build = measurements.build ?? 'neutral'
  const hipScale = measurements.hip ? measurements.hip / (BASE_WAIST_CM * 1.22) : waistScale
  const hipRatio = hipScale / chestScale
  hips.scale.set(hipRatio, 1, TORSO_DEPTH * hipRatio)

  const torso = part({
    name: 'avatar-torso',
    geometry: new CapsuleGeometry(0.17, 0.3, 6, 16),
    material,
  })
  torso.position.set(0, 1.17, 0)
  torso.scale.z = TORSO_DEPTH
  // A female torso narrows to the waist; a male one stays broad through it.
  torso.scale.x = build === 'female' ? 0.9 : build === 'male' ? 1.04 : 1

  const shoulders = part({
    name: 'avatar-shoulders',
    geometry: new CapsuleGeometry(0.045, 0.26, 4, 10),
    material,
  })
  shoulders.rotation.z = Math.PI / 2
  shoulders.position.set(0, SHOULDER_Y - 0.035, 0)
  shoulders.scale.z = 0.9
  // Rotated a quarter turn, so the capsule's length (its y) is the shoulder width.
  shoulders.scale.y = build === 'female' ? 0.86 : build === 'male' ? 1.08 : 1
  // Kept inside the tee's chest rings so the cloth still covers it.
  const bust =
    build === 'female'
      ? ([-1, 1] as const).map((side) => {
          const mesh = part({ name: `avatar-bust-${side < 0 ? 'left' : 'right'}`, geometry: new SphereGeometry(0.06, 14, 10), material })
          mesh.scale.set(1, 0.85, 0.55)
          mesh.position.set(side * 0.068, 1.27, 0.03)
          return mesh
        })
      : []

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
    ...bust,
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

let wornTeeBox: Box3 | null = null

/**
 * Seats a real garment model (the @4 tee) where the worn drawn tee sits on
 * the mannequin: the same height, its collar at the same top, centred on
 * the body. The mannequin's own scale then carries it, as it does the
 * drawn tee, so every preset wears it at its size.
 */
export function realGarmentSeat({ frame }: { frame: ModelFrame }): {
  position: [number, number, number]
  scale: number
} {
  wornTeeBox ??= new Box3().setFromObject(createTeeMesh({ pose: 'worn' }))
  const target = wornTeeBox
  const height = Math.max(1e-6, frame.max[1] - frame.min[1])
  const scale = (target.max.y - target.min.y) / height
  const centreX = (frame.min[0] + frame.max[0]) / 2
  const centreZ = (frame.min[2] + frame.max[2]) / 2
  const targetZ = (target.min.z + target.max.z) / 2

  return {
    position: [-centreX * scale, target.max.y - frame.max[1] * scale, targetZ - centreZ * scale],
    scale,
  }
}
