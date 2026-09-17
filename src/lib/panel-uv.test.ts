import { describe, expect, test } from 'vitest'

import { panelPointToUv, uvToPanelPoint } from './panel-uv'

describe('panelPointToUv', () => {
  test('puts the front centre on the left half', () => {
    expect(panelPointToUv({ panel: 'front', x: 0.5, y: 0.5 })).toEqual({
      u: 0.25,
      v: 0.5,
    })
  })

  test('puts the back centre on the right half', () => {
    expect(panelPointToUv({ panel: 'back', x: 0.5, y: 0.5 })).toEqual({
      u: 0.75,
      v: 0.5,
    })
  })
})

describe('uvToPanelPoint', () => {
  test('round-trips a front mark', () => {
    const uv = panelPointToUv({ panel: 'front', x: 0.2, y: 0.8 })
    const point = uvToPanelPoint({ u: uv.u, v: uv.v })

    expect(point?.panel).toBe('front')
    expect(point?.x).toBeCloseTo(0.2)
    expect(point?.y).toBeCloseTo(0.8)
  })

  test('returns null outside both panels', () => {
    expect(uvToPanelPoint({ u: -0.2, v: 0.5 })).toBeNull()
  })
})
