// Measures the procedural tee (@3); must load before the store.
import './testing/procedural-tee'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BASE_KINDS, createEmptyCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import type { PanelId } from './design-document'
import { getAssetSources, getCanonicalDocument, useEditorStore } from './editor-store'
import { type AtlasBuffer, atlasPixelAtPanel, createAtlasBuffer, rasterizeLayers } from './paint-atlas'
import { atlasSourceRect } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { TEE_CREW_SHORT_V3 } from './template-manifest'

/**
 * What the audit found proven only in the document: the atlas pixels after a
 * delete and a reorder, panel masks on every edge of every panel, image alpha,
 * transforms on all four panels (R05, R06, R07, R14, R15). The 2D panels and
 * the garment both draw this atlas.
 */

// Each check rasterizes the 512 px atlas several times; slow on a busy machine.
vi.setConfig({ testTimeout: 60_000 })

const SIZE = 512
const PANELS: PanelId[] = ['front', 'back', 'left', 'right']
const store = () => useEditorStore.getState()

function solid({ rgb, alpha = 255, width = 64, height = 64 }: { rgb: [number, number, number]; alpha?: number; width?: number; height?: number }) {
  const image = createAtlasBuffer({ width, height })

  for (let at = 0; at < image.pixels.length; at += 4) {
    image.pixels.set([...rgb, alpha], at)
  }

  return image
}

const IMAGES: Record<string, AtlasBuffer> = {
  'src:red': solid({ rgb: [220, 20, 20] }),
  'src:blue': solid({ rgb: [20, 20, 220] }),
  'src:half': solid({ rgb: [20, 200, 20], alpha: 128 }),
  'src:clear': solid({ rgb: [20, 200, 20], alpha: 0 }),
}

function addImage({ name, panel = 'front', patch = {} }: { name: string; panel?: PanelId; patch?: Record<string, number> }) {
  store().setPaintPanel({ paintPanel: panel })
  store().addUploadedImage({ assetId: `asset_proof_${name}`, aspect: 1, src: `src:${name}`, panel })
  const layerId = store().selectedLayerId!
  store().updateLayer({ layerId, patch })
  return layerId
}

const atlas = () => rasterizeLayers({ document: store().document, width: SIZE, height: SIZE, images: IMAGES })

function panelRect({ panel }: { panel: PanelId }) {
  const rect = atlasSourceRect({ panel, width: SIZE, height: SIZE })
  return {
    x0: Math.round(rect.sourceX),
    y0: Math.round(rect.sourceY),
    x1: Math.round(rect.sourceX + rect.sourceWidth),
    y1: Math.round(rect.sourceY + rect.sourceHeight),
  }
}

/** Where the atlas has ink, split into inside and outside one panel. */
function inkAround({ buffer, panel }: { buffer: AtlasBuffer; panel: PanelId }) {
  const rect = panelRect({ panel })
  let [inside, outside] = [0, 0]

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      if (buffer.pixels[(y * buffer.width + x) * 4 + 3]! > 0) {
        const within = x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1
        inside += within ? 1 : 0
        outside += within ? 0 : 1
      }
    }
  }

  return { inside, outside }
}

