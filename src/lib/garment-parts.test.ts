import { describe, expect, test } from 'vitest'

import { garmentParts, partLabel } from './garment-parts'

describe('garmentParts', () => {
  test('column only offers the body', () => {
    expect(garmentParts({ garmentId: 'column' }).map((part) => part.id)).toEqual([
      'body',
    ])
  })

  test('jacket keeps lining, collar, and hardware', () => {
    expect(garmentParts({ garmentId: 'jacket' }).map((part) => part.id)).toEqual([
      'body',
      'lining',
      'collar',
      'hardware',
    ])
  })
})

describe('partLabel', () => {
  test('reads the fashion panel from a prefixed mesh name', () => {
    expect(partLabel({ meshName: 'body-3' })).toBe('Body')
  })
})
