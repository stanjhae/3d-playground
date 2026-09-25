import { beforeEach, describe, expect, test } from 'vitest'

import { panelPointToUv } from './panel-uv'
import {
  endClothDrag,
  moveClothDragOnUv,
  resetClothPointer,
  startClothDrag,
} from './cloth-pointer'

describe('cloth pointer', () => {
  beforeEach(() => {
    resetClothPointer()
  })

  test('a move onto another panel stays in the chest panel', () => {
    const origin = panelPointToUv({ panel: 'front', x: 0.5, y: 0.5 })

    startClothDrag({
      drag: {
        layerId: 'word-1',
        panel: 'front',
        originX: 0.5,
        originY: 0.5,
        startX: 0.5,
        startY: 0.5,
        startScale: 0.12,
        startRotation: 0,
      },
    })

    const other = panelPointToUv({ panel: 'back', x: 0.5, y: 0.5 })
    const jumped = moveClothDragOnUv({ u: other.u, v: other.v })
    const stayed = moveClothDragOnUv({ u: origin.u, v: origin.v })

    expect(jumped?.x).toBeCloseTo(1)
    expect(jumped?.y).toBeCloseTo(0.5)
    expect(stayed?.x).toBeCloseTo(0.5)
    expect(stayed?.y).toBeCloseTo(0.5)
    expect(endClothDrag()).toBe(true)
    expect(endClothDrag()).toBe(false)
  })
})
