import { describe, expect, it } from 'vitest'

import { createEmptyDocument } from './design-document'
import { landingRenderDocument } from './landing-real-tee'

describe('landingRenderDocument', () => {
  it('draws the hero on the real tee model, with or without a sketch', () => {
    expect(landingRenderDocument({}).modelSrc).toBe('/models/tee-real.glb')

    const sketched = landingRenderDocument({
      document: {
        ...createEmptyDocument({ garmentId: 'tee' }),
        layers: [
          {
            id: 'ink',
            kind: 'paint',
            panel: 'front',
            visible: true,
            strokes: [{ id: 's', tool: 'brush', color: '#111111', width: 6, points: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }] }],
          },
        ],
      } as never,
    })

    expect(sketched.modelSrc).toBe('/models/tee-real.glb')
    expect(landingRenderDocument({
      document: {
        ...createEmptyDocument({ garmentId: 'tee' }),
        layers: [{ id: 'g', kind: 'graphic', panel: 'front', src: '/graphics/logo-flv.svg', x: 0.5, y: 0.5, scale: 0.3, rotation: 0, opacity: 1, visible: true }],
      } as never,
    }).layers.find((layer) => layer.id === 'g')).toMatchObject({ src: '/graphics/logo-flv.svg' })
    expect(sketched.layers.some((layer) => layer.kind === 'paint')).toBe(true)
  })
})
