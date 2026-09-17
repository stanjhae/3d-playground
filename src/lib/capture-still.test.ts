import { describe, expect, test } from 'vitest'

import {
  canvasHasSceneFromPixels,
  captureFramedStill,
  isLiveStudioCanvas,
  lumaSpread,
  shouldEnterLook,
  type StudioCanvasProbe,
} from './capture-still'

function probe({
  width = 200,
  height = 200,
  offsetWidth = 200,
  offsetHeight = 200,
  isConnected = true,
  hidden = false,
  className = '',
  parent = null,
  display = 'block',
}: {
  width?: number
  height?: number
  offsetWidth?: number
  offsetHeight?: number
  isConnected?: boolean
  hidden?: boolean
  className?: string
  parent?: StudioCanvasProbe | null
  display?: string
} = {}): StudioCanvasProbe {
  const canvas: StudioCanvasProbe = {
    width,
    height,
    offsetWidth,
    offsetHeight,
    isConnected,
    hidden,
    className,
    parentElement: parent,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          display,
          visibility: 'visible',
        }),
      },
    },
  }

  return canvas
}

describe('shouldEnterLook', () => {
  test('blocks an empty still', () => {
    expect(shouldEnterLook({ thumbnailDataUrl: '' })).toBe(false)
  })

  test('lets a framed still enter', () => {
    expect(
      shouldEnterLook({ thumbnailDataUrl: 'data:image/jpeg;base64,abc' }),
    ).toBe(true)
  })
})

describe('isLiveStudioCanvas', () => {
  test('rejects a missing or hidden cloth canvas', () => {
    expect(isLiveStudioCanvas({ canvas: null })).toBe(false)
    expect(
      isLiveStudioCanvas({
        canvas: probe({ offsetWidth: 0, offsetHeight: 0 }),
      }),
    ).toBe(false)
    expect(isLiveStudioCanvas({ canvas: probe({ isConnected: false }) })).toBe(
      false,
    )
    expect(
      isLiveStudioCanvas({
        canvas: probe({ className: 'h-full hidden' }),
      }),
    ).toBe(false)
    expect(
      isLiveStudioCanvas({
        canvas: probe({
          parent: probe({ className: 'hidden', display: 'none' }),
        }),
      }),
    ).toBe(false)
  })

  test('accepts a visible cloth canvas', () => {
    expect(isLiveStudioCanvas({ canvas: probe() })).toBe(true)
  })
})

describe('canvas scene', () => {
  test('a black or empty buffer has no scene', () => {
    expect(lumaSpread({ pixels: [0, 0, 0, 255, 0, 0, 0, 255] })).toBe(0)
    expect(
      canvasHasSceneFromPixels({
        pixels: [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255],
      }),
    ).toBe(false)
  })

  test('a lit cloth has contrast', () => {
    expect(
      canvasHasSceneFromPixels({
        pixels: [12, 10, 8, 255, 240, 236, 220, 255],
      }),
    ).toBe(true)
  })
})

describe('captureFramedStill', () => {
  test('returns empty when the cloth is not live', async () => {
    await expect(captureFramedStill({ canvas: null })).resolves.toBe('')
  })
})
