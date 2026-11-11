import { describe, expect, test } from 'vitest'

import {
  type CanonicalLayer,
  type CanonicalPanelId,
  type GarmentBase,
  createEmptyCanonicalDocument,
} from './canonical-document'
import type { DesignDocument, Stroke } from './design-document'
import { type AtlasBuffer, createAtlasBuffer, createLiveAtlas, rasterizeLayers } from './paint-atlas'
import { renderPanel, toRenderDocument } from './render-projection'

/**
 * A2: the live-stroke cache draws exactly what a full redraw draws, at every
 * point of a stroke, whichever way the stroke will be committed.
 */

const ASSET = 'asset_live00000001'
const ASSET_SRC = '/live/asset.png'
const IMAGES = { [ASSET_SRC]: gradientImage() }

function gradientImage(): AtlasBuffer {
  const image = createAtlasBuffer({ width: 24, height: 16 })

  for (let index = 0; index < image.pixels.length; index += 4) {
    image.pixels[index] = (index / 4) % 24 * 10
    image.pixels[index + 1] = 90
    image.pixels[index + 2] = 200
    image.pixels[index + 3] = index % 40 === 0 ? 0 : 255
  }

  return image
}

function paint({
  id,
  strokes,
  opacity = 1,
  visible = true,
}: {
  id: string
  strokes: Array<{ id: string; tool: 'brush' | 'eraser'; points: number[]; width?: number }>
  opacity?: number
  visible?: boolean
}): CanonicalLayer {
  return {
    id,
    kind: 'paint',
    visible,
    opacity,
    strokes: strokes.map(({ id: strokeId, tool, points, width = 0.06 }) =>
      tool === 'brush'
        ? { id: strokeId, tool, color: '#c0392b', width, opacity: 1, points }
        : { id: strokeId, tool, width, points },
    ),
  }
}

function image({ id }: { id: string }): CanonicalLayer {
  return { id, kind: 'image', visible: true, opacity: 0.9, assetId: ASSET, aspect: 1.5, x: 0.5, y: 0.45, scale: 0.5, rotation: 0.2 }
}

function design({
  layers,
  base,
}: {
  layers: Partial<Record<CanonicalPanelId, CanonicalLayer[]>>
  base?: GarmentBase
}): DesignDocument {
  const document = createEmptyCanonicalDocument()

  if (base) {
    document.base = base
  }

  for (const [panel, panelLayers] of Object.entries(layers)) {
    document.panels[panel as CanonicalPanelId]!.layers = panelLayers!
  }

  return toRenderDocument({ document, assetSources: { [ASSET]: ASSET_SRC } }).document
}

/** A curving stroke with changing pressure, optionally running off its panel. */
function liveStroke({
  panel,
  tool = 'brush',
  color = '#1f6feb',
  offEdge = false,
}: {
  panel: CanonicalPanelId
  tool?: 'brush' | 'eraser'
  color?: string
  offEdge?: boolean
}): Stroke {
  const points = Array.from({ length: 18 }, (_, index) => {
    const t = index / 17
    return {
      x: offEdge ? -0.15 + t * 1.3 : 0.2 + t * 0.6,
      y: 0.5 + Math.sin(t * Math.PI * 2) * 0.3,
      p: 0.2 + t * 0.8,
    }
  })

  return {
    id: 'live',
    panel: renderPanel({ panel }),
    points,
    color: tool === 'eraser' ? '#000000' : color,
    width: tool === 'eraser' ? 0.05 : 0.04,
    tool,
  }
}

function firstDifference({ a, b }: { a: AtlasBuffer; b: AtlasBuffer }) {
  if (a.pixels.length !== b.pixels.length) {
    return -2
  }

  for (let index = 0; index < a.pixels.length; index += 1) {
    if (a.pixels[index] !== b.pixels[index]) {
      return index
    }
  }

  return -1
}

