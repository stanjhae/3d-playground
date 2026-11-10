import { afterEach, describe, expect, test } from 'vitest'

import { type AtlasBuild, ATLAS_COMPILER_VERSION, artworkState, atlasBuildState, atlasStamp, useAtlasBuild, waitForCurrentAtlas } from './atlas-status'
import { createEmptyCanonicalDocument } from './canonical-document'
import { hashCanonicalDocument } from './canonical-hash'
import { type DesignDocument, createEmptyDocument } from './design-document'
import { rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

const graphic = (extra: Record<string, unknown> = {}) => ({
  id: 'mark',
  kind: 'graphic' as const,
  panel: 'front' as const,
  src: 'src:one',
  x: 0.5,
  y: 0.5,
  scale: 0.2,
  rotation: 0,
  opacity: 1,
  visible: true,
  ...extra,
})
const word = {
  id: 'word',
  kind: 'text' as const,
  panel: 'front' as const,
  content: 'WORD',
  face: 'display' as const,
  color: '#111111',
  x: 0.5,
  y: 0.5,
  scale: 0.1,
  rotation: 0,
  opacity: 1,
  visible: true,
}
const withLayers = (layers: unknown[]) => ({ ...createEmptyDocument({ garmentId: 'tee' }), layers }) as DesignDocument
const buildOf = (document: DesignDocument, extra: Partial<AtlasBuild> = {}): AtlasBuild => ({
  document,
  canonical: createEmptyCanonicalDocument(),
  revision: 3,
  compilerVersion: ATLAS_COMPILER_VERSION,
  state: 'ready',
  ...extra,
})

afterEach(() => useAtlasBuild.setState({ build: null }))

describe('artwork state', () => {
  const ready = () => 'ready' as const

  test('ready once every image and face is in', () => {
    const document = withLayers([graphic(), word])
    expect(artworkState({ document, images: { 'src:one': {} }, imagesSettled: true, faceState: ready })).toBe('ready')
  })

  test('loading while images or a face are pending', () => {
    const document = withLayers([graphic(), word])
    expect(artworkState({ document, images: {}, imagesSettled: false, faceState: ready })).toBe('loading')
    expect(artworkState({ document, images: { 'src:one': {} }, imagesSettled: true, faceState: () => 'loading' })).toBe('loading')
  })

  test('error when an image failed or has no bytes', () => {
    expect(artworkState({ document: withLayers([graphic()]), images: {}, imagesSettled: true, faceState: ready })).toBe('error')
    expect(
      artworkState({ document: withLayers([graphic({ src: '', missing: true })]), images: {}, imagesSettled: true, faceState: ready }),
    ).toBe('error')
  })

  test('a failed face is a stand-in, not an error; an image failure still wins', () => {
    const failed = () => 'failed' as const
    expect(artworkState({ document: withLayers([word]), images: {}, imagesSettled: true, faceState: failed })).toBe('fallback')
    expect(artworkState({ document: withLayers([graphic(), word]), images: {}, imagesSettled: true, faceState: failed })).toBe('error')
  })

  test('hidden layers do not hold it up', () => {
    const document = withLayers([graphic({ visible: false }), { ...word, visible: false }])
    expect(artworkState({ document, images: {}, imagesSettled: true, faceState: () => 'loading' })).toBe('ready')
  })
})

describe('whether a build is current', () => {
  const document = withLayers([])

  test('only for this document, revision and compiler', () => {
    expect(atlasBuildState({ build: buildOf(document), document, revision: 3 })).toBe('ready')
    expect(atlasBuildState({ build: null, document, revision: 3 })).toBe('loading')
    expect(atlasBuildState({ build: buildOf(document), document, revision: 4 })).toBe('loading')
    expect(atlasBuildState({ build: buildOf(withLayers([])), document, revision: 3 })).toBe('loading')
    expect(atlasBuildState({ build: buildOf(document, { compilerVersion: 0 }), document, revision: 3 })).toBe('loading')
  })

  test('and, when asked, for the same template', () => {
    const canonical = createEmptyCanonicalDocument()
    const other = { ...canonical, template: { ...canonical.template, version: canonical.template.version + 1 } }
    expect(atlasBuildState({ build: buildOf(document, { canonical }), document, revision: 3, canonical })).toBe('ready')
    expect(atlasBuildState({ build: buildOf(document, { canonical }), document, revision: 3, canonical: other })).toBe('loading')
    expect(atlasBuildState({ build: buildOf(document, { canonical: other }), document, revision: 3, canonical })).toBe('loading')
  })

  test('a stamp names the content, template and compiler it was drawn from', async () => {
    const canonical = createEmptyCanonicalDocument()
    const stamp = await atlasStamp({ build: buildOf(document, { canonical }) })
    expect(stamp).toEqual({
      contentHash: await hashCanonicalDocument({ document: canonical }),
      template: canonical.template,
      compilerVersion: ATLAS_COMPILER_VERSION,
    })

    const edited = createEmptyCanonicalDocument()
    edited.panels.front.layers = [{ id: 'paint', kind: 'paint', visible: true, opacity: 1, strokes: [] }]
    expect((await atlasStamp({ build: buildOf(document, { canonical: edited }) })).contentHash).not.toBe(stamp.contentHash)
  })

  test('an older build reported late does not count for a newer revision', async () => {
    const waiting = waitForCurrentAtlas({ current: () => ({ document, revision: 4 }), timeoutMs: 40 })
    useAtlasBuild.setState({ build: buildOf(document, { revision: 3 }) })
    expect(await waiting).toBe('loading')
  })

  test('waiting ends as soon as the current build settles', async () => {
    useAtlasBuild.setState({ build: buildOf(document, { state: 'loading' }) })
    const waiting = waitForCurrentAtlas({ current: () => ({ document, revision: 3 }) })
    useAtlasBuild.setState({ build: buildOf(document) })
    expect(await waiting).toBe('ready')
  })
})

describe('the atlas itself', () => {
  const canonical = () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers = [
      {
        id: 'paint',
        kind: 'paint',
        visible: true,
        opacity: 1,
        strokes: [{ id: 'ink', tool: 'brush', color: '#1a1c22', width: 0.03, opacity: 1, points: [0.2, 0.4, 0.8, 0.5] }],
      },
    ]
    return toRenderDocument({ document }).document
  }

  test('the same document draws the same pixels', () => {
    expect(rasterizeLayers({ document: canonical(), width: 128, height: 128 }).pixels).toEqual(
      rasterizeLayers({ document: canonical(), width: 128, height: 128 }).pixels,
    )
  })

  test('drawing never changes the document', () => {
    const document = canonical()
    const before = JSON.stringify(document)
    rasterizeLayers({ document, width: 128, height: 128 })
    expect(JSON.stringify(document)).toBe(before)
  })
})
