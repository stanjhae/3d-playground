import { beforeEach, describe, expect, test } from 'vitest'

import { useSessionStore } from './auth/session-store'
import { createEmptyCanonicalDocument } from './canonical-document'
import { getAssetSources, getCanonicalDocument, useEditorStore } from './editor-store'
import { imagesReady } from './save-controller'
import { resolveUploadedSources, uploadForStudio, uploadedAssetIds } from './uploaded-images'

const ASSET = 'asset_0123456789abcdef'
const DESIGN = '0f6e8b8c-3c1d-4f7a-9a52-2f1c5b7e9d10'
const store = () => useEditorStore.getState()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const READY = {
  assetId: ASSET,
  status: 'ready',
  mimeType: 'image/png',
  width: 400,
  height: 200,
  byteSize: 10,
  sha256: 'x',
  readUrl: 'https://storage.test/signed/read',
  readUrlExpiresIn: 600,
}

function fakeServer() {
  const calls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)

    if (url === '/api/flp/assets' && init?.method === 'POST') {
      return json({ assetId: ASSET, status: 'staged', upload: { url: 'https://storage.test/put', method: 'PUT', maxBytes: 1 } })
    }

    if (url === 'https://storage.test/put') {
      return new Response(null, { status: 200 })
    }

    if (url === `/api/flp/assets/${ASSET}/finalize` || url === `/api/flp/assets/${ASSET}`) {
      return json(READY)
    }

    if (url === READY.readUrl) {
      return new Response(new Blob(['png']), { status: 200 })
    }

    return json({ error: { code: 'not_found', message: 'no' } }, 404)
  }) as typeof fetch

  return { calls, fetchImpl }
}

describe('editor uploads (S01 #170)', () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: 'signed-in',
      account: { userId: 'user-a', email: null },
      accessToken: 't',
      accountEpoch: 1,
    })
    store().reset()
    store().loadCanonical({
      document: createEmptyCanonicalDocument(),
      cloud: { designId: DESIGN, headSeq: 1, title: 'Tee' },
    })
  })

  test('an upload resolves to the ready asset id, its natural aspect and a drawable source', async () => {
    const server = fakeServer()
    const result = await uploadForStudio({ file: new Blob(['png']), fetchImpl: server.fetchImpl, createUrl: () => 'blob:x' })

    expect(result).toEqual({ ok: true, data: { assetId: ASSET, aspect: 2, src: 'blob:x' } })
    expect(server.calls).toContain(`GET ${READY.readUrl}`)
  })

  test('a failed upload places nothing', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    const before = store().revision
    const result = await uploadForStudio({ file: new Blob(['png']), fetchImpl })

    expect(result.ok).toBe(false)
    expect(store().revision).toBe(before)
  })

  test('the placed layer stores the real asset id and renders from the registered source', () => {
    store().addUploadedImage({ assetId: ASSET, aspect: 2, src: 'blob:x' })

    const layer = getCanonicalDocument().panels.front.layers.find((entry) => entry.kind === 'image')
    expect(layer).toMatchObject({ kind: 'image', assetId: ASSET, aspect: 2 })
    expect(getAssetSources()[ASSET]).toBe('blob:x')
    expect(store().document.layers).toContainEqual(expect.objectContaining({ kind: 'graphic', src: 'blob:x' }))
    // A ready upload does not hold autosave back.
    expect(imagesReady({ document: getCanonicalDocument() })).toBe(true)
  })

  test('a duplicated upload keeps its asset id and aspect', () => {
    store().addUploadedImage({ assetId: ASSET, aspect: 2, src: 'blob:x' })
    const placed = store().selectedLayerId!
    store().duplicateLayer({ layerId: placed })

    const images = getCanonicalDocument().panels.front.layers.filter((entry) => entry.kind === 'image')
    expect(images).toHaveLength(2)
    expect(images.every((entry) => entry.kind === 'image' && entry.assetId === ASSET && entry.aspect === 2)).toBe(true)
    expect(store().document.layers.filter((entry) => entry.kind === 'graphic' && entry.aspect === 2)).toHaveLength(2)
  })

  test('a reopened design resolves its uploads without a new revision', async () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers.push({
      id: 'img', kind: 'image', visible: true, opacity: 1, x: 0.5, y: 0.5, scale: 0.3, rotation: 0,
      assetId: ASSET, aspect: 2,
    })
    store().loadCanonical({ document, cloud: { designId: DESIGN, headSeq: 2, title: 'Tee' } })
    const revision = store().revision

    expect(uploadedAssetIds({ document })).toEqual([ASSET])
    // Until the bytes arrive the image is a placeholder (#154).
    expect(store().document.layers).toContainEqual(
      expect.objectContaining({ kind: 'graphic', src: '', missing: true }),
    )

    const sources = await resolveUploadedSources({ document, fetchImpl: fakeServer().fetchImpl, createUrl: () => 'blob:y' })
    store().registerAssetSources({ sources })

    expect(store().document.layers).toContainEqual(expect.objectContaining({ kind: 'graphic', src: 'blob:y' }))
    expect(store().revision).toBe(revision)
  })
})