/** Every prefix of the stroke, as it grows under the pen. */
function expectMatchesEveryFrame({
  document,
  stroke,
  layerId,
  size = 256,
}: {
  document: DesignDocument
  stroke: Stroke
  layerId: string | null | undefined
  size?: number
}) {
  const live = createLiveAtlas()

  for (let count = 1; count <= stroke.points.length; count += 1) {
    const input = {
      document,
      extraStroke: { ...stroke, points: stroke.points.slice(0, count) },
      extraStrokeLayerId: layerId,
      images: IMAGES,
      width: size,
      height: size,
    }

    expect({ count, at: firstDifference({ a: live({ ...input, fontVersion: 1 }), b: rasterizeLayers(input) }) }).toEqual({
      count,
      at: -1,
    })
  }
}

const inkOnOtherPanels = {
  back: [paint({ id: 'paint-back', strokes: [{ id: 'b1', tool: 'brush', points: [0.1, 0.1, 0.9, 0.9] }] })],
  right: [image({ id: 'img-right' })],
} satisfies Partial<Record<CanonicalPanelId, CanonicalLayer[]>>

describe('live stroke cache (A2)', () => {
  test('a brush starting a new layer, over an image', () => {
    const document = design({ layers: { ...inkOnOtherPanels, front: [image({ id: 'img' })] } })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'front' }), layerId: 'paint-front' })
  })

  test('a brush joining an opaque top layer, translucent ink included', () => {
    const document = design({
      layers: {
        ...inkOnOtherPanels,
        front: [image({ id: 'img' }), paint({ id: 'top', strokes: [{ id: 's1', tool: 'brush', points: [0.3, 0.2, 0.3, 0.8] }] })],
      },
    })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'front' }), layerId: 'top' })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'front', color: '#1f6feb80' }), layerId: 'top' })
  })

  test('a brush joining a translucent top layer', () => {
    const document = design({
      layers: {
        front: [
          image({ id: 'img' }),
          paint({ id: 'top', opacity: 0.45, strokes: [{ id: 's1', tool: 'brush', points: [0.2, 0.5, 0.8, 0.5], width: 0.15 }] }),
        ],
      },
    })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'front' }), layerId: 'top', size: 512 })
  })

  test('a brush joining a layer with erasers', () => {
    const document = design({
      layers: {
        back: [
          image({ id: 'img' }),
          paint({
            id: 'top',
            strokes: [
              { id: 's1', tool: 'brush', points: [0.2, 0.5, 0.8, 0.5], width: 0.2 },
              { id: 'e1', tool: 'eraser', points: [0.5, 0.1, 0.5, 0.9] },
            ],
          }),
        ],
      },
    })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'back' }), layerId: 'top' })
  })

  test('a live eraser on the top paint layer, and on one under an image', () => {
    const ink = paint({ id: 'ink', strokes: [{ id: 's1', tool: 'brush', points: [0.1, 0.5, 0.9, 0.5], width: 0.3 }] })

    expectMatchesEveryFrame({
      document: design({ layers: { ...inkOnOtherPanels, front: [image({ id: 'img' }), ink] } }),
      stroke: liveStroke({ panel: 'front', tool: 'eraser' }),
      layerId: 'ink',
    })
    expectMatchesEveryFrame({
      document: design({ layers: { front: [ink, image({ id: 'img' })] } }),
      stroke: liveStroke({ panel: 'front', tool: 'eraser' }),
      layerId: 'ink',
    })
  })

  test('an eraser with no layer of its own to erase', () => {
    const document = design({ layers: { front: [image({ id: 'img' })] } })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'front', tool: 'eraser' }), layerId: 'paint-front' })
    expectMatchesEveryFrame({ document, stroke: liveStroke({ panel: 'front', tool: 'eraser' }), layerId: null })
  })

  test('strokes running off the panel edge stay clipped, on the body and a sleeve', () => {
    const base: GarmentBase = { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.08, angle: 0.3 }

    for (const panel of ['front', 'left', 'right'] as const) {
      const document = design({
        base,
        layers: { ...inkOnOtherPanels, [panel]: [paint({ id: 'top', opacity: 0.6, strokes: [] })] },
      })
      expectMatchesEveryFrame({ document, stroke: liveStroke({ panel, offEdge: true }), layerId: 'top' })
      expectMatchesEveryFrame({ document, stroke: liveStroke({ panel, offEdge: true }), layerId: 'new-layer' })
    }
  })

  test('a changed design, image or font redraws what lies under the stroke', () => {
    const live = createLiveAtlas()
    const stroke = liveStroke({ panel: 'front' })
    const first = design({ layers: { front: [paint({ id: 'top', opacity: 0.5, strokes: [] })] } })
    const second = design({ layers: { front: [image({ id: 'img' }), paint({ id: 'top', opacity: 0.5, strokes: [] })] } })
    const frame = ({ document, images }: { document: DesignDocument; images?: Record<string, AtlasBuffer> }) => {
      const input = { document, extraStroke: stroke, extraStrokeLayerId: 'top', images, width: 160, height: 160 }
      return firstDifference({ a: live({ ...input, fontVersion: 1 }), b: rasterizeLayers(input) })
    }

    expect(frame({ document: first, images: IMAGES })).toBe(-1)
    expect(frame({ document: second, images: IMAGES })).toBe(-1)
    // The image arrives: the same design now draws it.
    expect(frame({ document: second })).toBe(-1)
    expect(frame({ document: second, images: IMAGES })).toBe(-1)
  })

  test('with no live stroke it is a plain redraw', () => {
    const document = design({ layers: { ...inkOnOtherPanels } })
    const input = { document, images: IMAGES, width: 160, height: 160 }

    expect(firstDifference({ a: createLiveAtlas()(input), b: rasterizeLayers(input) })).toBe(-1)
  })
})

