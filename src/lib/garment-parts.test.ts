import { describe, expect, test } from 'vitest'

import { garmentParts, garmentSrc, partLabel } from './garment-parts'
import { garmentCredit, listRailGarments } from './garments'

describe('garmentParts', () => {
  test('live column looks still offer the gown body', () => {
    expect(garmentParts({ garmentId: 'column' }).map((part) => part.id)).toEqual(
      ['body'],
    )
    expect(garmentParts({ garmentId: 'gown' }).map((part) => part.id)).toEqual([
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

  test('shirt and skirt expose cloth and hardware', () => {
    expect(garmentParts({ garmentId: 'mixed' }).map((part) => part.id)).toEqual([
      'body',
      'skirt',
      'hardware',
    ])
  })

  test('coat and suit keep tailoring panels', () => {
    expect(garmentParts({ garmentId: 'coat' }).map((part) => part.id)).toEqual([
      'body',
      'hardware',
    ])
    expect(garmentParts({ garmentId: 'suit' }).map((part) => part.id)).toEqual([
      'body',
      'hardware',
    ])
    expect(garmentParts({ garmentId: 'slip' }).map((part) => part.id)).toEqual([
      'body',
    ])
  })
})

describe('partLabel', () => {
  test('reads the fashion panel from a prefixed mesh name', () => {
    expect(partLabel({ meshName: 'body-3' })).toBe('Body')
    expect(partLabel({ meshName: 'skirt-front' })).toBe('Skirt')
  })
})

describe('listRailGarments', () => {
  test('shows the five house names and hides the jacket', () => {
    expect(listRailGarments().map((garment) => garment.id)).toEqual([
      'gown',
      'slip',
      'mixed',
      'coat',
      'suit',
    ])
  })
})

describe('garmentCredit', () => {
  test('hides the house jacket and names the seated gown', () => {
    expect(garmentCredit({ garmentId: 'jacket' })).toBeUndefined()
    expect(garmentCredit({ garmentId: 'column' })?.label).toBe(
      'Gown by Style3D CG',
    )
    expect(garmentCredit({ garmentId: 'slip' })?.label).toBe(
      'Slip by Style3D CG',
    )
    expect(garmentCredit({ garmentId: 'coat' })?.label).toBe(
      'Coat by Style3D CG',
    )
    expect(garmentCredit({ garmentId: 'suit' })?.label).toBe(
      'Suit by Style3D CG',
    )
  })
})

describe('garmentSrc', () => {
  test('maps each form onto its seated file', () => {
    expect(garmentSrc({ garmentId: 'column' })).toBe('/models/garment.glb')
    expect(garmentSrc({ garmentId: 'gown' })).toBe('/models/garment.glb')
    expect(garmentSrc({ garmentId: 'slip' })).toBe('/models/slip.glb')
    expect(garmentSrc({ garmentId: 'mixed' })).toBe('/models/mixed.glb')
    expect(garmentSrc({ garmentId: 'coat' })).toBe('/models/coat.glb')
    expect(garmentSrc({ garmentId: 'suit' })).toBe('/models/suit.glb')
    expect(garmentSrc({ garmentId: 'jacket' })).toBe('/models/jacket.glb')
    expect(garmentSrc({ garmentId: 'missing' })).toBe('/models/garment.glb')
  })
})
