import { describe, expect, test } from 'vitest'

import { getFabricById, getFabricByMapId, getFabricForOverride, listFabrics } from './fabrics'

describe('listFabrics', () => {
  test('includes the five families and at least eight editorial colors', () => {
    const fabrics = listFabrics()
    const names = fabrics.map((fabric) => fabric.name)

    expect(names).toEqual(
      expect.arrayContaining(['Cotton', 'Silk', 'Wool', 'Denim', 'Leather']),
    )
    expect(fabrics.length).toBeGreaterThanOrEqual(13)

    for (const fabric of fabrics) {
      expect(fabric).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          color: expect.stringMatching(/^#/),
          roughness: expect.any(Number),
          metalness: expect.any(Number),
        }),
      )
      expect(fabric).not.toHaveProperty('slider')
      expect(fabric).not.toHaveProperty('roughnessRange')
    }
  })

  test('honors limit', () => {
    expect(listFabrics({ limit: 0 })).toEqual([])
    expect(listFabrics({ limit: 2 })).toHaveLength(2)
  })
})

describe('getFabricById', () => {
  test('returns a named preset', () => {
    const silk = getFabricById({ id: 'ivory-silk' })

    expect(silk?.name).toBe('Ivory Silk')
    expect(silk?.mapId).toBe('silk-shine')
  })

  test('returns undefined for unknown ids', () => {
    expect(getFabricById({ id: 'missing' })).toBeUndefined()
  })
})

describe('getFabricForOverride', () => {
  test('uses the first family preset when only a map is known', () => {
    expect(getFabricByMapId({ mapId: 'silk-shine' })?.id).toBe('silk')
    expect(getFabricForOverride({ mapId: 'silk-shine' })?.id).toBe('silk')
  })

  test('matches the editorial color on the same map family', () => {
    expect(
      getFabricForOverride({ mapId: 'silk-shine', color: '#e8c4b8' })?.id,
    ).toBe('blush-silk')
  })
})