describe('a live stroke previews as it will be saved (A2)', () => {
  function committed({ document, stroke, layerId }: { document: DesignDocument; stroke: Stroke; layerId: string }) {
    return {
      ...document,
      layers: document.layers.map((layer) =>
        layer.kind === 'paint' && layer.id === layerId ? { ...layer, strokes: [...layer.strokes, stroke] } : layer,
      ),
    }
  }

  test.each([
    ['a translucent layer', paint({ id: 'top', opacity: 0.4, strokes: [{ id: 's1', tool: 'brush', points: [0.2, 0.2, 0.8, 0.8] }] })],
    [
      'a layer with an eraser',
      paint({
        id: 'top',
        strokes: [
          { id: 's1', tool: 'brush', points: [0.2, 0.2, 0.8, 0.8], width: 0.2 },
          { id: 'e1', tool: 'eraser', points: [0.2, 0.8, 0.8, 0.2] },
        ],
      }),
    ],
    ['an opaque layer', paint({ id: 'top', strokes: [{ id: 's1', tool: 'brush', points: [0.2, 0.2, 0.8, 0.8] }] })],
  ])('a brush into %s', (_, layer) => {
    const document = design({ layers: { front: [image({ id: 'img' }), layer] } })
    const stroke = liveStroke({ panel: 'front' })
    const live = rasterizeLayers({ document, extraStroke: stroke, extraStrokeLayerId: 'top', images: IMAGES, width: 256, height: 256 })
    const saved = rasterizeLayers({ document: committed({ document, stroke, layerId: 'top' }), images: IMAGES, width: 256, height: 256 })

    expect(firstDifference({ a: live, b: saved })).toBe(-1)
  })

  test('a translucent layer no longer previews its new stroke at full strength', () => {
    const document = design({ layers: { front: [paint({ id: 'top', opacity: 0.3, strokes: [] })] } })
    const stroke = liveStroke({ panel: 'front' })
    const options = { document, extraStroke: stroke, images: IMAGES, width: 256, height: 256 }

    expect(
      firstDifference({
        a: rasterizeLayers({ ...options, extraStrokeLayerId: 'top' }),
        b: rasterizeLayers({ ...options, extraStrokeLayerId: 'not-a-layer' }),
      }),
    ).not.toBe(-1)
  })
})
