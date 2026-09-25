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

  test('puts a left mark on the left sleeve strip', () => {
    expect(panelPointToUv({ panel: 'left', x: 0.5, y: 0.5 })).toEqual({
      u: 0.25,
      v: 0.14,
    })
  })

  test('puts a right mark on the right sleeve strip', () => {
    expect(panelPointToUv({ panel: 'right', x: 0.5, y: 0.5 })).toEqual({
      u: 0.75,
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

  test('round-trips a left mark', () => {
    const uv = panelPointToUv({ panel: 'left', x: 0.2, y: 0.8 })
    const point = uvToPanelPoint({ u: uv.u, v: uv.v })

    expect(point?.panel).toBe('left')
    expect(point?.x).toBeCloseTo(0.2)
    expect(point?.y).toBeCloseTo(0.8)
  })

  test('round-trips a right mark', () => {
    const uv = panelPointToUv({ panel: 'right', x: 0.2, y: 0.8 })
    const point = uvToPanelPoint({ u: uv.u, v: uv.v })

    expect(point?.panel).toBe('right')
    expect(point?.x).toBeCloseTo(0.2)
    expect(point?.y).toBeCloseTo(0.8)
  })

  test('returns null outside both panels', () => {
    expect(uvToPanelPoint({ u: -0.2, v: 0.5 })).toBeNull()
  })
})

describe('uvOnPanel', () => {
  test('reads a left UV as the chest hem, not a new panel', () => {
    const left = panelPointToUv({ panel: 'left', x: 0.2, y: 0.8 })
    const onFront = uvOnPanel({
      panel: 'front',
      u: left.u,
      v: left.v,
    })

    expect(onFront.y).toBe(0)
    expect(onFront.x).toBeGreaterThan(0)
  })
})
