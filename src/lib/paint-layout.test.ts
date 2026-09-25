import { describe, expect, test } from 'vitest'

import { angleStripPreset, paintSurfacePanels } from './paint-layout'

describe('paintSurfacePanels', () => {
  const panels = [
    { id: 'front' as const },
    { id: 'back' as const },
    { id: 'left' as const },
    { id: 'right' as const },
  ]

  test('quad on phone mounts only the active panel', () => {
    expect(
      paintSurfacePanels({
        layout: 'quad',
        paintPanel: 'back',
        panels,
        lgUp: false,
      }),
    ).toEqual(['back'])
  })

  test('quad on desktop mounts all four panels', () => {
    expect(
      paintSurfacePanels({
        layout: 'quad',
        paintPanel: 'front',
        panels,
        lgUp: true,
      }),
    ).toEqual(['front', 'back', 'left', 'right'])
  })

  test('single layout always mounts the active panel', () => {
    expect(
      paintSurfacePanels({
        layout: 'single',
        paintPanel: 'left',
        panels,
        lgUp: true,
      }),
    ).toEqual(['left'])
  })
})

describe('angleStripPreset', () => {
  test('maps orbit to the three-quarter strip slot', () => {
    expect(angleStripPreset({ cameraPreset: 'orbit' })).toBe('threeQuarter')
    expect(angleStripPreset({ cameraPreset: 'front' })).toBe('front')
    expect(angleStripPreset({ cameraPreset: 'back' })).toBe('back')
  })
})
