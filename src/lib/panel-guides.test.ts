import { describe, expect, test } from 'vitest'

import { panelGuides } from './panel-guides'

describe('panel guides', () => {
  test('the front and back show the chest line and the collar band from the template', () => {
    const front = panelGuides({ panel: 'front' })!
    expect(front.chestFromTop).toBeCloseTo(1 - 0.691, 3)
    expect(front.collarFromTop).toBeCloseTo(1 - 0.861, 3)
    expect(front.chestLabel).toBe('Chest')
    expect(panelGuides({ panel: 'back' })!.chestLabel).toBe('Shoulder blades')
  })

  test('sleeves have no torso guides', () => {
    expect(panelGuides({ panel: 'left' })).toBeNull()
    expect(panelGuides({ panel: 'right' })).toBeNull()
  })
})
