import { describe, expect, test } from 'vitest'

import { renderGlyphCoverage } from '../../scripts/glyph-coverage.mjs'
import { GLYPH_COVERAGE } from './glyph-coverage.gen'
import { faceCovers, glyphMessage, unsupportedCharacters } from './glyph-coverage'
import generated from './glyph-coverage.gen.ts?raw'

/** #155: words are checked against what their bundled face can draw. */

describe('the generated coverage table', () => {
  test('matches the bundled font files (run node scripts/glyph-coverage.mjs)', () => {
    expect(generated).toBe(renderGlyphCoverage())
  })

  test('is sorted, non-overlapping inclusive ranges', () => {
    for (const ranges of Object.values(GLYPH_COVERAGE)) {
      expect(ranges.length % 2).toBe(0)

      for (let index = 0; index < ranges.length; index += 2) {
        expect(ranges[index]!).toBeLessThanOrEqual(ranges[index + 1]!)
        if (index > 0) expect(ranges[index]!).toBeGreaterThan(ranges[index - 1]! + 1)
      }
    }
  })
})

describe('faceCovers', () => {
  test('both faces draw printable ASCII', () => {
    for (let codePoint = 0x20; codePoint <= 0x7e; codePoint += 1) {
      expect(faceCovers({ face: 'display', codePoint })).toBe(true)
      expect(faceCovers({ face: 'sans', codePoint })).toBe(true)
    }
  })

  test('display ships Cyrillic and Vietnamese; sans does not', () => {
    for (const character of ['Ж', 'ợ']) {
      const codePoint = character.codePointAt(0)!
      expect(faceCovers({ face: 'display', codePoint })).toBe(true)
      expect(faceCovers({ face: 'sans', codePoint })).toBe(false)
    }
  })

  test('neither draws CJK or emoji', () => {
    for (const character of ['字', '😀']) {
      const codePoint = character.codePointAt(0)!
      expect(faceCovers({ face: 'display', codePoint })).toBe(false)
      expect(faceCovers({ face: 'sans', codePoint })).toBe(false)
    }
  })
})

describe('unsupportedCharacters', () => {
  test('is empty for drawable text, accents included', () => {
    expect(unsupportedCharacters({ text: 'Café Ødegaard — “Ça va?”', face: 'sans' })).toEqual([])
    // "e" plus a combining acute composes to "é".
    expect(unsupportedCharacters({ text: 'Café', face: 'sans' })).toEqual([])
  })

  test('names each undrawable character once, emoji clusters whole', () => {
    expect(unsupportedCharacters({ text: '字A字👍🏽B', face: 'display' })).toEqual(['字', '👍🏽'])
  })
})

describe('glyphMessage', () => {
  test('suggests the other face when it can draw the word', () => {
    expect(glyphMessage({ text: 'ПРИВЕТ', face: 'sans' })).toBe(
      'The sans face can\'t draw “П”, “Р”, “И”, “В” or “Е” (and 1 more). Remove them or switch to Display.',
    )
  })

  test('only says remove when neither face can', () => {
    expect(glyphMessage({ text: 'Hi 字', face: 'display' })).toBe(
      'The display face can\'t draw “字”. Remove it.',
    )
  })

  test('is null for drawable text', () => {
    expect(glyphMessage({ text: 'FLP 2026', face: 'display' })).toBeNull()
  })
})