function inkBox({ buffer, panel }: { buffer: AtlasBuffer; panel: PanelId }) {
  const rect = panelRect({ panel })
  let [left, right, top, bottom] = [SIZE, -1, SIZE, -1]

  for (let y = rect.y0; y < rect.y1; y += 1) {
    for (let x = rect.x0; x < rect.x1; x += 1) {
      if (buffer.pixels[(y * buffer.width + x) * 4 + 3]! > 0) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  }

  return { width: right - left + 1, height: bottom - top + 1, centerX: (left + right) / 2, centerY: (top + bottom) / 2 }
}

function samePanelPixels({ a, b, panel }: { a: AtlasBuffer; b: AtlasBuffer; panel: PanelId }) {
  const rect = panelRect({ panel })

  for (let y = rect.y0; y < rect.y1; y += 1) {
    const start = (y * SIZE + rect.x0) * 4
    const end = (y * SIZE + rect.x1) * 4

    if (a.pixels.slice(start, end).some((value, index) => value !== b.pixels[start + index])) {
      return false
    }
  }

  return true
}

const CENTER = { x: 0.5, y: 0.5 }

beforeEach(() => {
  store().reset()
})

describe('compositing after an edit', () => {
  test('deleting the top layer leaves the same pixels as never having added it', () => {
    addImage({ name: 'red' })
    const alone = atlas()
    const top = addImage({ name: 'blue' })
    expect(atlasPixelAtPanel({ buffer: atlas(), panel: 'front', ...CENTER })).toMatchObject({ r: 20, b: 220 })

    store().removeLayer({ layerId: top })

    expect(atlas().pixels).toEqual(alone.pixels)
  })

  test('deleting the bottom layer leaves the top one alone', () => {
    const bottom = addImage({ name: 'red' })
    addImage({ name: 'blue' })
    const before = atlas()
    store().removeLayer({ layerId: bottom })

    // Fully covered, so nothing visible changes.
    expect(atlas().pixels).toEqual(before.pixels)
  })

  test('reordering changes which layer shows, and undo brings it back', () => {
    addImage({ name: 'red' })
    const blue = addImage({ name: 'blue' })
    const before = atlas()
    expect(atlasPixelAtPanel({ buffer: before, panel: 'front', ...CENTER })).toMatchObject({ r: 20, b: 220 })

    store().moveLayer({ layerId: blue, direction: 'down' })
    expect(atlasPixelAtPanel({ buffer: atlas(), panel: 'front', ...CENTER })).toMatchObject({ r: 220, b: 20 })

    store().undoLast()
    expect(atlas().pixels).toEqual(before.pixels)
  })
})

describe('image alpha', () => {
  test('a half-transparent image blends over what is beneath, and a clear one leaves it', () => {
    addImage({ name: 'red' })
    const halfway = addImage({ name: 'half' })
    const mixed = atlasPixelAtPanel({ buffer: atlas(), panel: 'front', ...CENTER })
    expect(mixed.r).toBeGreaterThan(100)
    expect(mixed.r).toBeLessThan(140)
    expect(mixed.g).toBeGreaterThan(90)
    expect(mixed.g).toBeLessThan(120)

    store().removeLayer({ layerId: halfway })
    const beneath = atlas()
    addImage({ name: 'clear' })
    expect(atlas().pixels).toEqual(beneath.pixels)
  })

  test('layer opacity multiplies the image alpha', () => {
    const layerId = addImage({ name: 'half' })
    const full = atlasPixelAtPanel({ buffer: atlas(), panel: 'front', ...CENTER }).a
    store().updateLayer({ layerId, patch: { opacity: 0.5 } })
    const faded = atlasPixelAtPanel({ buffer: atlas(), panel: 'front', ...CENTER }).a

    expect(full).toBeGreaterThan(120)
    expect(faded).toBeGreaterThan(full * 0.4)
    expect(faded).toBeLessThan(full * 0.6)
  })
})

describe('panel masks', () => {
  const CORNERS = [
    { x: 0.02, y: 0.02 },
    { x: 0.98, y: 0.02 },
    { x: 0.02, y: 0.98 },
    { x: 0.98, y: 0.98 },
  ]

  for (const panel of PANELS) {
    test(`an image over any ${panel} edge stays on the ${panel}`, () => {
      for (const corner of CORNERS) {
        store().reset()
        addImage({ name: 'red', panel, patch: { ...corner, scale: 0.3 } })
        const { inside, outside } = inkAround({ buffer: atlas(), panel })
        expect(inside, JSON.stringify(corner)).toBeGreaterThan(50)
        expect(outside, JSON.stringify(corner)).toBe(0)
      }
    })

    test(`a word over any ${panel} edge stays on the ${panel}`, () => {
      for (const corner of CORNERS) {
        store().reset()
        store().setPaintPanel({ paintPanel: panel })
        store().addText({ content: 'EDGEWORD', panel, ...corner })
        const { inside, outside } = inkAround({ buffer: atlas(), panel })
        expect(inside, JSON.stringify(corner)).toBeGreaterThan(0)
        expect(outside, JSON.stringify(corner)).toBe(0)
      }
    })

    test(`a brush stroke over any ${panel} edge stays on the ${panel}`, () => {
      const document = createEmptyCanonicalDocument()
      document.panels[panel].layers = [
        {
          id: 'paint-edges',
          kind: 'paint',
          visible: true,
          opacity: 1,
          strokes: [
            {
              id: 'ink-edges',
              tool: 'brush',
              color: '#1a1c22',
              width: 0.08,
              opacity: 1,
              points: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
            },
          ],
        },
      ]
      const projected = toRenderDocument({ document }).document
      const buffer = rasterizeLayers({ document: projected, width: SIZE, height: SIZE })
      // The render side of a sleeve is the template's own mapping.
      const painted = projected.layers.flatMap((layer) => (layer.kind === 'paint' ? layer.strokes : []))[0]!
      const { inside, outside } = inkAround({ buffer, panel: painted.panel })

      expect(inside).toBeGreaterThan(100)
      expect(outside).toBe(0)
    })
  }
})

describe('transforms on all four panels', () => {
  for (const panel of PANELS) {
    test(`moving, scaling and turning on the ${panel} show in its pixels and nowhere else`, () => {
      // A mark on each of the other panels, to prove they stay put.
      for (const other of PANELS.filter((entry) => entry !== panel)) {
        addImage({ name: 'blue', panel: other, patch: { x: 0.3, y: 0.3, scale: 0.05 } })
      }

      const layerId = addImage({ name: 'red', panel, patch: { x: 0.5, y: 0.5, scale: 0.1 } })
      const start = atlas()
      const box = inkBox({ buffer: start, panel })
      const others = PANELS.filter((entry) => entry !== panel)

      store().updateLayer({ layerId, patch: { x: 0.65 } })
      const moved = atlas()
      expect(Math.abs(inkBox({ buffer: moved, panel }).centerX - box.centerX)).toBeGreaterThan(5)

      store().updateLayer({ layerId, patch: { x: 0.5, scale: 0.2 } })
      const scaled = atlas()
      expect(inkBox({ buffer: scaled, panel }).width / box.width).toBeCloseTo(2, 0)
      expect(inkBox({ buffer: scaled, panel }).height / box.height).toBeCloseTo(2, 0)

      store().updateLayer({ layerId, patch: { scale: 0.1, rotation: Math.PI / 4 } })
      const turned = atlas()
      // A square turned 45° is about √2 wider across its box.
      expect(inkBox({ buffer: turned, panel }).width / box.width).toBeCloseTo(Math.SQRT2, 0)

      for (const frame of [moved, scaled, turned]) {
        for (const other of others) {
          expect(samePanelPixels({ a: frame, b: start, panel: other }), other).toBe(true)
        }
      }

      // Saved and reloaded, the transform draws the same pixels.
      const reloaded = validateCanonicalDocument({ value: JSON.parse(serializeCanonicalDocument({ document: getCanonicalDocument() })) })
      if (!reloaded.ok) {
        throw new Error(JSON.stringify(reloaded.issues))
      }
      const again = rasterizeLayers({
        document: toRenderDocument({ document: reloaded.document, assetSources: getAssetSources() }).document,
        width: SIZE,
        height: SIZE,
        images: IMAGES,
      })
      expect(again.pixels).toEqual(turned.pixels)
    })
  }
})

describe('image proportions (template @3)', () => {
  /** What a square image measures once the atlas is laid on the cloth. */
  const onCloth = ({ panel }: { panel: PanelId }) => {
    const box = inkBox({ buffer: atlas(), panel })
    return (box.width * PANEL_SURFACE[panel].stretchY) / box.height
  }
  const PANEL_SURFACE = Object.fromEntries(
    Object.values(TEE_CREW_SHORT_V3.regions).map((region) => [region.renderPanel, region.surface!]),
  ) as Record<PanelId, { stretchY: number; panelAspect: number }>

  for (const panel of PANELS) {
    test(`a square stays square on the ${panel}, on the cloth and on its panel`, () => {
      addImage({ name: 'red', panel, patch: { scale: 0.1 } })

      expect(onCloth({ panel })).toBeCloseTo(1, 0)
      expect(Math.abs(onCloth({ panel }) - 1)).toBeLessThan(0.05)
    })

    test(`a square turned 90° on the ${panel} is still square`, () => {
      addImage({ name: 'red', panel, patch: { scale: 0.1, rotation: Math.PI / 2 } })

      expect(Math.abs(onCloth({ panel }) - 1)).toBeLessThan(0.06)
    })

    test(`a new square image fits on the ${panel}`, () => {
      addImage({ name: 'red', panel })
      const { outside } = inkAround({ buffer: atlas(), panel })
      const box = inkBox({ buffer: atlas(), panel })
      const rect = panelRect({ panel })

      expect(outside).toBe(0)
      expect(box.height).toBeLessThan(rect.y1 - rect.y0)
      expect(box.width).toBeLessThan(rect.x1 - rect.x0)
    })
  }

  test('a design pinned to @2 draws exactly as it did, and its panels stay 6:7', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers = [
      { id: 'mark-old', kind: 'image', visible: true, opacity: 1, x: 0.5, y: 0.5, scale: 0.2, rotation: 0, assetId: 'asset_proof_red', aspect: 1 },
    ]
    const assetSources = { asset_proof_red: 'src:red' }
    const old = toRenderDocument({ document: { ...document, template: { id: 'tee-crew-short', version: 2 } }, assetSources }).document
    const current = toRenderDocument({ document, assetSources }).document
    const box = (projected: typeof old) =>
      inkBox({ buffer: rasterizeLayers({ document: projected, width: SIZE, height: SIZE, images: IMAGES }), panel: 'front' })

    expect(old.panelAspects).toBeUndefined()
    expect(old.layers.every((layer) => !('surface' in layer))).toBe(true)
    // As in the atlas: a square box.
    expect(box(old).width).toBe(box(old).height)
    expect(current.panelAspects?.front).toBe(0.611)
    expect(box(current).height).toBeLessThan(box(current).width)
  })
})

describe('approved presets', () => {
  test('the base pattern ids are pinned, because saved designs and the buttons refer to them', () => {
    expect(BASE_KINDS).toEqual(['solid', 'stripes', 'check'])

    for (const [patternId, kind] of [['stripe', 'stripes'], ['check', 'check'], ['solid', 'solid']] as const) {
      store().setBasePattern({ patternId })
      expect(getCanonicalDocument().base.kind).toBe(kind)
    }
  })
})
