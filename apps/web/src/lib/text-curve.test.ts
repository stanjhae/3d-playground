import { describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import {
  CANONICAL_TEXT_FACES,
  type CanonicalDocument,
  type CanonicalTextLayer,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { GLYPH_COVERAGE } from './glyph-coverage.gen'
import { faceCovers } from './glyph-coverage'
import { arcGeometry, arcGlyph, curvedBox } from './text-curve'
import { TEXT_FACE_CATALOGUE } from './text-face-catalogue'

// Tester, 22 Nov: more fonts, and words along an arc or round a circle.

const word = (extra: Partial<CanonicalTextLayer> = {}): CanonicalTextLayer => ({
  id: 'text-front',
  kind: 'text',
  visible: true,
  opacity: 1,
  content: 'CLUB',
  face: 'sans',
  color: '#1a1c22',
  x: 0.5,
  y: 0.5,
  scale: 0.2,
  rotation: 0,
  ...extra,
})

const withWord = (layer: CanonicalTextLayer): CanonicalDocument => {
  const document = createEmptyCanonicalDocument()
  document.panels.front!.layers.push(layer)
  return document
}

const valid = (document: CanonicalDocument) => validateCanonicalDocument({ value: document }).ok

describe('the arc a word is set on', () => {
  test('straight is no arc', () => {
    expect(arcGeometry({ length: 100, curve: 0 })).toBeNull()
  })

  test('a full turn closes the circle: its circumference is the word', () => {
    const arc = arcGeometry({ length: 100, curve: 1 })!
    expect(arc.sweep).toBeCloseTo(Math.PI * 2)
    expect(2 * Math.PI * arc.radius).toBeCloseTo(100)
    expect(arc.sagitta).toBeCloseTo(2 * arc.radius)
  })

  test('the middle glyph sits on the word’s place and upright; the ends bend away', () => {
    const arc = arcGeometry({ length: 100, curve: 0.25 })!
    const middle = arcGlyph({ arc, offset: 0 })
    const end = arcGlyph({ arc, offset: 50 })

    expect(middle.x).toBeCloseTo(0)
    expect(middle.rotation).toBeCloseTo(0)
    // Up-bend: the ends sit lower on the canvas (y down) than the middle.
    expect(end.y).toBeGreaterThan(middle.y)
    expect(end.rotation).toBeGreaterThan(0)
    // The arc's box is centred on the word's place.
    expect(middle.y + end.y).toBeCloseTo(0)
  })

  test('a down-bend mirrors it', () => {
    const up = arcGlyph({ arc: arcGeometry({ length: 100, curve: 0.25 })!, offset: 50 })
    const down = arcGlyph({ arc: arcGeometry({ length: 100, curve: -0.25 })!, offset: 50 })

    expect(down.x).toBeCloseTo(up.x)
    expect(down.y).toBeCloseTo(-up.y)
    expect(down.rotation).toBeCloseTo(-up.rotation)
  })

  test('a curved word’s box is narrower and taller than the straight one', () => {
    const box = curvedBox({ width: 0.4, height: 0.1, curve: 0.3 })
    expect(box.width).toBeLessThan(0.4 + 0.1)
    expect(box.height).toBeGreaterThan(0.1)
  })
})

describe('a word’s saved arc', () => {
  test('runs −1…1 and is left out when straight', () => {
    expect(valid(withWord(word({ curve: 0.5 })))).toBe(true)
    expect(valid(withWord(word({ curve: -1 })))).toBe(true)
    expect(valid(withWord(word({ curve: 1.2 })))).toBe(false)
    expect(valid(withWord(word({ curve: 0 })))).toBe(false)
    expect(serializeCanonicalDocument({ document: withWord(word()) })).not.toContain('curve')
  })

  test('an edit sets it, and straight again removes it', () => {
    const bent = applyCanonicalCommand({
      stack: createCanonicalStack({ document: withWord(word()) }),
      command: { type: 'updateLayer', layerId: 'text-front', patch: { curve: 0.4 } },
    })
    expect(bent.ok).toBe(true)
    expect((bent.stack.document.panels.front!.layers[0] as CanonicalTextLayer).curve).toBe(0.4)

    const straight = applyCanonicalCommand({ stack: bent.stack, command: { type: 'updateLayer', layerId: 'text-front', patch: { curve: 0 } } })
    expect(straight.ok).toBe(true)
    expect('curve' in straight.stack.document.panels.front!.layers[0]!).toBe(false)
  })
})

describe('the text faces', () => {
  test('every face is catalogued, has glyph coverage and draws plain letters', () => {
    for (const face of CANONICAL_TEXT_FACES) {
      expect(TEXT_FACE_CATALOGUE[face].face).toBe(face)
      expect(GLYPH_COVERAGE[face].length).toBeGreaterThan(0)

      for (const character of 'AZaz09') {
        expect(faceCovers({ face, codePoint: character.codePointAt(0)! }), `${face} draws ${character}`).toBe(true)
      }
    }
  })

  test('each face can be saved on a word', () => {
    for (const face of CANONICAL_TEXT_FACES) {
      expect(valid(withWord(word({ face }))), face).toBe(true)
    }
  })
})
