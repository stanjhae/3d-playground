import { describe, expect, test } from 'vitest'

import { type CanonicalFillLayer, type GarmentBase, createEmptyCanonicalDocument } from './canonical-document'
import { type AtlasBuffer, atlasPixelAtPanel, bleedRadius, rasterizeLayers } from './paint-atlas'
import { atlasSourceRect } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { TEE_CREW_SHORT_V5, TEE_CREW_SHORT_V6 } from './template-manifest'

/**
 * Seam gaps (founder, 17 Nov): edges that faded between the 2D panels and
 * the 3D garment, and base stripes that didn't meet at the side seams.
 */

const SIZE = 1024

const FILL: CanonicalFillLayer = {
  id: 'fill',
  kind: 'fill',
  visible: true,
  opacity: 1,
  source: { pattern: 'stripes', colors: ['#c0392b', '#1a1c22'] },
  tile: 0.2,
  rotation: 0.3,
}

function draw({ version = 6, base, front = [] }: { version?: number; base?: GarmentBase; front?: CanonicalFillLayer[] }) {
  const document = createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version })
  if (base) document.base = base
  document.panels.front.layers = front
  const render = toRenderDocument({ document }).document
  return { render, buffer: rasterizeLayers({ document: render, width: SIZE, height: SIZE }) }
}

function pixel({ buffer, column, row }: { buffer: AtlasBuffer; column: number; row: number }) {
  const index = (row * buffer.width + column) * 4
  return [...buffer.pixels.slice(index, index + 4)]
}

describe('atlas bleed', () => {
  test('pixels in the band round a panel take its edge colour, out to the bleed radius', () => {
    const { render, buffer } = draw({ front: [FILL] })
    const rect = atlasSourceRect({ panel: 'front', width: SIZE, height: SIZE, rects: render.panelUv })
    const x0 = Math.floor(rect.sourceX)
    const x1 = Math.ceil(rect.sourceX + rect.sourceWidth)
    const y0 = Math.floor(rect.sourceY)
    const y1 = Math.ceil(rect.sourceY + rect.sourceHeight)
    const radius = bleedRadius({ width: SIZE })
    const middleRow = Math.round((y0 + y1) / 2)
    const middleColumn = Math.round((x0 + x1) / 2)

    expect(radius).toBe(8)
    // The front is the right-hand panel: its right edge faces the atlas border.
    for (let step = 1; step <= radius && x1 - 1 + step < SIZE; step += 1) {
      expect(pixel({ buffer, column: x1 - 1 + step, row: middleRow }), `right +${step}`).toEqual(pixel({ buffer, column: x1 - 1, row: middleRow }))
    }
    // Above and below, too, and diagonally off a corner.
    for (let step = 1; step <= radius; step += 1) {
      expect(pixel({ buffer, column: middleColumn, row: y1 - 1 + step })).toEqual(pixel({ buffer, column: middleColumn, row: y1 - 1 }))
    }
    expect(pixel({ buffer, column: x0 - 1, row: y1 + 2 })).toEqual(pixel({ buffer, column: x0, row: y1 - 1 }))
    // Every edge pixel is opaque (no fade), and beyond the band nothing is drawn.
    expect(pixel({ buffer, column: x0, row: middleRow })[3]).toBe(255)
    expect(pixel({ buffer, column: middleColumn, row: y1 - 1 + radius + 1 })[3]).toBe(0)
  })

  test('neighbours split the gap between them and never bleed across each other', () => {
    const { render, buffer } = draw({ front: [FILL] })
    const back = atlasSourceRect({ panel: 'back', width: SIZE, height: SIZE, rects: render.panelUv })
    const front = atlasSourceRect({ panel: 'front', width: SIZE, height: SIZE, rects: render.panelUv })
    const row = Math.round(front.sourceY + front.sourceHeight / 2)
    const backEdge = Math.ceil(back.sourceX + back.sourceWidth)
    const frontEdge = Math.floor(front.sourceX)

    // Only the front has ink: the back's half of the gap stays empty.
    expect(frontEdge - backEdge).toBeGreaterThan(2)
    expect(pixel({ buffer, column: backEdge, row })[3]).toBe(0)
    expect(pixel({ buffer, column: frontEdge - 1, row })).toEqual(pixel({ buffer, column: frontEdge, row }))
    // The back itself is untouched.
    expect(pixel({ buffer, column: backEdge - 2, row })[3]).toBe(0)
  })

  test('clip edges round outward: the panel\'s rim pixels are drawn', () => {
    const { render, buffer } = draw({ front: [FILL] })
    const rect = atlasSourceRect({ panel: 'front', width: SIZE, height: SIZE, rects: render.panelUv })
    const row = Math.round(rect.sourceY + rect.sourceHeight / 2)

    // The rim column the UVs reach, even though the rectangle starts part-way into it.
    expect(rect.sourceX % 1).not.toBe(0)
    expect(pixel({ buffer, column: Math.floor(rect.sourceX), row })[3]).toBe(255)
  })
})

