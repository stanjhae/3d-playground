import { describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'
import { resolveFetchedLook } from './fetched-look'

describe('resolveFetchedLook', () => {
  test('treats a network failure as an error, not a missing look', () => {
    expect(
      resolveFetchedLook({
        failed: true,
        design: createEmptyDesign({ id: 'look-1' }),
      }),
    ).toEqual({ status: 'error', design: null })
  })

  test('treats an unknown remix id as missing', () => {
    expect(resolveFetchedLook({ failed: false, design: null })).toEqual({
      status: 'missing',
      design: null,
    })
  })

  test('returns the loaded look', () => {
    const design = createEmptyDesign({ id: 'look-atelier-ivory' })

    expect(resolveFetchedLook({ failed: false, design })).toEqual({
      status: 'ready',
      design,
    })
  })
})
