import { describe, expect, test } from 'vitest'

import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
import { type CanonicalDocument, type CanonicalStroke, CANONICAL_PANEL_IDS, createEmptyCanonicalDocument } from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { atlasPixelAtPanel, rasterizeLayers } from './paint-atlas'
import { DEFAULT_PANEL_UV } from './panel-uv'
import { toRenderDocument } from './render-projection'

/**
 * E05 #159: erasing on one paint layer touches only that layer. The
 * stored document of every sibling layer and every other panel stays
 * byte-identical, and so do the atlas pixels outside the eraser's path.
 * Under the path, an eraser clears only its own layer's strokes, whatever
 * the layer's opacity: paint, words and the base pattern beneath stay
 * (#158, docs/canonical-document.md).
 */

const SIZE = 256

function brush({ id, y }: { id: string; y: number }): CanonicalStroke {
  return { id, tool: 'brush', color: '#1a1c22', width: 0.06, opacity: 1, points: [0.2, y, 0.8, y] }
}

/** Front: paint A under paint B, plus words; every other panel inked too. */
function document({ opacityB = 1 }: { opacityB?: number } = {}): CanonicalDocument {
  const value = createEmptyCanonicalDocument()
  value.panels.front.layers = [
    { id: 'paint-a', kind: 'paint', visible: true, opacity: 1, strokes: [brush({ id: 'a-1', y: 0.5 })] },
    { id: 'paint-b', kind: 'paint', visible: true, opacity: opacityB, strokes: [brush({ id: 'b-1', y: 0.3 })] },
    {
      id: 'words',
      kind: 'text',
      visible: true,
      opacity: 1,
      x: 0.5,
      y: 0.8,
      scale: 0.1,
      rotation: 0,
      content: 'KEEP',
      face: 'sans',
      color: '#111111',
    },
  ]

  for (const panel of ['back', 'left', 'right'] as const) {
    value.panels[panel].layers = [
      { id: `paint-${panel}`, kind: 'paint', visible: true, opacity: 1, strokes: [brush({ id: `${panel}-1`, y: 0.5 })] },
    ]
  }

  return value
}

/** A vertical eraser pass down the middle of the front, through both strokes. */
const ERASER: CanonicalStroke = { id: 'erase-1', tool: 'eraser', width: 0.08, points: [0.5, 0.1, 0.5, 0.9] }

function erase({ before }: { before: CanonicalDocument }) {
  const result = applyCanonicalCommand({
    stack: createCanonicalStack({ document: before }),
    command: { type: 'addStroke', panel: 'front', layerId: 'paint-b', stroke: ERASER },
  })

  if (!result.ok) {
    throw new Error('eraser stroke rejected')
  }

  return result.stack.document
}

function atlas({ value }: { value: CanonicalDocument }) {
  return rasterizeLayers({ document: toRenderDocument({ document: value }).document, width: SIZE, height: SIZE })
}

const json = (value: unknown) => JSON.stringify(value)
const samePixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((value, index) => value === b[index])

