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

  test('preview keeps the current avatar when re-tapped', () => {
    expect(
      nextAvatarSelection({
        currentId: 'atelier-tall',
        clickedId: 'atelier-tall',
        createStep: 'preview',
      }),
    ).toBe('atelier-tall')
    expect(
      nextAvatarSelection({
        currentId: 'atelier-tall',
        clickedId: 'atelier-tall',
        createStep: 'design',
      }),
    ).toBeNull()
    expect(
      nextAvatarSelection({
        currentId: 'atelier-tall',
        clickedId: 'atelier-soft',
        createStep: 'preview',
      }),
    ).toBe('atelier-soft')
  })
})
