import { describe, expect, test } from 'vitest'

import { createCrossFlameDemoDocument } from './cross-flame-demo'
import { isSafeLayerSrc } from './look-thumbnail'

describe('createCrossFlameDemoDocument', () => {
  test('seeds a tee with safe graphic srcs', () => {
    const document = createCrossFlameDemoDocument()

    expect(document.garmentId).toBe('tee')
    const graphics = document.layers.filter((layer) => layer.kind === 'graphic')
    expect(graphics.length).toBeGreaterThanOrEqual(3)

    for (const layer of graphics) {
      if (layer.kind === 'graphic') {
        expect(isSafeLayerSrc({ src: layer.src })).toBe(true)
      }
    }
  })
})
