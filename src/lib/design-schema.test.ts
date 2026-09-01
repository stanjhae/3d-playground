import { describe, expect, test } from 'vitest'

import { createEmptyDesign, resolveGarmentId } from './design-schema'

describe('createEmptyDesign', () => {
  test('fills the frozen Design shape', () => {
    const design = createEmptyDesign({ id: 'look-1' })

    expect(design).toEqual({
      id: 'look-1',
      title: '',
      author: '',
      votes: 0,
      thumbnailDataUrl: '',
      overrides: [],
      garmentId: 'gown',
    })
  })
})

describe('resolveGarmentId', () => {
  test('keeps live column looks on the gown', () => {
    expect(resolveGarmentId({ garmentId: 'column' })).toBe('gown')
    expect(resolveGarmentId({ garmentId: 'gown' })).toBe('gown')
    expect(resolveGarmentId({})).toBe('gown')
    expect(resolveGarmentId({ garmentId: 'missing' })).toBe('gown')
  })

  test('keeps jacket and the new house forms', () => {
    expect(resolveGarmentId({ garmentId: 'jacket' })).toBe('jacket')
    expect(resolveGarmentId({ garmentId: 'slip' })).toBe('slip')
    expect(resolveGarmentId({ garmentId: 'mixed' })).toBe('mixed')
    expect(resolveGarmentId({ garmentId: 'coat' })).toBe('coat')
    expect(resolveGarmentId({ garmentId: 'suit' })).toBe('suit')
  })
})
