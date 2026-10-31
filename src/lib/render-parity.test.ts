import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { parseDraft, serializeDraft } from './design-draft'
import type { DesignDocument, Stroke } from './design-document'
import {
  createTeeEngine,
  loadTeeEngine,
  redoTee,
  runTeeCommand,
  runTranslated,
  teeRenderDocument,
  undoTee,
  type TeeEngine,
} from './editor-canonical'
import { type AtlasBuffer, atlasPixelAtPanel, PLACEHOLDER_INK, rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

/**
 * Render parity for brush/layer opacity (#158), the base period (#161)
 * and missing-image placeholders (#154). The 2D panel canvas and the
 * scene both draw the one `rasterizeLayers` atlas, and published art is
 * the same atlas baked at 512/256/160, so each check below compares atlas
 * pixels after projection: live vs committed, after reload (canonical
 * save and local draft), after undo/redo, and at the published sizes.
 */

const STROKE_POINTS = [0.2, 0.4, 0.35, 0.45, 0.5, 0.5, 0.65, 0.45, 0.8, 0.4]

function withFront({ layers }: { layers: CanonicalDocument['panels']['front']['layers'] }) {
  const document = createEmptyCanonicalDocument()
  document.panels.front.layers = layers
  return document
}

function translucentStroke({ opacity = 0.3, layerOpacity = 1 } = {}) {
  return withFront({
    layers: [
      {
        id: 'paint-front',
        kind: 'paint',
        visible: true,
        opacity: layerOpacity,
        strokes: [
          { id: 'ink-1', tool: 'brush', color: '#1a1c22', width: 0.03, opacity, points: STROKE_POINTS },
        ],
      },
    ],
  })
}

function render({ document, size = 512 }: { document: DesignDocument; size?: number }) {
  return rasterizeLayers({ document, width: size, height: size })
}

function reloadCanonical({ document }: { document: CanonicalDocument }) {
  const result = validateCanonicalDocument({ value: JSON.parse(serializeCanonicalDocument({ document })) })

  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues))
  }

  return result.document
}

/** Local drafts store the render document and reload through the importer. */
function reloadDraft({ engine }: { engine: TeeEngine }) {
  const draft = parseDraft({
    value: serializeDraft({ garmentId: 'tee', document: teeRenderDocument({ engine }) }),
  })!
  return loadTeeEngine({ engine: createTeeEngine(), document: draft.document }).engine
}

function samePixels({ a, b }: { a: AtlasBuffer; b: AtlasBuffer }) {
  let differing = 0

  for (let index = 0; index < a.pixels.length; index += 1) {
    if (a.pixels[index] !== b.pixels[index]) {
      differing += 1
    }
  }

  return differing
}

function alphaAlong({ buffer }: { buffer: AtlasBuffer }) {
  return [0.25, 0.35, 0.5, 0.65, 0.75].map((x) => {
    const y = 0.4 + (0.5 - 0.4) * (1 - Math.abs(x - 0.5) / 0.3)
    return atlasPixelAtPanel({ buffer, panel: 'front', x, y }).a
  })
}

