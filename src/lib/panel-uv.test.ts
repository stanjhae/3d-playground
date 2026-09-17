import { describe, expect, test } from 'vitest'

import { panelPointToUv, uvOnPanel, uvToPanelPoint } from './panel-uv'

describe('panelPointToUv', () => {
  test('puts the front centre on the left half', () => {
    expect(panelPointToUv({ panel: 'front', x: 0.5, y: 0.5 })).toEqual({
      u: 0.25,
      v: 0.64,
    })
  })

  test('puts the back centre on the right half', () => {
    expect(panelPointToUv({ panel: 'back', x: 0.5, y: 0.5 })).toEqual({
      u: 0.75,
      v: 0.64,
    })
  })

  test('puts a sleeve mark on the shared strip', () => {
    expect(panelPointToUv({ panel: 'sleeve', x: 0.5, y: 0.5 })).toEqual({
      u: 0.5,
      v: 0.14,
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

  test('round-trips a sleeve mark', () => {
    const uv = panelPointToUv({ panel: 'sleeve', x: 0.2, y: 0.8 })
    const point = uvToPanelPoint({ u: uv.u, v: uv.v })

    expect(point?.panel).toBe('sleeve')
    expect(point?.x).toBeCloseTo(0.2)
    expect(point?.y).toBeCloseTo(0.8)
  })

  test('returns null outside both panels', () => {
    expect(uvToPanelPoint({ u: -0.2, v: 0.5 })).toBeNull()
  })
})

describe('uvOnPanel', () => {
  test('reads a sleeve UV as the chest hem, not a new panel', () => {
    const sleeve = panelPointToUv({ panel: 'sleeve', x: 0.2, y: 0.8 })
    const onFront = uvOnPanel({
      panel: 'front',
      u: sleeve.u,
      v: sleeve.v,
    })

    expect(onFront.y).toBe(0)
    expect(onFront.x).toBeGreaterThan(0)
  })
})
