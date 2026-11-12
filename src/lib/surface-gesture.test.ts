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
})
