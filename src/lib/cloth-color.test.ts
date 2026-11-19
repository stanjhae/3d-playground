import { describe, expect, test } from 'vitest'

import { type CanonicalDocument, createEmptyCanonicalDocument } from './canonical-document'
import { DEFAULT_CLOTH_COLOR, clothColorOf } from './cloth-color'
import { INK_COLORS } from './paint-colors'
import { paintOverCloth, rasterizeLayers } from './paint-atlas'
import { atlasSourceRect } from './panel-uv'
import { toRenderDocument } from './render-projection'
import { TEMPLATE_IDS, currentTemplateFor } from './template-manifest'

/**
 * Tester pass 3: with a striped base, the flat panels showed cream and the
 * stripe colour while the 3D showed the chosen ground and the stripes. Both
 * now take the bare cloth from the same place (`clothColorOf`), so they show
 * the same two colours.
 */

const ink = (name: string) => INK_COLORS.find((entry) => entry.name === name)!.value as `#${string}`
const OXBLOOD = ink('Oxblood')
const INK = ink('Ink')
const SIZE = 512

function hex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function striped({ templateId, colors }: { templateId: string; colors: [`#${string}`, `#${string}`] }): CanonicalDocument {
  const document = createEmptyCanonicalDocument({ templateId: templateId as never })
  return { ...document, base: { kind: 'stripes', colors, period: 0.08, angle: 0 } }
}

/** Every colour a front panel shows: the atlas's ink laid over a cloth colour, as a canvas or the shader blends it. */
function frontColours({ document, cloth }: { document: ReturnType<typeof toRenderDocument>['document']; cloth: string }) {
  const atlas = rasterizeLayers({ document, width: SIZE, height: SIZE, images: {} })
  const rect = atlasSourceRect({ panel: 'front', width: SIZE, height: SIZE, rects: atlas.panelUv })
  const ground = { r: parseInt(cloth.slice(1, 3), 16), g: parseInt(cloth.slice(3, 5), 16), b: parseInt(cloth.slice(5, 7), 16) }
  const counts = new Map<string, number>()

  // The middle of the panel, clear of its anti-aliased rim.
  for (let y = Math.ceil(rect.sourceY + rect.sourceHeight * 0.25); y < rect.sourceY + rect.sourceHeight * 0.75; y += 1) {
    for (let x = Math.ceil(rect.sourceX + rect.sourceWidth * 0.25); x < rect.sourceX + rect.sourceWidth * 0.75; x += 1) {
      const at = (y * atlas.width + x) * 4
      const pixel = { r: atlas.pixels[at]!, g: atlas.pixels[at + 1]!, b: atlas.pixels[at + 2]!, a: atlas.pixels[at + 3]! }
      const colour = hex(paintOverCloth({ cloth: ground, ink: pixel }))
      counts.set(colour, (counts.get(colour) ?? 0) + 1)
    }
  }

  // Colours that cover a real share of the panel (stripe edges blend).
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  return new Set([...counts].filter(([, count]) => count / total > 0.1).map(([colour]) => colour))
}

/** The 3D cloth colour: the `body` override the garment draws, else the template's material. */
function garmentColour({ document, templateId }: { document: ReturnType<typeof toRenderDocument>['document']; templateId: string }) {
  return document.overrides.findLast((override) => override.meshName === 'body')?.color ?? currentTemplateFor({ templateId }).material.color
}

describe('the flat panels and the 3D show the same base colours', () => {
  test.each(['hoodie', 'tee-crew-short', 'slip', 'mixed', 'coat', 'suit', 'overall', 'tailored', 'gown'])(
    'stripes on the %s: the panel shows the ground and the stripe colour, as the 3D does',
    (templateId) => {
      const projection = toRenderDocument({ document: striped({ templateId, colors: [OXBLOOD, INK] }) }).document

      // What the 3D draws: the stamp's ink over the garment colour.
      const stamp = projection.layers.find((layer) => layer.id.startsWith('base-fill-'))
      expect(stamp).toMatchObject({ kind: 'pattern', color: INK })
      const threeD = frontColours({ document: projection, cloth: garmentColour({ document: projection, templateId }) })
      // What the flat panel draws: the same ink over its ground.
      const flat = frontColours({ document: projection, cloth: clothColorOf({ document: projection }) })

      expect(threeD).toEqual(new Set([OXBLOOD, INK]))
      expect(flat).toEqual(threeD)
    },
  )

  test('a solid colour is the panel ground', () => {
    const document = { ...createEmptyCanonicalDocument({ templateId: 'hoodie' }), base: { kind: 'solid' as const, color: OXBLOOD } }
    expect(clothColorOf({ document: toRenderDocument({ document }).document })).toBe(OXBLOOD)
  })

  test.each(TEMPLATE_IDS)('a new %s design: the panel ground is the template colour the 3D starts from', (templateId) => {
    const manifest = currentTemplateFor({ templateId })
    const projection = toRenderDocument({ document: createEmptyCanonicalDocument({ templateId: templateId as never }) }).document

    expect(projection.overrides).toEqual([])
    expect(clothColorOf({ document: projection })).toBe(manifest.material.color)
  })

  test('a garment with no template and no colour keeps the house cream', () => {
    expect(clothColorOf({ document: { garmentId: 'jacket', garmentVersion: 1, overrides: [] } })).toBe(DEFAULT_CLOTH_COLOR)
  })
})
