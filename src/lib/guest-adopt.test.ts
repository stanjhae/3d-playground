import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { canonicalSketchHasWork, guestSketchSource } from './guest-adopt'

describe('guest sketch adoption', () => {
  test('a blank garment is not a sketch, and a changed colour is', () => {
    const blank = createEmptyCanonicalDocument()
    expect(canonicalSketchHasWork({ document: blank })).toBe(false)

    const colored = createEmptyCanonicalDocument()
    colored.base = { kind: 'solid', color: '#112233' }
    expect(canonicalSketchHasWork({ document: colored })).toBe(true)
  })

  test('the open sketch wins over the draft, and a blank visit saves nothing', () => {
    expect(guestSketchSource({ memoryIsCloud: false, memoryHasWork: true, draftHasWork: true })).toBe('memory')
    expect(guestSketchSource({ memoryIsCloud: false, memoryHasWork: false, draftHasWork: true })).toBe('draft')
    expect(guestSketchSource({ memoryIsCloud: false, memoryHasWork: false, draftHasWork: false })).toBe('none')
  })

  test('an open cloud design is the account’s already, so it is never saved again', () => {
    expect(guestSketchSource({ memoryIsCloud: true, memoryHasWork: true, draftHasWork: false })).toBe('none')
  })
})
