import { describe, expect, test } from 'vitest'

import {
  CREATE_STEPS,
  allowsDrawView,
  createStepLabel,
  forcesClothView,
  nextCreateStep,
  previousCreateStep,
  showsColorRail,
  showsDesignRails,
  showsDualStudio,
  showsPaintPane,
  showsPreviewRails,
  showsShareRail,
  showsSilhouetteRail,
  showsStructureRail,
} from './create-steps'

describe('create-steps', () => {
  test('lists the house create path', () => {
    expect(CREATE_STEPS.map((step) => step.id)).toEqual([
      'select',
      'fit',
      'color',
      'design',
      'preview',
      'share',
    ])
    expect(createStepLabel({ step: 'design' })).toBe('Design')
  })

  test('advances and retreats along the path', () => {
    expect(nextCreateStep({ step: 'select' })).toBe('fit')
    expect(nextCreateStep({ step: 'share' })).toBe('share')
    expect(previousCreateStep({ step: 'share' })).toBe('preview')
    expect(previousCreateStep({ step: 'select' })).toBe('select')
  })

  test('rails and studio view follow the active step', () => {
    expect(showsSilhouetteRail({ step: 'select' })).toBe(true)
    expect(showsStructureRail({ step: 'fit' })).toBe(true)
    expect(showsColorRail({ step: 'color' })).toBe(true)
    expect(showsDesignRails({ step: 'design' })).toBe(true)
    expect(showsPreviewRails({ step: 'preview' })).toBe(true)
    expect(showsShareRail({ step: 'share' })).toBe(true)
    expect(allowsDrawView({ step: 'design' })).toBe(true)
    expect(allowsDrawView({ step: 'preview' })).toBe(false)
    expect(forcesClothView({ step: 'preview' })).toBe(true)
    expect(showsPaintPane({ step: 'design' })).toBe(true)
    expect(showsPaintPane({ step: 'select' })).toBe(false)
    expect(showsDualStudio({ step: 'design' })).toBe(true)
    expect(showsDualStudio({ step: 'color' })).toBe(false)
  })
})
