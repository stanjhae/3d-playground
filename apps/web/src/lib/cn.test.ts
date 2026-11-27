import { describe, expect, test } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  test('keeps object keys that are on', () => {
    expect(
      cn('min-h-11', { 'border-brass': true, 'border-atelier-line': false }),
    ).toBe('min-h-11 border-brass')
  })
})
