import { describe, expect, test } from 'vitest'

import { applyDesignOverrides } from './apply-overrides'

describe('applyDesignOverrides', () => {
  test('returns the same root reference', () => {
    const root = { name: 'garment' }

    const result = applyDesignOverrides({
      root,
      overrides: [{ meshName: 'collar' }],
    })

    expect(result).toBe(root)
  })
})
