import { describe, expect, test } from 'vitest'

import { garmentHasSleeves, sideViewAlt } from './garments'
import { garmentOfTemplate } from './template-manifest'

describe('the garment a saved design is on', () => {
  test('comes from its pinned template', () => {
    expect(garmentOfTemplate({ id: 'hoodie', version: 1 })).toBe('hoodie')
    expect(garmentOfTemplate({ id: 'tee-crew-short', version: '4' })).toBe('tee')
  })

  test('a version this build cannot open still names its garment by the template id', () => {
    expect(garmentOfTemplate({ id: 'gown', version: 99 })).toBe('gown')
  })

  test('only a design with no template is a tee', () => {
    expect(garmentOfTemplate({ id: null, version: null })).toBe('tee')
    expect(garmentOfTemplate({ id: 'not-a-template', version: 1 })).toBe('tee')
  })
})

describe('side views', () => {
  test('show sleeves on garments with sleeve panels, sides on those without', () => {
    expect(garmentHasSleeves({ garmentId: 'tee' })).toBe(true)
    expect(garmentHasSleeves({ garmentId: 'hoodie' })).toBe(true)
    expect(garmentHasSleeves({ garmentId: 'gown' })).toBe(false)
    expect(sideViewAlt({ alt: "wearer's right sleeve", garmentId: 'gown' })).toBe("wearer's right side")
    expect(sideViewAlt({ alt: "wearer's right sleeve", garmentId: 'hoodie' })).toBe("wearer's right sleeve")
  })
})
