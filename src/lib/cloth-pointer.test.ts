import { beforeEach, describe, expect, test } from 'vitest'

import {
  clothDrag,
  crossClothDrag,
  endClothDrag,
  moveClothDrag,
  resetClothPointer,
  startClothDrag,
} from './cloth-pointer'

describe('cloth pointer', () => {
  beforeEach(() => {
    resetClothPointer()
  })

  const start = () =>
    startClothDrag({
      drag: {
        layerId: 'word-1',
        panel: 'front',
        originX: 0.5,
        originY: 0.5,
        startX: 0.4,
        startY: 0.5,
        startScale: 0.12,
        startRotation: 0,
      },
    })

  test('a move keeps the grab offset and pins to the panel edge', () => {
    start()

    expect(moveClothDrag({ x: 0.6, y: 0.45 })).toMatchObject({ x: 0.5, panel: 'front', scale: 0.12 })
    expect(moveClothDrag({ x: 0.6, y: 0.45 })?.y).toBeCloseTo(0.45)
    // Past the edge (the pointer carried on off the cloth): pinned, not lost.
    expect(moveClothDrag({ x: 1.7, y: -0.4 })).toMatchObject({ x: 1, y: 0 })
    expect(endClothDrag()).toBe(true)
    expect(endClothDrag()).toBe(false)
    expect(moveClothDrag({ x: 0.5, y: 0.5 })).toBeNull()
  })

  test('crossing a seam carries the layer to the new panel under the pointer', () => {
    start()

    expect(crossClothDrag({ panel: 'left', x: 0.1, y: 0.6 })).toMatchObject({ panel: 'left', x: 0.1, y: 0.6 })
    expect(clothDrag()?.panel).toBe('left')
    expect(moveClothDrag({ x: 0.3, y: 0.6 })).toMatchObject({ panel: 'left', y: 0.6 })
    expect(moveClothDrag({ x: 0.3, y: 0.6 })?.x).toBeCloseTo(0.3)
  })
})