describe('brush and layer opacity (#158)', () => {
  test('a 30% stroke composites once: 30% alpha along its whole length', () => {
    const atlas = render({ document: toRenderDocument({ document: translucentStroke() }).document })

    for (const alpha of alphaAlong({ buffer: atlas })) {
      expect(alpha).toBe(Math.round(0.3 * 255))
    }
  })

  test('the live stroke and the committed stroke draw the same pixels', () => {
    const live: Stroke = {
      id: 'ink-1',
      panel: 'front',
      tool: 'brush',
      width: 0.03,
      // `startStroke` encodes the brush opacity slider in the colour.
      color: `#1a1c22${Math.round(0.3 * 255).toString(16)}`,
      points: Array.from({ length: STROKE_POINTS.length / 2 }, (_, index) => ({
        x: STROKE_POINTS[index * 2]!,
        y: STROKE_POINTS[index * 2 + 1]!,
        p: 0.7,
      })),
    }
    let engine = createTeeEngine()
    const before = rasterizeLayers({ document: teeRenderDocument({ engine }), extraStroke: live })
    engine = runTranslated({ engine, command: { type: 'addStroke', stroke: live } }).engine
    const after = render({ document: teeRenderDocument({ engine }) })

    expect(alphaAlong({ buffer: after })).toEqual(alphaAlong({ buffer: before }))
    expect(samePixels({ a: before, b: after })).toBe(0)
    // The slider's 0.3 is stored as the 8-bit value it was drawn with.
    const layer = engine.stack.document.panels.front.layers[0]
    expect(layer?.kind === 'paint' && layer.strokes[0]?.tool === 'brush' && layer.strokes[0].opacity).toBeCloseTo(0.3, 2)
  })

  test('layer opacity scales the whole layer, and both survive reload and draft restore', () => {
    const document = translucentStroke({ opacity: 1, layerOpacity: 0.5 })
    const atlas = render({ document: toRenderDocument({ document }).document })

    for (const alpha of alphaAlong({ buffer: atlas })) {
      expect(alpha).toBe(128)
    }

    const both = translucentStroke({ opacity: 0.6, layerOpacity: 0.5 })
    const original = render({ document: toRenderDocument({ document: both }).document })
    const reloaded = render({ document: toRenderDocument({ document: reloadCanonical({ document: both }) }).document })
    let engine = createTeeEngine()
    engine = runTeeCommand({ engine, command: { type: 'setBase', base: both.base } }).engine
    engine = { ...engine, stack: { ...engine.stack, document: both } }
    const restored = render({ document: teeRenderDocument({ engine: reloadDraft({ engine }) }) })

    expect(samePixels({ a: original, b: reloaded })).toBe(0)
    // 0.6 → 8-bit alpha in the draft; the pixels still agree to the bit.
    expect(samePixels({ a: original, b: restored })).toBe(0)
    expect(alphaAlong({ buffer: original })[2]).toBe(Math.round(Math.round(0.6 * 255) * 0.5))
  })

  test('published art sizes keep the same opacity', () => {
    const document = toRenderDocument({ document: translucentStroke() }).document

    for (const size of [256, 160]) {
      const centre = atlasPixelAtPanel({ buffer: render({ document, size }), panel: 'front', x: 0.5, y: 0.5 })
      expect(centre.a).toBe(Math.round(0.3 * 255))
    }
  })
})

/** Lengths of the runs of inked and bare pixels down the front panel centre. */
function stripeRuns({ buffer }: { buffer: AtlasBuffer }) {
  const runs: number[] = []
  let previous: boolean | null = null

  for (let step = 0; step <= 400; step += 1) {
    // Stay clear of the panel edges, where the clip cuts a run short.
    const y = 0.1 + (step / 400) * 0.8
    const inked = atlasPixelAtPanel({ buffer, panel: 'front', x: 0.5, y }).a > 0

    if (inked === previous) {
      runs[runs.length - 1]! += 1
    } else {
      runs.push(1)
      previous = inked
    }
  }

  // The first and last runs are cut by the sample window.
  return runs.slice(1, -1)
}

/** One stripe + gap repeat, in panel heights sampled (0.8 / 400 per step). */
function measuredPeriod({ buffer }: { buffer: AtlasBuffer }) {
  const runs = stripeRuns({ buffer })
  const panelHeightPx = buffer.height * 0.72
  const stepPx = (panelHeightPx * 0.8) / 400
  const mean = runs.reduce((sum, run) => sum + run, 0) / runs.length
  return (2 * mean * stepPx) / buffer.width
}

function stripes({ engine, period }: { engine: TeeEngine; period: number }) {
  return runTeeCommand({
    engine,
    command: {
      type: 'setBase',
      base: { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period, angle: 0 },
    },
  }).engine
}

