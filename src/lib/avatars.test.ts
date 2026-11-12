import { describe, expect, test } from 'vitest'

import type { Mesh } from 'three'

import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_MEASUREMENTS,
  getAvatarById,
  listAvatars,
  nextAvatarSelection,
} from './avatars'
import { createProceduralAvatar } from './avatar-geometry'
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
  test('a real model takes the worn tee’s height and top, centred on the body', async () => {
    const { realGarmentSeat } = await import('./avatar-geometry')
    const { Box3 } = await import('three')
    const worn = new Box3().setFromObject(createTeeMesh({ pose: 'worn' }))
    const frame = { min: [0.1, 0.2, -0.05], max: [0.7, 0.9, 0.15], sleeves: {} } as const
    const seat = realGarmentSeat({ frame: { min: [...frame.min], max: [...frame.max], sleeves: {} } })

    expect((frame.max[1] - frame.min[1]) * seat.scale).toBeCloseTo(worn.max.y - worn.min.y, 6)
    expect(frame.max[1] * seat.scale + seat.position[1]).toBeCloseTo(worn.max.y, 6)
    expect(((frame.min[0] + frame.max[0]) / 2) * seat.scale + seat.position[0]).toBeCloseTo(0, 6)
  })
})
