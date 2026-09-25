import { describe, expect, test } from 'vitest'

import { GRAPHIC_ASSETS, listGraphicsByCategory } from './graphics-library'

describe('graphics library', () => {
  test('lists assets by category', () => {
    expect(listGraphicsByCategory({ category: 'crosses' }).length).toBeGreaterThan(0)
    expect(listGraphicsByCategory({ category: 'flames' }).length).toBeGreaterThan(0)
    expect(listGraphicsByCategory({ category: 'all' })).toHaveLength(
      GRAPHIC_ASSETS.length,
    )
  })

  test('every asset lives under /graphics/', () => {
    for (const asset of GRAPHIC_ASSETS) {
      expect(asset.src.startsWith('/graphics/')).toBe(true)
    }
  })
})
