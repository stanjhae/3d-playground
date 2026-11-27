import { describe, expect, test } from 'vitest'

import { readCanonicalDocument } from '../canonical-document'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { publicAssetPath, publicSceneDocument } from './public-scene'

/** The golden document with a hidden layer, a locked one, an image fill and a library graphic. */
function storedDocument() {
  const document = structuredClone(GOLDEN_DOCUMENT) as unknown as {
    panels: Record<string, { layers: Record<string, unknown>[] }>
  }
  document.panels.front!.layers.push({
    id: 'secret-note',
    kind: 'text',
    visible: false,
    opacity: 1,
    content: 'my phone number',
    face: 'display',
    color: '#111111',
    x: 0.5,
    y: 0.2,
    scale: 0.1,
    rotation: 0,
  })
  document.panels.front!.layers.push({
    id: 'hidden-upload',
    kind: 'image',
    visible: false,
    opacity: 1,
    assetId: 'asset_hiddenhidden',
    aspect: 1,
    x: 0.5,
    y: 0.5,
    scale: 0.2,
    rotation: 0,
  })
  document.panels.back!.layers[0] = { ...document.panels.back!.layers[0], locked: true, name: 'Owner note' }
  document.panels.left!.layers.push({
    id: 'library-mark',
    kind: 'image',
    visible: true,
    opacity: 1,
    assetId: 'asset_lib_crossgothic',
    aspect: 1,
    x: 0.5,
    y: 0.5,
    scale: 0.2,
    rotation: 0,
  })
  return document
}

describe('the public scene', () => {
  test('keeps only visible layers, without names or locks', () => {
    const scene = publicSceneDocument({ content: storedDocument() })!
    const json = JSON.stringify(scene.document)

    expect(json).not.toContain('my phone number')
    expect(json).not.toContain('asset_hiddenhidden')
    expect(json).not.toContain('Owner note')
    expect(json).not.toContain('Crest')
    expect(json).not.toContain('"locked"')
    expect(json).toContain('Café 26')
  })

  test('lists the uploaded images visible layers draw, not library art or hidden ones', () => {
    expect(publicSceneDocument({ content: storedDocument() })!.assetIds).toEqual(['asset_3f9a1c22b7'])
  })

  test('is still a document the renderer reads', () => {
    const scene = publicSceneDocument({ content: storedDocument() })!

    expect(readCanonicalDocument({ value: scene.document }).ok).toBe(true)
  })

  test('refuses anything that is not a document', () => {
    expect(publicSceneDocument({ content: null })).toBeNull()
    expect(publicSceneDocument({ content: { panels: { front: { layers: 'x' } } } })).toBeNull()
    expect(publicSceneDocument({ content: [] })).toBeNull()
  })

  test('image URLs are ours, pinned to the version', () => {
    expect(publicAssetPath({ slug: '3f9a1c22b7e04d11', assetId: 'asset_3f9a1c22b7', seq: 4 })).toBe(
      '/api/flp/public/3f9a1c22b7e04d11/asset/asset_3f9a1c22b7?seq=4',
    )
  })
})
