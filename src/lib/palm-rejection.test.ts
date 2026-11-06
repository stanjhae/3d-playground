import { beforeEach, describe, expect, test } from 'vitest'

import { acceptsPointer, resetPalmRejection } from './palm-rejection'

describe('palm rejection', () => {
  beforeEach(() => {
    resetPalmRejection()
  })

  test('fingers draw until a pen is used, then only the pen and mouse do', () => {
    expect(acceptsPointer({ pointerType: 'touch' })).toBe(true)
    expect(acceptsPointer({ pointerType: 'pen' })).toBe(true)
    expect(acceptsPointer({ pointerType: 'touch' })).toBe(false)
    expect(acceptsPointer({ pointerType: 'mouse' })).toBe(true)
  })
})
