import { describe, expect, test } from 'vitest'

import {
  type DesignCommand,
  applyCommand,
  createCommandStack,
} from './design-commands'
import { type DesignDocument, createEmptyDocument } from './design-document'
import {
  basePatternCommand,
  createTeeEngine,
  runTeeCommand,
  runTranslated,
  teeRenderDocument,
  type TeeEngine,
} from './editor-canonical'
import { type AtlasBuffer, createAtlasBuffer, rasterizeLayers } from './paint-atlas'

/**
 * Pixel parity (E01 #152): the same store commands rendered through the
 * legacy v1 stack (master's behaviour) and through the v2 engine + render
 * projection must produce the same atlas.
 */

const GRAPHIC_SRC = '/graphics/cross-simple.svg'

// Pressure the store records at the default hardness (0.35 + 0.7 × 0.65).
const P = 0.35 + 0.7 * 0.65

function stroke(id: string, panel: 'front' | 'back' | 'left' | 'right', points: number[][], color: string, width = 0.024) {
  return {
    type: 'addStroke' as const,
    stroke: { id, panel, color, width, tool: 'brush' as const, points: points.map(([x, y]) => ({ x: x!, y: y!, p: P })) },
  }
}

const COMMANDS: DesignCommand[] = [
  stroke('s-front', 'front', [[0.2, 0.3], [0.5, 0.6], [0.8, 0.3]], '#f4ead4'),
  stroke('s-back', 'back', [[0.2, 0.2], [0.8, 0.8]], '#c4a15a', 0.04),
  stroke('s-left', 'left', [[0.2, 0.5], [0.8, 0.5]], '#e8c4b8'),
  stroke('s-right', 'right', [[0.5, 0.2], [0.5, 0.8]], '#6b1d2a', 0.014),
  {
    type: 'addGraphic',
    layer: { id: 'mark-1', kind: 'graphic', panel: 'front', src: GRAPHIC_SRC, x: 0.5, y: 0.48, scale: 0.28, rotation: 0.3, opacity: 0.8, visible: true },
  },
  {
    type: 'addGraphic',
    layer: { id: 'mark-2', kind: 'graphic', panel: 'left', src: GRAPHIC_SRC, x: 0.4, y: 0.6, scale: 0.2, rotation: 0, opacity: 1, visible: true },
  },
  { type: 'eraseStroke', strokeId: 's-right' },
  stroke('s-right-2', 'right', [[0.3, 0.3], [0.7, 0.7]], '#6b1d2a'),
]

/** A small opaque test image so graphic placement is compared too. */
function testImage(): AtlasBuffer {
  const image = createAtlasBuffer({ width: 16, height: 16 })

  for (let index = 0; index < image.pixels.length; index += 4) {
    image.pixels[index] = (index / 4) % 16 < 8 ? 200 : 30
    image.pixels[index + 1] = 90
    image.pixels[index + 2] = 40
    image.pixels[index + 3] = 255
  }

  return image
}

function render({ document }: { document: DesignDocument }) {
  return rasterizeLayers({ document, images: { [GRAPHIC_SRC]: testImage() } })
}

function differingPixels({ a, b }: { a: AtlasBuffer; b: AtlasBuffer }) {
  let count = 0

  for (let index = 0; index < a.pixels.length; index += 4) {
    if (
      Math.abs(a.pixels[index]! - b.pixels[index]!) > 1 ||
      Math.abs(a.pixels[index + 1]! - b.pixels[index + 1]!) > 1 ||
      Math.abs(a.pixels[index + 2]! - b.pixels[index + 2]!) > 1 ||
      Math.abs(a.pixels[index + 3]! - b.pixels[index + 3]!) > 1
    ) {
      count += 1
    }
  }

  return count
}

function inkedPixels({ buffer }: { buffer: AtlasBuffer }) {
  let count = 0

  for (let index = 3; index < buffer.pixels.length; index += 4) {
    if (buffer.pixels[index]! > 0) count += 1
  }

  return count
}

function runBoth({ extraV1, extraTee }: { extraV1?: (doc: DesignDocument) => DesignDocument; extraTee?: (engine: TeeEngine) => TeeEngine } = {}) {
  let legacy = createCommandStack({ document: createEmptyDocument({ garmentId: 'tee' }) })
  let engine = createTeeEngine()

  for (const command of COMMANDS) {
    legacy = applyCommand({ stack: legacy, command })
    engine = runTranslated({ engine, command }).engine
  }

  const v1 = extraV1 ? extraV1(legacy.document) : legacy.document
  const tee = extraTee ? extraTee(engine) : engine

  return { before: render({ document: v1 }), after: render({ document: teeRenderDocument({ engine: tee }) }) }
}

describe('v1 → v2 store switch keeps the atlas pixel-identical', () => {
  test('strokes on all four panels, erasing and graphics', () => {
    const { before, after } = runBoth()

    expect(inkedPixels({ buffer: before })).toBeGreaterThan(2000)
    expect(differingPixels({ a: before, b: after })).toBe(0)
  })

  // Intentional changes: v1 appended base-fill stamps after existing ink, so
  // stripes chosen late covered earlier prints, and drew them at a fixed
  // tile size. v2 keeps the base under every print at the base's own period
  // (#161); with the stamps first and that period, v1 renders identically.
  test('the stripe base pattern (as the ground, under prints)', () => {
    const { before, after } = runBoth({
      extraV1: (document) => ({
        ...document,
        layers: [
          ...(['front', 'back', 'left', 'right'] as const).map((panel) => ({
            id: `base-fill-${panel}`,
            kind: 'pattern' as const,
            patternId: 'stripe' as const,
            panel,
            color: '#c4a15a',
            x: 0.5,
            y: 0.5,
            scale: 1.05,
            rotation: 0,
            opacity: 0.55,
            visible: true,
            period: 0.08,
          })),
          ...document.layers,
        ],
      }),
      extraTee: (engine) =>
        runTeeCommand({
          engine,
          command: basePatternCommand({ engine, patternId: 'stripe', fillColor: '#c4a15a' })!,
        }).engine,
    })

    expect(differingPixels({ a: before, b: after })).toBe(0)
  })
})