describe('base stripe/check period (#161)', () => {
  test('the projected stripes repeat at the document period', () => {
    for (const period of [0.06, 0.2]) {
      const engine = stripes({ engine: createTeeEngine(), period })
      expect(measuredPeriod({ buffer: render({ document: teeRenderDocument({ engine }) }) })).toBeCloseTo(period, 2)
    }
  })

  test('the period holds through undo/redo, reload, draft restore and publish sizes', () => {
    let engine = stripes({ engine: createTeeEngine(), period: 0.06 })
    engine = stripes({ engine, period: 0.2 })
    const wide = render({ document: teeRenderDocument({ engine }) })

    engine = undoTee({ engine })
    expect(measuredPeriod({ buffer: render({ document: teeRenderDocument({ engine }) }) })).toBeCloseTo(0.06, 2)

    engine = redoTee({ engine })
    expect(samePixels({ a: wide, b: render({ document: teeRenderDocument({ engine }) }) })).toBe(0)

    const reloaded = toRenderDocument({ document: reloadCanonical({ document: engine.stack.document }) }).document
    expect(samePixels({ a: wide, b: render({ document: reloaded }) })).toBe(0)

    const restored = reloadDraft({ engine })
    expect(restored.stack.document.base).toEqual(engine.stack.document.base)
    expect(samePixels({ a: wide, b: render({ document: teeRenderDocument({ engine: restored }) }) })).toBe(0)

    // Published art is baked at these sizes; period is a fraction of width.
    for (const size of [256, 160]) {
      expect(measuredPeriod({ buffer: render({ document: teeRenderDocument({ engine }), size }) })).toBeCloseTo(0.2, 1)
    }
  })

  test('check uses the same period in both directions', () => {
    const engine = runTeeCommand({
      engine: createTeeEngine(),
      command: { type: 'setBase', base: { kind: 'check', colors: ['#f3efe6', '#1a1c22'], period: 0.1 } },
    }).engine
    const atlas = render({ document: teeRenderDocument({ engine }) })

    expect(measuredPeriod({ buffer: atlas })).toBeCloseTo(0.1, 2)
    // Across one band the check alternates, so neighbouring cells differ.
    const band = 0.05 * 512
    const cell = (column: number) => atlasPixelAtPanel({ buffer: atlas, panel: 'front', x: column / 256, y: 0.5 }).a
    const columns = Array.from({ length: 6 }, (_, index) => cell(40 + index * band))
    expect(new Set(columns.map((alpha) => alpha > 0)).size).toBe(2)
  })
})

describe('missing image placeholder (#154)', () => {
  const imageDocument = withFront({
    layers: [
      {
        id: 'image-front',
        kind: 'image',
        visible: true,
        opacity: 0.2,
        x: 0.5,
        y: 0.55,
        scale: 0.3,
        rotation: 0,
        assetId: 'asset_missing0001',
        aspect: 1.5,
      },
    ],
  })

  test('an image with no bytes draws a bordered, hatched box at its own box', () => {
    const { document, missingAssets } = toRenderDocument({ document: imageDocument })
    const atlas = render({ document })
    const ink = { r: 0x8c, g: 0x84, b: 0x78 }
    // Box: 0.3 × 0.2 atlas widths, i.e. 0.6 × 0.278 of the front panel.
    const inside = { x: 0.5, y: 0.55 }
    const outside = { x: 0.5, y: 0.55 + 0.2 }
    const borderLeft = { x: 0.5 - 0.3 + 1 / 512 / 0.5, y: 0.55 }

    expect(missingAssets).toEqual(['asset_missing0001'])
    expect(PLACEHOLDER_INK).toBe('#8c8478')
    expect(atlasPixelAtPanel({ buffer: atlas, panel: 'front', ...outside }).a).toBe(0)
    expect(atlasPixelAtPanel({ buffer: atlas, panel: 'front', ...inside }).a).toBeGreaterThan(0)
    // The border is near-opaque whatever the layer's opacity (here 0.2).
    expect(atlasPixelAtPanel({ buffer: atlas, panel: 'front', ...borderLeft })).toMatchObject({ ...ink, a: 235 })

    let hatched = 0
    let faint = 0

    for (let step = 0; step < 100; step += 1) {
      const alpha = atlasPixelAtPanel({ buffer: atlas, panel: 'front', x: 0.3 + 0.004 * step + 0.01, y: 0.55 }).a
      hatched += alpha === 170 ? 1 : 0
      faint += alpha === 36 ? 1 : 0
    }

    expect(hatched).toBeGreaterThan(5)
    expect(faint).toBeGreaterThan(hatched)
  })

  test('an image whose bytes failed to decode draws the same placeholder', () => {
    const missing = render({ document: toRenderDocument({ document: imageDocument }).document })
    const failed = render({
      document: toRenderDocument({
        document: imageDocument,
        assetSources: { asset_missing0001: 'blob:failed' },
      }).document,
    })

    expect(samePixels({ a: missing, b: failed })).toBe(0)
  })

  test('the placeholder cannot be copied into a layer with no bytes', () => {
    const engine = loadTeeEngine({ engine: createTeeEngine(), document: toRenderDocument({ document: imageDocument }).document }).engine
    const layer = teeRenderDocument({ engine: { ...engine, stack: { ...engine.stack, document: imageDocument } } }).layers.find(
      (entry) => entry.kind === 'graphic',
    )!

    expect(layer).toMatchObject({ missing: true, src: '' })
    expect(
      runTranslated({
        engine: { ...engine, stack: { ...engine.stack, document: imageDocument } },
        command: { type: 'addGraphic', layer: { ...layer, id: 'copy' } as Extract<typeof layer, { kind: 'graphic' }> },
      }).changed,
    ).toBe(false)
  })
})
