import { describe, expect, test } from 'vitest'

import {
  isBoardVisibleLook,
  isLinkVisibleLook,
  resolveDesignVisibility,
} from './design-schema'

describe('design visibility', () => {
  test('defaults missing visibility to public', () => {
    expect(resolveDesignVisibility({ visibility: undefined })).toBe('public')
    expect(isBoardVisibleLook({ design: {} })).toBe(true)
    expect(isLinkVisibleLook({ design: {} })).toBe(true)
  })

  test('private is hidden from board and direct links', () => {
    expect(isBoardVisibleLook({ design: { visibility: 'private' } })).toBe(false)
    expect(isLinkVisibleLook({ design: { visibility: 'private' } })).toBe(false)
  })

  test('unlisted is off the board but linkable', () => {
    expect(isBoardVisibleLook({ design: { visibility: 'unlisted' } })).toBe(
      false,
    )
    expect(isLinkVisibleLook({ design: { visibility: 'unlisted' } })).toBe(true)
  })
})
