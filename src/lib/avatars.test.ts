import { describe, expect, test } from 'vitest'

import {
  DEFAULT_AVATAR_MEASUREMENTS,
  getAvatarById,
  listAvatars,
} from './avatars'
import { createProceduralAvatar } from './avatar-geometry'

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
    expect(tall.garmentScale).toBeGreaterThan(0)
  })
})
