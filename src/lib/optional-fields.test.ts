import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type CanonicalLayer,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { atlasPixelAtPanel, createAtlasBuffer, rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

/**
 * Optional fields a later release writes: flips and locks on layers, and
 * pen pressure on strokes. This release reads and draws them, so a design
 * written by the next one still opens here if that one is rolled back.
 */

const ASSET = 'asset_optional01'
const SRC = '/optional/asset.png'

function withFront(layers: CanonicalLayer[]): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.panels.front.layers = layers
  return document
}

function image(extra: Partial<Extract<CanonicalLayer, { kind: 'image' }>> = {}): CanonicalLayer {
  return { id: 'img', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 1, x: 0.5, y: 0.5, scale: 0.5, rotation: 0, ...extra }
}

function stroke(extra: Record<string, unknown> = {}): CanonicalLayer {
  return {
    id: 'paint',
    kind: 'paint',
    visible: true,
    opacity: 1,
    strokes: [{ id: 's', tool: 'brush', color: '#1a1c22', width: 0.05, opacity: 1, points: [0.2, 0.5, 0.5, 0.5, 0.8, 0.5], ...extra }],
  }
}

function issuesOf(document: unknown) {
  const result = validateCanonicalDocument({ value: document })
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

/** Red rises left to right, so a mirror shows as red falling instead. */
function gradient() {
  const buffer = createAtlasBuffer({ width: 16, height: 16 })

  for (let index = 0; index < 16 * 16; index += 1) {
    buffer.pixels[index * 4] = (index % 16) * 16
    buffer.pixels[index * 4 + 3] = 255
  }

  return buffer
}

function draw(document: CanonicalDocument) {
  const { document: render } = toRenderDocument({ document, assetSources: { [ASSET]: SRC } })
  return rasterizeLayers({ document: render, width: 512, height: 512, images: { [SRC]: gradient() } })
}

describe('reading the optional fields', () => {
  test('a document using every optional field is valid and keeps them through a save', () => {
    const document = withFront([
      { ...stroke({ pressures: [0.2, 0.9, 0.4] }), locked: true } as CanonicalLayer,
      image({ flipX: true, flipY: true, locked: true }),
      { id: 'word', kind: 'text', visible: true, opacity: 1, x: 0.5, y: 0.3, scale: 0.1, rotation: 0, content: 'FLP', face: 'sans', color: '#1a1c22', flipX: true },
    ])

    expect(issuesOf(document)).toEqual([])
    expect(issuesOf(JSON.parse(serializeCanonicalDocument({ document })))).toEqual([])
    expect(serializeCanonicalDocument({ document })).toContain('"pressures":[0.2,0.9,0.4]')
  })

  test('a flag is written only when on, and only where it means something', () => {
    expect(issuesOf(withFront([image({ flipX: false as unknown as true })]))).toEqual([
      '$.panels.front.layers[0].flipX: expected true, or left out',
    ])
    expect(issuesOf(withFront([{ ...stroke(), flipX: true } as unknown as CanonicalLayer]))).toEqual([
      '$.panels.front.layers[0].flipX: unknown field',
    ])
  })

  test('pressures need one value per point, each from 0 to 1', () => {
    expect(issuesOf(withFront([stroke({ pressures: [0.5, 0.5] })]))).toEqual([
      '$.panels.front.layers[0].strokes[0].pressures: expected one pressure per point',
    ])
    expect(issuesOf(withFront([stroke({ pressures: [0.5, 1.2, 0.5] })]))).toEqual([
      '$.panels.front.layers[0].strokes[0].pressures[1]: expected a finite number in [0, 1]',
    ])
  })
})

/**
 * Byte equality for two atlases. `toEqual` walks a 1 MB array element by
 * element, which took over 5 s on CI runners.
 */
function expectSamePixels(actual: Uint8ClampedArray, expected: Uint8ClampedArray) {
  expect(actual.length).toBe(expected.length)
  const first = actual.findIndex((value, index) => value !== expected[index])
  expect(first, `first differing byte at ${first}`).toBe(-1)
}

describe('drawing the optional fields', () => {
  test('a stroke at the default pressure draws exactly like one with none', () => {
    expectSamePixels(draw(withFront([stroke({ pressures: [0.7, 0.7, 0.7] })])).pixels, draw(withFront([stroke()])).pixels)
  })

  test('pressure changes the width along the stroke', () => {
    const ink = (pressures: number[]) => draw(withFront([stroke({ pressures })])).pixels.filter((_, index) => index % 4 === 3 && _ > 0).length

    expect(ink([1, 1, 1])).toBeGreaterThan(ink([0.7, 0.7, 0.7]))
    expect(ink([0.1, 0.1, 0.1])).toBeLessThan(ink([0.7, 0.7, 0.7]))
  })

  test('flipping an image mirrors it about its own axis', () => {
    const red = (document: CanonicalDocument, x: number) =>
      atlasPixelAtPanel({ buffer: draw(document), panel: 'front', x, y: 0.5 }).r

    expect(red(withFront([image()]), 0.4)).toBeLessThan(red(withFront([image()]), 0.6))
    expect(red(withFront([image({ flipX: true })]), 0.4)).toBeGreaterThan(red(withFront([image({ flipX: true })]), 0.6))
  })

  test('a lock changes nothing that is drawn', () => {
    expectSamePixels(draw(withFront([{ ...image(), locked: true }])).pixels, draw(withFront([image()])).pixels)
  })
})
