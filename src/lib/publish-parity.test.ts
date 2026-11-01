import { describe, expect, test } from 'vitest'

import { type CanonicalDocument, CANONICAL_PANEL_IDS, createEmptyCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { serializeCanonicalDocument } from './canonical-hash'
import { atlasPixelAtPanel, rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

/**
 * What publishing shows (#157, #153). Published art is the projected atlas
 * baked at 512/256/160, so these check atlas pixels after projection:
 * hidden layers never reach it, and each panel's marks stay on that panel
 * after a save-and-reload round trip (a restore copies stored content).
 */

const SIZES = [512, 256, 160] as const
const RENDER_PANELS = ['front', 'back', 'left', 'right'] as const

function dot({ id, x, y }: { id: string; x: number; y: number }) {
  return { id, tool: 'brush' as const, color: '#1a1c22' as const, width: 0.06, opacity: 1, points: [x - 0.02, y, x, y, x + 0.02, y] }
}

function inkAt({ document, size, panel, x, y }: { document: CanonicalDocument; size: number; panel: (typeof RENDER_PANELS)[number]; x: number; y: number }) {
  const buffer = rasterizeLayers({ document: toRenderDocument({ document }).document, width: size, height: size })
  return atlasPixelAtPanel({ buffer, panel, x, y }).a > 0
}

/** The stored copy a restore appends: serialized, then read back. */
function roundTrip({ document }: { document: CanonicalDocument }) {
  const parsed = validateCanonicalDocument({ value: JSON.parse(serializeCanonicalDocument({ document })) })
  if (!parsed.ok) throw new Error('round trip produced an invalid document')
  return parsed.document
}

describe('hidden layers are never published (#157)', () => {
  test('a hidden paint layer leaves no ink at any published size; the visible one does', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers = [
      { id: 'paint-shown', kind: 'paint', visible: true, opacity: 1, strokes: [dot({ id: 'ink-shown', x: 0.5, y: 0.3 })] },
      { id: 'paint-hidden', kind: 'paint', visible: false, opacity: 1, strokes: [dot({ id: 'ink-hidden', x: 0.5, y: 0.7 })] },
    ]
    const stored = roundTrip({ document })

    for (const size of SIZES) {
      expect(inkAt({ document: stored, size, panel: 'front', x: 0.5, y: 0.3 }), `shown @${size}`).toBe(true)
      expect(inkAt({ document: stored, size, panel: 'front', x: 0.5, y: 0.7 }), `hidden @${size}`).toBe(false)
    }
  })
})

describe('each panel publishes its own marks (#153)', () => {
  test('a mark on one panel shows on exactly one render panel, the same before and after a round trip', () => {
    for (const panel of CANONICAL_PANEL_IDS) {
      const document = createEmptyCanonicalDocument()
      document.panels[panel].layers = [
        { id: `paint-${panel}`, kind: 'paint', visible: true, opacity: 1, strokes: [dot({ id: `ink-${panel}`, x: 0.5, y: 0.5 })] },
      ]

      for (const size of SIZES) {
        const before = RENDER_PANELS.filter((render) => inkAt({ document, size, panel: render, x: 0.5, y: 0.5 }))
        const after = RENDER_PANELS.filter((render) => inkAt({ document: roundTrip({ document }), size, panel: render, x: 0.5, y: 0.5 }))

        expect(before, `${panel} @${size}`).toHaveLength(1)
        expect(after, `${panel} @${size} after round trip`).toEqual(before)
      }
    }
  })
})
