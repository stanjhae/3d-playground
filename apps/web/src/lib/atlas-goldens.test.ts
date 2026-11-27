import { describe, expect, test } from 'vitest'

import { ATLAS_COMPILER_VERSION } from './atlas-status'
import {
  type BrushStroke,
  type CanonicalDocument,
  type CanonicalLayer,
  type CanonicalPanelId,
  type GarmentBase,
  createEmptyCanonicalDocument,
} from './canonical-document'
import { type AtlasBuffer, createAtlasBuffer, rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

/**
 * Golden atlases: the exact pixels a known set of designs draws, at each size
 * publishing uses. Any change to drawing fails here, so a renderer change is
 * either pixel-identical or a deliberate re-approval:
 *
 *   1. bump ATLAS_COMPILER_VERSION in atlas-status.ts
 *   2. pnpm exec vitest run atlas-goldens -u
 *   3. look at what changed in atlas-goldens.json before committing
 *
 * Words need a DOM canvas, so they are pinned in the browser, not here.
 */

const SIZES = [512, 256, 160] as const
const PANELS: CanonicalPanelId[] = ['front', 'back', 'left', 'right']
const ASSET = 'asset_golden0001'
const ASSET_SRC = '/golden/asset.png'

function brush({ id, points, color = '#1a1c22', width = 0.05, opacity = 1 }: {
  id: string
  points: number[]
  color?: `#${string}`
  width?: number
  opacity?: number
}): BrushStroke {
  return { id, tool: 'brush', color, width, opacity, points }
}

function design({
  layers = {},
  base,
  version = 3,
}: {
  layers?: Partial<Record<CanonicalPanelId, CanonicalLayer[]>>
  base?: GarmentBase
  version?: number
}): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.template = { ...document.template, version }

  if (base) {
    document.base = base
  }

  for (const panel of PANELS) {
    document.panels[panel].layers = layers[panel] ?? []
  }

  return document
}

/** A stroke, a translucent stroke and an erased gap on every panel. */
function inkEverywhere(): Partial<Record<CanonicalPanelId, CanonicalLayer[]>> {
  return Object.fromEntries(
    PANELS.map((panel) => [
      panel,
      [
        {
          id: `paint-${panel}`,
          kind: 'paint',
          visible: true,
          opacity: 1,
          strokes: [
            brush({ id: `a-${panel}`, points: [0.15, 0.2, 0.5, 0.6, 0.85, 0.3], width: 0.08 }),
            brush({ id: `b-${panel}`, points: [0.2, 0.8, 0.8, 0.75], color: '#c0392b', opacity: 0.55, width: 0.12 }),
            { id: `e-${panel}`, tool: 'eraser', width: 0.04, points: [0.5, 0.1, 0.5, 0.9] },
          ],
        },
      ],
    ]),
  )
}

