// Measures the procedural tee (@3); must load before the store.
import './testing/procedural-tee'
import { describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import { type CanonicalDocument, createEmptyCanonicalDocument } from './canonical-document'
import { rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

/**
 * The atlas draws a panel's layers in the order the layer list shows them:
 * whatever is above in the panel's stack covers what is below, paint and
 * words alike, on a striped base, and a move in the stack moves the render.
 */

const SIZE = 256
const INK = '#6b1d2a'
const WORD = '#00ff00'

function design({ inkOpacity = 1 }: { inkOpacity?: number } = {}): CanonicalDocument {
  const value = createEmptyCanonicalDocument()
  value.base = { kind: 'stripes', colors: ['#e8c4bc', '#1a1c22'], period: 0.08, angle: 0 }
  // Drawn first, then the word typed over it: the word is on top.
  value.panels.front.layers = [
    {
      id: 'ink',
      kind: 'paint',
      visible: true,
      opacity: inkOpacity,
      strokes: [{ id: 'ink-1', tool: 'brush', color: INK, width: 0.2, opacity: 1, points: [0.1, 0.38, 0.9, 0.38] }],
    },
    {
      id: 'maison',
      kind: 'text',
      visible: true,
      opacity: 1,
      x: 0.5,
      y: 0.38,
      scale: 0.12,
      rotation: 0,
      content: 'MAISON',
      face: 'display',
      color: WORD,
    },
  ]
  return value
}

function atlas({ value }: { value: CanonicalDocument }) {
  return rasterizeLayers({ document: toRenderDocument({ document: value }).document, width: SIZE, height: SIZE })
}

function only({ value, layerId }: { value: CanonicalDocument; layerId: string }) {
  const copy = structuredClone(value)
  copy.base = { kind: 'solid', color: '#ffffff' }
  copy.panels.front.layers = copy.panels.front.layers.filter((layer) => layer.id === layerId)
  return atlas({ value: copy }).pixels
}

/** Pixels the word fills outright and the ink also reaches. */
function overlap({ value }: { value: CanonicalDocument }) {
  const word = only({ value, layerId: 'maison' })
  const ink = only({ value, layerId: 'ink' })
  const shared: number[] = []

  for (let index = 0; index < word.length; index += 4) {
    if (word[index + 3] === 255 && ink[index + 3]! > 0) {
      shared.push(index)
    }
  }

  return shared
}

function move({ value, toIndex }: { value: CanonicalDocument; toIndex: number }) {
  const result = applyCanonicalCommand({
    stack: createCanonicalStack({ document: value }),
    command: { type: 'moveLayer', layerId: 'maison', toIndex },
  })

  if (!result.ok) {
    throw new Error('move rejected')
  }

  return result.stack.document
}

const hex = (pixels: Uint8ClampedArray, index: number) =>
  `#${[pixels[index]!, pixels[index + 1]!, pixels[index + 2]!].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`

describe('render order follows the layer stack (paint vs text)', () => {
  for (const inkOpacity of [1, 0.6]) {
    test(`a word above ${inkOpacity < 1 ? 'translucent ' : ''}ink covers it, and covers none of it once sent to the back`, () => {
      const top = design({ inkOpacity })
      const shared = overlap({ value: top })
      expect(shared.length).toBeGreaterThan(0)

      const wordOnTop = atlas({ value: top }).pixels
      expect(shared.every((index) => hex(wordOnTop, index) === WORD)).toBe(true)

      const back = move({ value: top, toIndex: 0 })
      expect(back.panels.front.layers.map((layer) => layer.id)).toEqual(['maison', 'ink'])
      const inkOnTop = atlas({ value: back }).pixels
      expect(shared.some((index) => hex(inkOnTop, index) === WORD)).toBe(false)

      if (inkOpacity === 1) {
        expect(shared.every((index) => hex(inkOnTop, index) === INK)).toBe(true)
      }

      // And back to the front: the render follows the stack both ways.
      const front = move({ value: back, toIndex: 1 })
      expect(atlas({ value: front }).pixels).toEqual(wordOnTop)
    })
  }
})
