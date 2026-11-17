import { describe, expect, test } from 'vitest'

import type { Mesh } from 'three'

import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_MEASUREMENTS,
  getAvatarById,
  listAvatars,
  nextAvatarSelection,
} from './avatars'
import { createProceduralAvatar, type AvatarMeasurements } from './avatar-geometry'
import { SLEEVE_PIVOT, createTeeMesh } from './tee-geometry'

describe('avatars', () => {
  test('lists house avatar presets', () => {
    const avatars = listAvatars()

    expect(avatars.length).toBeGreaterThanOrEqual(4)
    expect(listAvatars({ filter: 'athletic' }).length).toBeGreaterThan(0)
    expect(getAvatarById({ avatarId: avatars[0]?.id })?.label).toBe(
      avatars[0]?.label,
    )
    expect(DEFAULT_AVATAR_MEASUREMENTS.height).toBe(180)
  })

  test('builds a procedural mannequin from measurements', () => {
    const tall = createProceduralAvatar({
      measurements: { height: 190, chest: 110, waist: 88 },
    })
    const compact = createProceduralAvatar({
      measurements: { height: 160, chest: 90, waist: 70 },
    })

    expect(tall.root.children.length).toBeGreaterThan(3)
    expect(tall.heightScale).toBeGreaterThan(compact.heightScale)
    expect(tall.garment.scale[1]).toBeGreaterThan(compact.garment.scale[1])
  })

  test('every preset seats the tee shoulder on the mannequin shoulder', () => {
    for (const preset of AVATAR_PRESETS) {
      const avatar = createProceduralAvatar({
        measurements: {
          height: preset.heightCm,
          chest: preset.chestCm,
          waist: preset.waistCm,
        },
      })
      const teeShoulderY =
        avatar.garment.position[1] + SLEEVE_PIVOT.y * avatar.garment.scale[1]

      expect(teeShoulderY).toBeCloseTo(avatar.shoulderY, 5)
      expect(avatar.garment.scale).toEqual(avatar.root.scale.toArray())
    }
  })

  test('worn sleeves hang from the shoulder pivot over the arms', () => {
    const tee = createTeeMesh({ sleeve: 'short', pose: 'worn' })
    const sleeve = tee.getObjectByName('body-sleeve-right') as Mesh
    sleeve.geometry.computeBoundingBox()
    const box = sleeve.geometry.boundingBox!

    expect(box.max.y).toBeLessThan(SLEEVE_PIVOT.y + 0.04)
    expect(box.min.y).toBeLessThan(SLEEVE_PIVOT.y - 0.1)
    expect(box.min.x).toBeGreaterThan(SLEEVE_PIVOT.x - 0.1)
  })

  test('re-tapping the chosen avatar goes back to the tee alone', () => {
    expect(
      nextAvatarSelection({ currentId: 'atelier-tall', clickedId: 'atelier-tall' }),
    ).toBeNull()
    expect(
      nextAvatarSelection({ currentId: 'atelier-tall', clickedId: 'atelier-soft' }),
    ).toBe('atelier-soft')
  })
})

describe('male and female mannequins differ (tester feedback)', () => {
  test('Tall · Male and Tall · Female build visibly different bodies', () => {
    const male = AVATAR_PRESETS.find((avatar) => avatar.label === 'Tall · Male')!
    const female = AVATAR_PRESETS.find((avatar) => avatar.label === 'Tall · Female')!
    const build = (avatar: typeof male) =>
      createProceduralAvatar({
        measurements: { height: avatar.heightCm, chest: avatar.chestCm, waist: avatar.waistCm, hip: avatar.hipCm, build: avatar.build },
      }).root
    const part = (root: ReturnType<typeof build>, name: string) => root.getObjectByName(name)

    const maleRoot = build(male)
    const femaleRoot = build(female)

    expect(part(femaleRoot, 'avatar-bust-left')).toBeDefined()
    expect(part(maleRoot, 'avatar-bust-left')).toBeUndefined()
    // Broader shoulders on the male, wider hips (relative to the chest) on the female.
    expect(part(maleRoot, 'avatar-shoulders')!.scale.y).toBeGreaterThan(part(femaleRoot, 'avatar-shoulders')!.scale.y)
    expect(part(femaleRoot, 'avatar-hips')!.scale.x).toBeGreaterThan(part(maleRoot, 'avatar-hips')!.scale.x)
  })
})