describe('erasing on one paint layer (#159)', () => {
  test('sibling layers and other panels stay byte-identical in the stored document', () => {
    const before = document()
    const after = erase({ before })
    const [a, b, words] = after.panels.front.layers

    expect(json(a)).toBe(json(before.panels.front.layers[0]))
    expect(json(words)).toBe(json(before.panels.front.layers[2]))
    expect(b?.kind === 'paint' && b.strokes.map((stroke) => stroke.id)).toEqual(['b-1', 'erase-1'])

    for (const panel of CANONICAL_PANEL_IDS.filter((id) => id !== 'front')) {
      expect(json(after.panels[panel]), panel).toBe(json(before.panels[panel]))
    }

    // Base and template are untouched too: only paint B's strokes differ.
    const restoredB = structuredClone(after)
    const paintB = restoredB.panels.front.layers[1]!
    if (paintB.kind === 'paint') paintB.strokes = paintB.strokes.filter((stroke) => stroke.id !== 'erase-1')
    expect(serializeCanonicalDocument({ document: restoredB })).toBe(serializeCanonicalDocument({ document: before }))
  })

  for (const opacityB of [1, 0.6]) {
    test(`atlas: only the front, and only under the eraser, changes (layer opacity ${opacityB})`, () => {
      const before = atlas({ value: document({ opacityB }) })
      const after = atlas({ value: erase({ before: document({ opacityB }) }) })
      const front = DEFAULT_PANEL_UV.front
      // The eraser runs down front x 0.5 (u 0.25). A dot's radius is at most
      // 1.25 × the stroke width in atlas units (full pressure), plus soft edge.
      const reach = 1.25 * ERASER.width + 1.5 / SIZE
      let changed = 0

      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          const at = (row * SIZE + column) * 4
          const same = [0, 1, 2, 3].every((channel) => before.pixels[at + channel] === after.pixels[at + channel])

          if (same) {
            continue
          }

          changed += 1
          const u = (column + 0.5) / SIZE
          const v = 1 - (row + 0.5) / SIZE
          const onFront = u >= front.u0 && u <= front.u1 && v >= front.v0 && v <= front.v1

          expect(onFront, `pixel ${column},${row} off the front changed`).toBe(true)
          expect(Math.abs(u - 0.25), `pixel ${column},${row} outside the eraser changed`).toBeLessThanOrEqual(reach)
        }
      }

      expect(changed).toBeGreaterThan(0)

      // Under the eraser, B's own stroke is gone either way.
      expect(atlasPixelAtPanel({ buffer: after, panel: 'front', x: 0.5, y: 0.3 }).a).toBe(0)
      // A's stroke beneath is kept, under an opaque layer's eraser too.
      expect(atlasPixelAtPanel({ buffer: after, panel: 'front', x: 0.5, y: 0.5 })).toEqual(
        atlasPixelAtPanel({ buffer: before, panel: 'front', x: 0.5, y: 0.5 }),
      )
      // A's stroke away from the eraser is exactly as it was.
      expect(atlasPixelAtPanel({ buffer: after, panel: 'front', x: 0.25, y: 0.5 })).toEqual(
        atlasPixelAtPanel({ buffer: before, panel: 'front', x: 0.25, y: 0.5 }),
      )
    })
  }

  test('an eraser with none of its own ink beneath changes no pixel: paint, words and pattern stay', () => {
    const value = document()
    value.base = { kind: 'check', colors: ['#f4ead4', '#2b3a67'], period: 0.08 }
    const [a, b, words] = value.panels.front.layers
    // Words between A and B, and B's only stroke well left of the eraser.
    value.panels.front.layers = [a!, words!, { ...b!, strokes: [{ ...brush({ id: 'b-1', y: 0.3 }), points: [0.1, 0.3, 0.2, 0.3] }] } as typeof b & object]

    const before = atlas({ value })
    const after = atlas({ value: erase({ before: value }) })

    expect(samePixels(after.pixels, before.pixels)).toBe(true)
  })

  test('a live eraser previews exactly what it commits', () => {
    const before = document()
    const committed = toRenderDocument({ document: erase({ before }) }).document
    const paintB = committed.layers.find((layer) => layer.id === 'paint-b')
    const live = paintB?.kind === 'paint' ? paintB.strokes.at(-1) : undefined

    expect(live?.tool).toBe('eraser')

    const preview = rasterizeLayers({
      document: toRenderDocument({ document: before }).document,
      extraStroke: live,
      extraStrokeLayerId: 'paint-b',
      width: SIZE,
      height: SIZE,
    })

    expect(samePixels(preview.pixels, atlas({ value: erase({ before }) }).pixels)).toBe(true)
  })

  test('a live eraser that starts a new layer erases nothing', () => {
    const before = document()
    const committed = toRenderDocument({ document: erase({ before }) }).document
    const paintB = committed.layers.find((layer) => layer.id === 'paint-b')
    const live = paintB?.kind === 'paint' ? paintB.strokes.at(-1) : undefined
    const base = toRenderDocument({ document: before }).document

    const preview = rasterizeLayers({ document: base, extraStroke: live, extraStrokeLayerId: 'paint-new', width: SIZE, height: SIZE })

    expect(samePixels(preview.pixels, atlas({ value: before }).pixels)).toBe(true)
  })
})
