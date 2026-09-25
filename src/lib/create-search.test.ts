import { describe, expect, test } from 'vitest'

import {
  createStudioHref,
  createStudioSearch,
  parseCreateSearch,
  parseCreateStep,
} from './create-search'

describe('create-search', () => {
  test('parses valid create steps and ignores junk', () => {
    expect(parseCreateStep({ value: 'design' })).toBe('design')
    expect(parseCreateStep({ value: 'preview' })).toBe('preview')
    expect(parseCreateStep({ value: 'nope' })).toBeUndefined()
    expect(parseCreateStep({ value: 3 })).toBeUndefined()
  })

  test('parses design, step, garment, color, and cut', () => {
    expect(
      parseCreateSearch({
        search: {
          design: 'look-1',
          step: 'color',
          garment: 'tee',
          color: '#F4EAD4',
          neck: 'v',
          hem: 'crop',
          sleeve: 'long',
          extra: true,
        },
      }),
    ).toEqual({
      design: 'look-1',
      step: 'color',
      garment: 'tee',
      color: '#f4ead4',
      neck: 'v',
      hem: 'crop',
      sleeve: 'long',
    })
    expect(parseCreateSearch({ search: { color: 'red', garment: 'nope' } })).toEqual(
      {},
    )
  })

  test('builds create studio hrefs', () => {
    expect(createStudioHref()).toBe('/create')
    expect(createStudioHref({ step: 'select' })).toBe('/create?step=select')
    expect(
      createStudioHref({
        design: 'look-1',
        step: 'share',
        garment: 'tee',
        color: '#111318',
      }),
    ).toBe('/create?step=share&design=look-1&garment=tee&color=%23111318')
  })

  test('createStudioSearch omits empty fields', () => {
    expect(createStudioSearch({ step: 'fit', garment: 'gown' })).toEqual({
      step: 'fit',
      garment: 'gown',
    })
  })
})
