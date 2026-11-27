import { beforeEach, describe, expect, test } from 'vitest'

import { PEN_REST_MS, acceptsPointer, resetPalmRejection } from './palm-rejection'

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

  test('a finger draws again once the pen has rested a while, and a pen nearby keeps it out', () => {
    expect(acceptsPointer({ pointerType: 'pen', now: 1_000 })).toBe(true)
    expect(acceptsPointer({ pointerType: 'touch', now: 1_000 + PEN_REST_MS - 1 })).toBe(false)
    // A pen hovering refreshes the window.
    expect(acceptsPointer({ pointerType: 'pen', now: 20_000 })).toBe(true)
    expect(acceptsPointer({ pointerType: 'touch', now: 1_000 + PEN_REST_MS + 1 })).toBe(false)
    expect(acceptsPointer({ pointerType: 'touch', now: 20_000 + PEN_REST_MS + 1 })).toBe(true)
  })
})
