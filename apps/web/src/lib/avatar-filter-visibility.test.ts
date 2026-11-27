import { describe, expect, test } from 'vitest'

import { visibleAvatarsForFilter } from '../components/editor/AvatarRail'
import { listAvatars } from './avatars'

describe('visibleAvatarsForFilter', () => {
  test('keeps the filtered list when the selection matches', () => {
    const male = listAvatars({ filter: 'male' })
    const selectedId = male[0]?.id
    expect(selectedId).toBeTruthy()
    expect(
      visibleAvatarsForFilter({
        filter: 'male',
        selectedId,
      }).map((avatar) => avatar.id),
    ).toEqual(male.map((avatar) => avatar.id))
  })

  test('pins a selected avatar that falls outside the filter', () => {
    const female = listAvatars({ filter: 'female' })[0]
    expect(female).toBeTruthy()
    const visible = visibleAvatarsForFilter({
      filter: 'male',
      selectedId: female!.id,
    })
    expect(visible[0]?.id).toBe(female!.id)
    expect(visible.some((avatar) => avatar.filters.includes('male'))).toBe(
      true,
    )
  })
})
