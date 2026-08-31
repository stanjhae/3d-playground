import { describe, expect, test } from 'vitest'

import { formatLookTitle, resolveDraftTitle } from './look-title'

describe('formatLookTitle', () => {
  test('pads the serial', () => {
    expect(formatLookTitle({ fabricName: 'Ivory Silk', serial: 4 })).toBe(
      'Ivory Silk 04',
    )
  })
})

describe('resolveDraftTitle', () => {
  test('prefers an explicit title', () => {
    expect(
      resolveDraftTitle({
        title: 'Midnight Silk 04',
        storeTitle: 'Guest Look',
        fabricName: 'Look',
        serial: 1,
      }),
    ).toBe('Midnight Silk 04')
  })

  test('treats an empty store title as missing', () => {
    expect(
      resolveDraftTitle({
        storeTitle: '',
        fabricName: 'Ivory Silk',
        serial: 1,
      }),
    ).toBe('Ivory Silk 01')
  })

  test('uses the store title when present', () => {
    expect(
      resolveDraftTitle({
        storeTitle: 'Oxblood Leather 02',
        fabricName: 'Look',
        serial: 9,
      }),
    ).toBe('Oxblood Leather 02')
  })
})
