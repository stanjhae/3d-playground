import { describe, expect, test } from 'vitest'

import {
  HOUSE_LOOK_FALLBACK_ID,
  lookIdFromPathname,
} from './paths'

describe('lookIdFromPathname', () => {
  test('reads the current look id', () => {
    expect(lookIdFromPathname({ pathname: '/look/silk-01' })).toBe('silk-01')
  })

  test('returns null off the look route', () => {
    expect(lookIdFromPathname({ pathname: '/vote' })).toBeNull()
  })

  test('names the house fallback look', () => {
    expect(HOUSE_LOOK_FALLBACK_ID).toBe('look-midnight-silk')
  })
})
