import { describe, expect, test } from 'vitest'

import { isTypingTarget } from './walk-input'

describe('isTypingTarget', () => {
  test('ignores null and non-elements', () => {
    expect(isTypingTarget({ target: null })).toBe(false)
  })

  test('treats inputs and textareas as typing', () => {
    expect(isTypingTarget({ target: { tagName: 'INPUT' } })).toBe(true)
    expect(isTypingTarget({ target: { tagName: 'TEXTAREA' } })).toBe(true)
  })

  test('treats contenteditable as typing', () => {
    expect(
      isTypingTarget({
        target: { tagName: 'DIV', isContentEditable: true },
      }),
    ).toBe(true)
  })
})