describe('base stripes and check meet at the side seams', () => {
  /** How often the front and the back agree on ink along both side seams, sampled up the body. */
  function seamAgreement({ version, base }: { version: number; base: GarmentBase }) {
    const manifest = version === 6 ? TEE_CREW_SHORT_V6 : TEE_CREW_SHORT_V5
    const { buffer } = draw({ version, base })
    const front = manifest.regions.front!
    const back = manifest.regions.back!
    // Heights both panels cover, in metres (@5 has no frame: the bake's notes give its extent, so use @6's).
    const frames = { front: TEE_CREW_SHORT_V6.regions.front!.frame!, back: TEE_CREW_SHORT_V6.regions.back!.frame! }
    const low = Math.max(frames.front.y0, frames.back.y0) + 0.05
    const high = Math.min(frames.front.y1, frames.back.y1) - 0.1
    let agree = 0
    let total = 0

    for (let height = low; height <= high; height += 0.0025) {
      const yFront = (height - frames.front.y0) / (frames.front.y1 - frames.front.y0)
      const yBack = (height - frames.back.y0) / (frames.back.y1 - frames.back.y0)
      // Canonical x 0 is the wearer's right seam on both; the back renders mirrored.
      for (const [frontX, backX] of [
        [0.003, 0.997],
        [0.997, 0.003],
      ] as const) {
        const a = atlasPixelAtPanel({ buffer, panel: front.renderPanel, x: frontX, y: yFront }).a > 0
        const b = atlasPixelAtPanel({ buffer, panel: back.renderPanel, x: backX, y: yBack }).a > 0
        agree += a === b ? 1 : 0
        total += 1
      }
    }

    return agree / total
  }

  test('horizontal stripes', () => {
    const base: GarmentBase = { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.03, angle: 0 }
    expect(seamAgreement({ version: 6, base })).toBeGreaterThan(0.95)
  })

  test('turned stripes and a check, which need the across phase as well', () => {
    expect(seamAgreement({ version: 6, base: { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.03, angle: 0.6 } })).toBeGreaterThan(0.95)
    expect(seamAgreement({ version: 6, base: { kind: 'check', colors: ['#f3efe6', '#1a1c22'], period: 0.04 } })).toBeGreaterThan(0.95)
  })

  test('@5 keeps its own drawing: each panel phased from its own stamp', () => {
    const base: GarmentBase = { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.03, angle: 0 }
    const { render } = draw({ version: 5, base })
    expect(render.layers.filter((layer) => layer.kind === 'pattern' && layer.garmentPhase)).toEqual([])
    expect(draw({ version: 6, base }).render.layers.filter((layer) => layer.kind === 'pattern' && layer.garmentPhase)).toHaveLength(4)
  })
})
