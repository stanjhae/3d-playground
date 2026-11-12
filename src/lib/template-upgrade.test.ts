import { describe, expect, it } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { canUpgradeTemplate, upgradeToCurrentTemplate } from './template-upgrade'

function teeOn({ version }: { version: number }) {
  const document = createEmptyCanonicalDocument({ version })
  document.panels.front!.layers.push({
    id: 'word-front',
    kind: 'text',
    content: 'FRONT',
    face: 'display',
    color: '#111111',
    visible: true,
    opacity: 1,
    x: 0.3,
    y: 0.6,
    scale: 0.2,
    rotation: 0.4,
  })
  document.panels.back!.layers.push(
    {
      id: 'word-back',
      kind: 'text',
      content: 'BACK',
      face: 'sans',
      color: '#111111',
      visible: true,
      opacity: 1,
      x: 0.2,
      y: 0.5,
      scale: 0.2,
      rotation: 0.3,
    },
    {
      id: 'ink-back',
      kind: 'paint',
      visible: true,
      opacity: 1,
      strokes: [{ id: 's1', tool: 'brush', color: '#111111', width: 4, opacity: 1, points: [0.1, 0.2, 0.25, 0.4] }],
    },
  )
  return document
}

describe('upgradeToCurrentTemplate', () => {
  it('moves an @1 tee onto the real @4 tee, keeping every mark on its side of the body', () => {
    const result = upgradeToCurrentTemplate({ document: teeOn({ version: 1 }) })

    expect(result.ok && result.changed).toBe(true)
    expect(canUpgradeTemplate({ document: teeOn({ version: 1 }) })).toBe(true)
    if (!result.ok) return

    expect(result.document.template).toEqual({ id: 'tee-crew-short', version: 4 })
    // The front never mirrored: unchanged.
    expect(result.document.panels.front!.layers[0]).toMatchObject({ x: 0.3, rotation: 0.4 })
    // @1 stored the back in render space; @4 mirrors it, so the content flips back.
    expect(result.document.panels.back!.layers[0]).toMatchObject({ x: 0.8, rotation: -0.3 })
    const ink = result.document.panels.back!.layers[1]
    expect(ink?.kind === 'paint' ? ink.strokes[0]!.points : null).toEqual([0.9, 0.2, 0.75, 0.4])
  })

  it('re-pins @2 and @3 with their stored placements unchanged (their back already mirrors)', () => {
    for (const version of [2, 3]) {
      const source = teeOn({ version })
      const result = upgradeToCurrentTemplate({ document: source })

      expect(result.ok && result.changed).toBe(true)
      if (!result.ok) return
      expect(result.document.panels).toEqual(source.panels)
    }
  })

  it('leaves a design already on the newest version alone', () => {
    const document = teeOn({ version: 4 })

    expect(upgradeToCurrentTemplate({ document })).toEqual({ ok: true, document, changed: false })
    expect(canUpgradeTemplate({ document })).toBe(false)
  })
})
