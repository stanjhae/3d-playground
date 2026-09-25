import { describe, expect, test } from 'vitest'

import {
  garmentCategory,
  listGarmentsByCategory,
  pickCannedStillGrid,
  videoStillForScene,
  CANNED_STILLS,
  SHOOT_PRESETS,
  VIDEO_SCENES,
} from './landing-demo'

describe('landing-demo', () => {
  test('maps garments into marketing categories', () => {
    expect(garmentCategory({ garmentId: 'tee' })).toBe('tops')
    expect(garmentCategory({ garmentId: 'coat' })).toBe('outerwear')
    expect(listGarmentsByCategory({ category: 'tops' }).length).toBeGreaterThan(
      0,
    )
    expect(listGarmentsByCategory({ category: 'bottoms' })).toEqual([])
    expect(listGarmentsByCategory({ category: 'accessories' })).toEqual([])
  })

  test('picks a stable canned still grid from a seed', () => {
    const first = pickCannedStillGrid({ seed: 'streetwear', count: 4 })
    const second = pickCannedStillGrid({ seed: 'streetwear', count: 4 })
    expect(first).toEqual(second)
    expect(first).toHaveLength(4)
    expect(first.every((src) => CANNED_STILLS.includes(src as (typeof CANNED_STILLS)[number]))).toBe(
      true,
    )
  })

  test('maps video scenes onto canned stills', () => {
    expect(VIDEO_SCENES.length).toBeGreaterThan(0)
    expect(SHOOT_PRESETS.some((preset) => preset.id === 'streetwear')).toBe(
      true,
    )
    expect(videoStillForScene({ sceneId: 'front' })).toMatch(/^\/stills\//)
  })
})
