import { describe, expect, test } from 'vitest'

import { MOTIF_IDS, motifInk } from './base-motifs'
import { createEmptyCanonicalDocument, validateCanonicalDocument } from './canonical-document'
import { toRenderDocument } from './render-projection'
import { previewVersion } from './version-history'

// Tester, 22 Nov: more patterns, such as scales, honeycomb and leopard.

/** Share of one repeat a motif inks, sampled on a grid. */
function coverage({ motif }: { motif: (typeof MOTIF_IDS)[number] }) {
  let inked = 0
  const steps = 64

  for (let y = 0; y < steps; y += 1) {
    for (let x = 0; x < steps; x += 1) {
      inked += motifInk({ motif, x: (x / steps) * 8, y: (y / steps) * 8 }) ? 1 : 0
    }
  }

  return inked / (steps * steps)
}

describe('base motifs', () => {
  test.each(MOTIF_IDS)('%s shows both colours, and draws the same every time', (motif) => {
    const share = coverage({ motif })
    expect(share).toBeGreaterThan(0.08)
    expect(share).toBeLessThan(0.92)
    expect(coverage({ motif })).toBe(share)
  })

  test('the motifs differ from one another', () => {
    const signature = (motif: (typeof MOTIF_IDS)[number]) =>
      Array.from({ length: 32 * 32 }, (_, index) => (motifInk({ motif, x: ((index % 32) / 32) * 4, y: (Math.floor(index / 32) / 32) * 4 }) ? '1' : '0')).join('')
    expect(new Set(MOTIF_IDS.map(signature)).size).toBe(MOTIF_IDS.length)
  })

  test('a motif base is saved with its name, two colours and a period', () => {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'motif', motif: 'honeycomb', colors: ['#f3efe6', '#1a1c22'], period: 0.08 }
    expect(validateCanonicalDocument({ value: document }).ok).toBe(true)

    const unknown = { ...document, base: { ...document.base, motif: 'tartan' } }
    expect(validateCanonicalDocument({ value: unknown }).ok).toBe(false)

    const third = { ...document, base: { ...document.base, colors: ['#f3efe6', '#1a1c22', '#c4a15a'] } }
    expect(validateCanonicalDocument({ value: third }).ok).toBe(false)
  })

  test('it draws on every side as that motif, and history names it', () => {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'motif', motif: 'leopard', colors: ['#e6d3a8', '#2a1d14'], period: 0.1 }
    const { document: render } = toRenderDocument({ document })
    const fills = render.layers.filter((layer) => layer.id.startsWith('base-fill'))

    expect(fills.length).toBeGreaterThan(0)
    expect(fills.every((layer) => layer.kind === 'pattern' && layer.patternId === 'leopard')).toBe(true)
    expect(previewVersion({ document }).base.label).toBe('Leopard')
  })
})
