import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  TEXT_FACE_TIMEOUT_MS,
  resetTextFaces,
  subscribeTextFaces,
  textCanvasFont,
  textFaceState,
  textFacesVersion,
} from './text-faces'

/** #155: a word waits for its face, then redraws; it never stays blank. */

function fakeFonts({ loaded = false, load }: { loaded?: boolean; load: () => Promise<unknown[]> }) {
  return {
    check: vi.fn(() => loaded),
    load: vi.fn(load) as unknown as FontFaceSet['load'],
  }
}

describe('textFaceState', () => {
  beforeEach(() => {
    resetTextFaces()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a face that is already loaded is ready at once', () => {
    const fonts = fakeFonts({ loaded: true, load: () => Promise.resolve([]) })

    expect(textFaceState({ face: 'display', text: 'FLP', fonts })).toBe('ready')
    expect(fonts.load).not.toHaveBeenCalled()
  })

  test('loads once, reports loading meanwhile, then ready with a redraw signal', async () => {
    let finish!: (faces: unknown[]) => void
    const fonts = fakeFonts({ load: () => new Promise((resolve) => (finish = resolve)) })
    const listener = vi.fn()
    const unsubscribe = subscribeTextFaces(listener)
    const before = textFacesVersion()

    expect(textFaceState({ face: 'sans', text: 'Hi', fonts })).toBe('loading')
    expect(textFaceState({ face: 'sans', text: 'Hi', fonts })).toBe('loading')
    expect(fonts.load).toHaveBeenCalledTimes(1)
    expect(fonts.load).toHaveBeenCalledWith('600 32px Outfit', 'Hi')

    finish([{}])
    await vi.runAllTimersAsync()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(textFacesVersion()).toBe(before + 1)
    expect(textFaceState({ face: 'sans', text: 'Hi', fonts })).toBe('ready')
    unsubscribe()
  })

  test('a face that never arrives settles as the fallback after the timeout', async () => {
    const fonts = fakeFonts({ load: () => new Promise(() => {}) })

    expect(textFaceState({ face: 'display', text: 'Жар', fonts })).toBe('loading')
    await vi.advanceTimersByTimeAsync(TEXT_FACE_TIMEOUT_MS)

    expect(textFaceState({ face: 'display', text: 'Жар', fonts })).toBe('failed')
  })

  test('a failed load, or no font API, settles as the fallback', async () => {
    const fonts = fakeFonts({ load: () => Promise.reject(new Error('offline')) })

    textFaceState({ face: 'display', text: 'x', fonts })
    await vi.runAllTimersAsync()

    expect(textFaceState({ face: 'display', text: 'x', fonts })).toBe('failed')
    expect(textFaceState({ face: 'sans', text: 'y', fonts: null })).toBe('failed')
  })
})

describe('textCanvasFont', () => {
  test('uses the face once ready, the fallback stack otherwise', () => {
    expect(textCanvasFont({ face: 'display', size: 20, state: 'ready' })).toMatch(/^600 20px "Cormorant Garamond", /)
    expect(textCanvasFont({ face: 'display', size: 20, state: 'loading' })).not.toContain('Cormorant')
    expect(textCanvasFont({ face: 'sans', size: 20, state: 'failed' })).not.toContain('Outfit')
  })
})

describe('rasterizeLayers while a face loads', () => {
  const fillText = vi.fn()

  beforeEach(() => {
    resetTextFaces()
    fillText.mockClear()
    let finish!: (faces: unknown[]) => void
    const fonts = {
      check: () => false,
      load: () => new Promise((resolve) => (finish = resolve)),
      finish: (faces: unknown[]) => finish(faces),
    }
    const context = {
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillText,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
    }
    vi.stubGlobal('document', {
      fonts,
      createElement: () => ({ getContext: () => context }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('the 2D panel draws the word in the fallback; the 3D view waits, then fills in', async () => {
    const { rasterizeLayers } = await import('./paint-atlas')
    const document = {
      garmentId: 'tee',
      garmentVersion: 2,
      structural: {},
      overrides: [],
      layers: [
        {
          id: 'w',
          kind: 'text',
          panel: 'front',
          content: 'FLP',
          face: 'display',
          color: '#1a1c22',
          x: 0.5,
          y: 0.5,
          scale: 0.1,
          rotation: 0,
          opacity: 1,
          visible: true,
        },
      ],
    } as unknown as Parameters<typeof rasterizeLayers>[0]['document']

    rasterizeLayers({ document, width: 8, height: 8, pendingText: 'skip' })
    expect(fillText).not.toHaveBeenCalled()

    rasterizeLayers({ document, width: 8, height: 8 })
    expect(fillText).toHaveBeenCalledWith('FLP', 0, 0)

    ;(globalThis.document.fonts as unknown as { finish: (faces: unknown[]) => void }).finish([{}])
    await new Promise((resolve) => setTimeout(resolve, 0))
    fillText.mockClear()

    rasterizeLayers({ document, width: 8, height: 8, pendingText: 'skip' })
    expect(fillText).toHaveBeenCalledWith('FLP', 0, 0)
  })
})
