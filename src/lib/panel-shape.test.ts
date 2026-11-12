import { describe, expect, it } from 'vitest'

import { panelTriangles } from './panel-shape'

describe('panelTriangles', () => {
  const rect = { u0: 0.5, v0: 0, u1: 1, v1: 0.5 }

  it('keeps triangles inside the panel rectangle, in panel coordinates', () => {
    // Two triangles: one inside the rect, one with an unprinted corner (−1, −1).
    const uvs = [0.5, 0, 1, 0, 0.75, 0.5, 0.6, 0.1, -1, -1, 0.7, 0.2]
    expect(panelTriangles({ uvs, index: null, rect })).toEqual([0, 0, 1, 0, 0.5, 1])
  })

  it('reads indexed geometry', () => {
    const uvs = [0.5, 0, 1, 0, 0.75, 0.5, 0.1, 0.9]
    expect(panelTriangles({ uvs, index: [0, 1, 2, 0, 1, 3], rect })).toEqual([0, 0, 1, 0, 0.5, 1])
  })
})
