import { beforeEach, describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import { parseCreateSearch } from './create-search'
import { createEmptyDocument } from './design-document'
import { useEditorStore } from './editor-store'
import { importLegacyDesign } from './legacy-import'
import { LIBRARY_ASSET_SOURCES, isLibraryAssetId, libraryAssetId } from './library-assets'
import { initialStudioDocument } from './studio-create'

const store = () => useEditorStore.getState()
const CLOUD = { designId: '0f6e8b8c-3c1d-4f7a-9a52-2f1c5b7e9d10', headSeq: 3, title: 'Crest tee' }

describe('library graphics', () => {
  test('shipped graphics have stable asset_lib ids that resolve to their files', () => {
    const id = libraryAssetId({ src: '/graphics/cross-simple.svg' })

    expect(id).toBe('asset_lib_cross-simple')
    expect(isLibraryAssetId({ assetId: id! })).toBe(true)
    expect(LIBRARY_ASSET_SOURCES[id!]).toBe('/graphics/cross-simple.svg')
    expect(libraryAssetId({ src: 'data:image/png;base64,AAAA' })).toBeNull()
  })

  test('importing a library graphic needs no upload', async () => {
    const result = await importLegacyDesign({
      value: {
        ...createEmptyDocument({ garmentId: 'tee' }),
        layers: [
          { id: 'g', kind: 'graphic', panel: 'front', src: '/graphics/flame-rise.svg', x: 0.5, y: 0.5, scale: 0.3, rotation: 0, opacity: 1, visible: true },
        ],
      },
    })

    expect(result.ok && result.pendingAssets).toEqual([])
    expect(result.ok && result.document.panels.front.layers[0]).toMatchObject({ assetId: 'asset_lib_flame-rise' })
  })
})

describe('new cloud design content', () => {
  test('without a landing design it is an empty tee', () => {
    expect(initialStudioDocument({ handoff: null })).toEqual({
      document: createEmptyCanonicalDocument(),
      notes: [],
      fromLanding: false,
    })
  })

  test('a landing design carries over; its colour wins and template changes are reported', () => {
    const { document, notes, fromLanding } = initialStudioDocument({
      handoff: {
        garmentId: 'tee',
        color: '#6B1D2A',
        neck: 'v',
        document: {
          ...createEmptyDocument({ garmentId: 'tee' }),
          layers: [
            { id: 'w', kind: 'text', panel: 'front', content: 'FLP', face: 'display', color: '#f4ead4', x: 0.5, y: 0.5, scale: 0.12, rotation: 0, opacity: 1, visible: true },
          ],
        },
      },
    })

    expect(fromLanding).toBe(true)
    expect(document.base).toEqual({ kind: 'solid', color: '#6b1d2a' })
    expect(document.panels.front.layers[0]).toMatchObject({ id: 'w', content: 'FLP' })
    expect(notes.map((note) => note.path)).toContain('structural.neck')
  })
})

describe('opening a cloud design in the studio', () => {
  beforeEach(() => {
    store().reset()
  })

  test('loadCanonical replaces content, resets undo and records the cloud head', () => {
    store().addText({ content: 'LOCAL' })
    const before = store().revision

    store().loadCanonical({ document: GOLDEN_DOCUMENT, cloud: CLOUD })

    expect(store()).toMatchObject({ cloud: CLOUD, title: 'Crest tee', undoCount: 0, redoCount: 0, garmentId: 'tee' })
    expect(store().revision).toBeGreaterThan(before)
    expect(store().document.layers.find((layer) => layer.id === 'text-back')).toMatchObject({
      kind: 'text',
      content: 'Café 26',
    })
  })

  test('a cloud design stays a tee and acknowledgements move its head', () => {
    store().loadCanonical({ document: GOLDEN_DOCUMENT, cloud: CLOUD })
    store().setGarmentId({ garmentId: 'gown' })
    store().setCloudHead({ headSeq: 4 })

    expect(store().garmentId).toBe('tee')
    expect(store().cloud?.headSeq).toBe(4)
  })

  test('a local load leaves cloud mode', () => {
    store().loadCanonical({ document: GOLDEN_DOCUMENT, cloud: CLOUD })
    store().hydrateDocument({ document: createEmptyDocument({ garmentId: 'tee' }) })

    expect(store().cloud).toBeNull()
  })

  test('only a UUID opens a cloud design', () => {
    expect(parseCreateSearch({ search: { cloud: CLOUD.designId } }).cloud).toBe(CLOUD.designId)
    expect(parseCreateSearch({ search: { cloud: '../etc' } }).cloud).toBeUndefined()
  })
})
