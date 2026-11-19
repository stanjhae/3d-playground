import { describe, expect, it } from 'vitest'

import { surfaceGesture } from './surface-gesture'

describe('surfaceGesture', () => {
  it('inks only with the Draw tool on', () => {
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: false, rotatingView: false })).toBe('stroke')

    for (const designTool of ['text', 'graphics', 'upload'] as const) {
      expect(surfaceGesture({ designTool, wordArmed: false, hitsLayer: false, rotatingView: false })).toBe('none')
    }
  })

  it('leaves the press to the orbit while Rotate view is held', () => {
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: true, rotatingView: true })).toBe('none')
  })

  it('drags a placed graphic with any tool', () => {
    expect(surfaceGesture({ designTool: 'graphics', wordArmed: false, hitsLayer: true, rotatingView: false })).toBe('drag-layer')
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: true, rotatingView: false })).toBe('drag-layer')
  })

  it('places an armed word on bare cloth, but a press on a mark grabs the mark', () => {
    expect(surfaceGesture({ designTool: 'text', wordArmed: true, hitsLayer: false, rotatingView: false })).toBe('place-text')
    expect(surfaceGesture({ designTool: 'text', wordArmed: true, hitsLayer: true, rotatingView: false })).toBe('drag-layer')
  })

  it('turns instead of drawing on the 3D cloth while the camera is on Orbit', () => {
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: false, rotatingView: false, orbiting: true })).toBe('none')
    // A view such as Front draws again; the flat panels never orbit.
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: false, rotatingView: false, orbiting: false })).toBe('stroke')
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: false, rotatingView: false })).toBe('stroke')
    // A placed mark is still grabbed on purpose.
    expect(surfaceGesture({ designTool: 'draw', wordArmed: false, hitsLayer: true, rotatingView: false, orbiting: true })).toBe('drag-layer')
  })
})
