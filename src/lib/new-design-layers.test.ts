import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { garmentPanels } from './garments'
import { layerListGroups } from './layer-list'
import { toRenderDocument } from './render-projection'
import { TEMPLATE_IDS, currentTemplateFor } from './template-manifest'

/**
 * Tester pass 3: a new hoodie (and every other new design) listed an empty
 * "Ink" layer. The render keeps one empty ink layer for a bare garment; it is
 * in no panel's stack, so the layer list leaves it out.
 */
describe('a new design lists no layers', () => {
  test.each(TEMPLATE_IDS)('a new %s', (templateId) => {
    const manifest = currentTemplateFor({ templateId })
    const { document } = toRenderDocument({ document: createEmptyCanonicalDocument({ templateId: templateId as never }) })

    // The stand-in the render keeps for a bare garment.
    expect(document.layers).toEqual([expect.objectContaining({ kind: 'paint', strokes: [] })])
    expect(
      layerListGroups({ layers: document.layers, panels: garmentPanels({ garmentId: manifest.garmentId }), placement: () => null }),
    ).toEqual([])
  })

  test('an ink layer in a panel stack still lists while empty', () => {
    const layers = [{ id: 'paint-a', kind: 'paint' as const, visible: true, strokes: [] }]
    const groups = layerListGroups({
      layers,
      panels: [{ id: 'front', label: 'Front' }],
      placement: () => ({ panel: 'front', index: 0, count: 1 }),
    })

    expect(groups.flatMap((group) => group.rows.map((row) => row.name))).toEqual(['Ink'])
  })
})