describe('realGarmentSeat', () => {
  type Vec3 = readonly [number, number, number]

  /** Where a point of a real model lands on the avatar: the mount, then the seat. */
  async function worn({ point, measurements = DEFAULT_AVATAR_MEASUREMENTS }: { point: Vec3; measurements?: AvatarMeasurements }) {
    const { realGarmentSeat } = await import('./avatar-geometry')
    const { garment } = createProceduralAvatar({ measurements })
    const seat = realGarmentSeat()
    return [0, 1, 2].map(
      (axis) => garment.position[axis]! + garment.scale[axis]! * (seat.position[axis]! + point[axis]! * seat.scale),
    ) as [number, number, number]
  }

  test('the tee sits on the body’s landmarks: collar on the neck, hem at the hips, sleeves at the shoulders', async () => {
    const { BODY_LANDMARKS } = await import('./cloth/colliders')
    const { TEE_CREW_SHORT_V5 } = await import('./templates/tee-v5')
    const bounds = TEE_CREW_SHORT_V5.geometry.bounds!
    const neckTop = BODY_LANDMARKS.neckY + 0.18
    const [, collar] = await worn({ point: [0, bounds.max[1], 0] })
    const [, hem] = await worn({ point: [0, bounds.min[1], 0] })

    // The collar rides the neck, below its top (not above it, as the old 1.39× seat put it).
    expect(collar).toBeGreaterThan(BODY_LANDMARKS.neckY)
    expect(collar).toBeLessThan(neckTop)
    // The hem falls at the hips, not mid-thigh.
    expect(Math.abs(hem - BODY_LANDMARKS.hipY)).toBeLessThan(0.05)

    for (const region of Object.values(TEE_CREW_SHORT_V5.regions)) {
      if (region.renderPanel !== 'left' && region.renderPanel !== 'right') {
        continue
      }
      const [x, y] = await worn({ point: region.center! })
      // Each sleeve hangs from the shoulder seam, at the shoulder's width.
      expect(Math.abs(Math.abs(x) - BODY_LANDMARKS.shoulderX), region.label).toBeLessThan(0.03)
      expect(y, region.label).toBeLessThan(BODY_LANDMARKS.shoulderY)
      expect(y, region.label).toBeGreaterThan(BODY_LANDMARKS.shoulderY - 0.15)
    }
  })

  test('a bigger preset carries the garment with the body: the collar follows the height, the sleeves the chest', async () => {
    const { TEE_CREW_SHORT_V5 } = await import('./templates/tee-v5')
    const bounds = TEE_CREW_SHORT_V5.geometry.bounds!
    const tall = { height: 198, chest: 112, waist: 90 }
    const [, baseCollar] = await worn({ point: [0, bounds.max[1], 0] })
    const [, tallCollar] = await worn({ point: [0, bounds.max[1], 0], measurements: tall })
    const [baseEdge] = await worn({ point: [bounds.max[0], 1.3, 0] })
    const [tallEdge] = await worn({ point: [bounds.max[0], 1.3, 0], measurements: tall })

    expect(tallCollar / baseCollar).toBeCloseTo(198 / 180, 6)
    expect(tallEdge / baseEdge).toBeCloseTo(112 / 102, 6)
  })

  test('every real model keeps its own frame on the body (each is modelled on the mannequin)', async () => {
    const { templateForGarment } = await import('./template-manifest')
    const { GARMENT_IDS } = await import('./design-schema')
    const manifests = GARMENT_IDS.map((garmentId) => templateForGarment({ garmentId })).filter((manifest) => manifest !== undefined)
    expect(manifests.length).toBeGreaterThan(10)
    for (const manifest of manifests) {
      const bounds = manifest.geometry.bounds
      if (!bounds) {
        continue
      }
      for (const corner of [bounds.min, bounds.max]) {
        const at = await worn({ point: corner })
        expect(at[0], manifest.id).toBeCloseTo(corner[0], 6)
        expect(at[1], manifest.id).toBeCloseTo(corner[1], 6)
        expect(at[2], manifest.id).toBeCloseTo(corner[2], 6)
      }
    }
  })
})
