import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import type { UploadedAsset } from './flp-api/assets'
import { sourceToBlob, uploadPendingAssets } from './legacy-assets'

function withImages(ids: string[]) {
  const document = createEmptyCanonicalDocument()
  document.panels.front.layers = ids.map((assetId, index) => ({
    id: `img-${index}`,
    kind: 'image' as const,
    visible: true,
    opacity: 1,
    assetId,
    aspect: 1,
    x: 0.5,
    y: 0.5,
    scale: 0.3,
    rotation: 0,
  }))
  return document
}

const uploaded = (assetId: string): UploadedAsset => ({
  assetId,
  mimeType: 'image/png',
  width: 10,
  height: 10,
  readUrl: 'https://example.test/read',
  readUrlExpiresAt: Date.now() + 60_000,
})

describe('uploadPendingAssets (#141)', () => {
  test('uploaded images point at their real asset ids', async () => {
    const result = await uploadPendingAssets({
      document: withImages(['asset_reserved_aaaaaaaa']),
      pendingAssets: [{ assetId: 'asset_reserved_aaaaaaaa', src: 'data:image/png;base64,AAAA' }],
      upload: async () => ({ ok: true, data: uploaded('asset_real_bbbbbbbbbb') }),
      toBlob: async () => new Blob(['x'], { type: 'image/png' }),
    })

    expect(result.document.panels.front.layers[0]).toMatchObject({ kind: 'image', assetId: 'asset_real_bbbbbbbbbb' })
    expect(result.notes).toEqual([])
  })

  test('a failed upload leaves that image out, with a note, and keeps the others', async () => {
    const result = await uploadPendingAssets({
      document: withImages(['asset_reserved_good0000', 'asset_reserved_bad00000']),
      pendingAssets: [
        { assetId: 'asset_reserved_good0000', src: 'data:good' },
        { assetId: 'asset_reserved_bad00000', src: 'data:bad' },
      ],
      upload: async (file) =>
        (await file.text()) === 'good'
          ? { ok: true, data: uploaded('asset_real_good000000') }
          : { ok: false, code: 'invalid', message: 'This image cannot be used' },
      toBlob: async (src) => new Blob([src.slice(5)], { type: 'image/png' }),
    })

    expect(result.document.panels.front.layers.map((layer) => (layer.kind === 'image' ? layer.assetId : layer.kind))).toEqual(['asset_real_good000000'])
    expect(result.notes).toEqual([
      { path: '$.panels.front.layers[1]', message: 'an image could not be uploaded (This image cannot be used) and was left out' },
    ])
    // A retry starts from `partial` and uploads only what failed.
    expect(result.partial.panels.front.layers.map((layer) => (layer.kind === 'image' ? layer.assetId : layer.kind))).toEqual([
      'asset_real_good000000',
      'asset_reserved_bad00000',
    ])
    expect(result.failed).toEqual([{ assetId: 'asset_reserved_bad00000', src: 'data:bad', reason: 'This image cannot be used' }])
  })

  test('an image that cannot be read is left out too', async () => {
    const result = await uploadPendingAssets({
      document: withImages(['asset_reserved_aaaaaaaa']),
      pendingAssets: [{ assetId: 'asset_reserved_aaaaaaaa', src: 'blob:gone' }],
      upload: async () => ({ ok: true, data: uploaded('asset_never_used00') }),
      toBlob: async () => {
        throw new Error('gone')
      },
    })

    expect(result.document.panels.front.layers).toEqual([])
    expect(result.notes[0]?.message).toContain('left out')
  })

  test('a data URL is decoded without fetch, which the CSP would refuse', async () => {
    const blob = await sourceToBlob('data:image/png;base64,iVBORw0K')

    expect(blob.type).toBe('image/png')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
  })
})
