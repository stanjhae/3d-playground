import { describe, expect, test } from 'vitest'

import { getLocationById, listLocations } from './locations'

describe('listLocations', () => {
  test('ports the six walkthrough presets', () => {
    const locations = listLocations()

    expect(locations.map((location) => location.id)).toEqual([
      'cafeteria',
      'entrance',
      'secondFloor',
      'thirdFloor',
      'bigLectureHall',
      'laboratory',
    ])
    expect(getLocationById({ id: 'cafeteria' })).toMatchObject({
      position: [-474, 100, 469],
      lookAt: [1850, 100, 2500],
      velocityY: 100,
    })
  })

  test('honors limit', () => {
    expect(listLocations({ limit: 0 })).toEqual([])
    expect(listLocations({ limit: 2 })).toHaveLength(2)
  })
})