const FIXTURES: Record<string, () => CanonicalDocument> = {
  'empty': () => design({}),
  'ink on every panel': () => design({ layers: inkEverywhere() }),
  'translucent layer over ink': () =>
    design({
      layers: {
        front: [
          { id: 'under', kind: 'paint', visible: true, opacity: 1, strokes: [brush({ id: 'u', points: [0.1, 0.5, 0.9, 0.5], width: 0.2 })] },
          {
            id: 'over',
            kind: 'paint',
            visible: true,
            opacity: 0.4,
            strokes: [
              brush({ id: 'o', points: [0.5, 0.1, 0.5, 0.9], color: '#1f6feb', width: 0.2 }),
              { id: 'oe', tool: 'eraser', width: 0.05, points: [0.3, 0.5, 0.7, 0.5] },
            ],
          },
        ],
      },
    }),
  'hidden layer': () =>
    design({
      layers: {
        back: [{ id: 'hidden', kind: 'paint', visible: false, opacity: 1, strokes: [brush({ id: 'h', points: [0.2, 0.2, 0.8, 0.8] })] }],
      },
    }),
  'image, turned and translucent': () =>
    design({
      layers: {
        front: [{ id: 'img', kind: 'image', visible: true, opacity: 0.8, assetId: ASSET, aspect: 1.6, x: 0.45, y: 0.55, scale: 0.4, rotation: 0.35 }],
        right: [{ id: 'img-r', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 1, x: 0.5, y: 0.5, scale: 0.3, rotation: 0 }],
      },
    }),
  'ink above an image': () =>
    design({
      layers: {
        back: [
          { id: 'img', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 0.75, x: 0.5, y: 0.5, scale: 0.5, rotation: -0.2 },
          { id: 'paint', kind: 'paint', visible: true, opacity: 1, strokes: [brush({ id: 'x', points: [0.2, 0.3, 0.8, 0.7], color: '#f4d03f', width: 0.1 })] },
        ],
      },
    }),
  'stripes base': () =>
    design({ base: { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.08, angle: 0 }, layers: inkEverywhere() }),
  'check base': () => design({ base: { kind: 'check', colors: ['#f3efe6', '#2e7d32'], period: 0.1 } }),
  // @3 changed how images and words keep their shape; brush ink draws the same.
  'older template (@2) with an image': () =>
    design({
      version: 2,
      layers: {
        front: [{ id: 'img', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 1.6, x: 0.5, y: 0.5, scale: 0.4, rotation: 0 }],
      },
    }),
  'current template with the same image': () =>
    design({
      layers: {
        front: [{ id: 'img', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 1.6, x: 0.5, y: 0.5, scale: 0.4, rotation: 0 }],
      },
    }),
}

/** A small image with a gradient and a transparent corner, so sampling shows. */
function goldenImage(): AtlasBuffer {
  const image = createAtlasBuffer({ width: 32, height: 20 })

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      image.pixels[offset] = x * 8
      image.pixels[offset + 1] = y * 12
      image.pixels[offset + 2] = 160
      image.pixels[offset + 3] = x < 6 && y < 6 ? 0 : 255
    }
  }

  return image
}

/** Two independent 32-bit FNV-1a passes; plenty to tell any pixel change. */
function pixelHash({ pixels }: { pixels: Uint8ClampedArray }) {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ pixels.length

  for (let index = 0; index < pixels.length; index += 1) {
    a = Math.imul(a ^ pixels[index]!, 0x01000193)
    b = Math.imul(b ^ pixels[index]! ^ (index & 0xff), 0x5bd1e995)
  }

  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

function atlasHash({ document, size }: { document: CanonicalDocument; size: number }) {
  const { document: render } = toRenderDocument({ document, assetSources: { [ASSET]: ASSET_SRC } })
  const buffer = rasterizeLayers({ document: render, width: size, height: size, images: { [ASSET_SRC]: goldenImage() } })
  return pixelHash({ pixels: buffer.pixels })
}

function currentHashes() {
  const hashes: Record<string, string> = {}

  for (const [name, fixture] of Object.entries(FIXTURES)) {
    for (const size of SIZES) {
      hashes[`${name} @${size}`] = atlasHash({ document: fixture(), size })
    }
  }

  return hashes
}

describe('golden atlases', () => {
  test('every fixture draws exactly its approved pixels', async () => {
    // The compiler version is part of the file, so changing drawing without
    // bumping it, or bumping it without re-approving, both fail here.
    const goldens = { compilerVersion: ATLAS_COMPILER_VERSION, hashes: currentHashes() }

    await expect(`${JSON.stringify(goldens, null, 2)}\n`).toMatchFileSnapshot('./atlas-goldens.json')
  })

  test('the fixtures draw differently from each other', () => {
    const at512 = Object.entries(currentHashes()).filter(([key]) => key.endsWith('@512'))
    const byHash = new Map<string, string[]>()

    for (const [key, hash] of at512) {
      byHash.set(hash, [...(byHash.get(hash) ?? []), key])
    }

    // A hidden layer draws nothing, so only it may match the empty design.
    expect([...byHash.values()].filter((keys) => keys.length > 1)).toEqual([['empty @512', 'hidden layer @512']])
  })
})
