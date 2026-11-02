import { describe, expect, test } from 'vitest'

import { type DesignDocument, createEmptyDocument } from './design-document'
import { countUnavailableImages } from './layer-images'

function documentWith({ layers }: { layers: DesignDocument['layers'] }): DesignDocument {
  return { ...createEmptyDocument({ garmentId: 'tee' }), layers }
}

const image = ({ id, src, visible = true, missing }: { id: string; src: string; visible?: boolean; missing?: true }) =>
  ({
    id,
    kind: 'graphic',
    panel: 'front',
    src,
    visible,
    x: 0.5,
    y: 0.5,
    scale: 0.3,
    rotation: 0,
    ...(missing ? { missing } : {}),
  }) as DesignDocument['layers'][number]

const pixels = { width: 1, height: 1, pixels: new Uint8ClampedArray(4) }

describe('countUnavailableImages (R04)', () => {
  test('counts images with no source and images that fail to decode', async () => {
    const document = documentWith({
      layers: [image({ id: 'ok', src: '/ok.png' }), image({ id: 'bad', src: '/bad.png' }), image({ id: 'gone', src: '', missing: true })],
    })

    const count = await countUnavailableImages({
      document,
      decode: async ({ src }) => (src === '/ok.png' ? pixels : null),
    })

    expect(count).toBe(2)
  })

  test('a hidden image can\'t publish as a placeholder, so it does not count', async () => {
    const document = documentWith({
      layers: [image({ id: 'hidden', src: '', visible: false, missing: true }), image({ id: 'off', src: '/bad.png', visible: false })],
    })

    expect(await countUnavailableImages({ document, decode: async () => null })).toBe(0)
  })

  test('a design whose images all load is clear to publish', async () => {
    const document = documentWith({ layers: [image({ id: 'ok', src: '/ok.png' })] })

    expect(await countUnavailableImages({ document, decode: async () => pixels })).toBe(0)
  })
})
