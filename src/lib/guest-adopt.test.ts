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
    expect(guestSketchSource({ memoryHasWork: true, draftHasWork: true })).toBe('memory')
    expect(guestSketchSource({ memoryHasWork: false, draftHasWork: true })).toBe('draft')
    expect(guestSketchSource({ memoryHasWork: false, draftHasWork: false })).toBe('none')
  })
})
