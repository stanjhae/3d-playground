import { describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { hashCanonicalDocument } from '../canonical-hash'
import {
  MAX_CONTENT_BYTES,
  apiErrorFromDatabase,
  checkpointLabelIssues,
  parseCreateDesignRequest,
  parseProfileRequest,
  parsePublishVersionRequest,
  parseUpdateDesignRequest,
  parseRestoreVersionRequest,
  parseSaveVersionRequest,
  parseVersionListQuery,
  parseVersionSeq,
  prepareContent,
  unknownLibraryReferences,
  uploadedAssetReferences,
} from './contract'

const KEY = '8b0f6f6e-3c1d-4f7a-9a52-2f1c5b7e9d10'

describe('prepareContent', () => {
  test('validates, normalizes and hashes on the server', async () => {
    const result = await prepareContent({ value: GOLDEN_DOCUMENT })

    expect(result.ok).toBe(true)

    if (result.ok) {
      expect(result.prepared.content).toEqual(GOLDEN_DOCUMENT)
      expect(result.prepared.contentHash).toBe(
        await hashCanonicalDocument({ document: GOLDEN_DOCUMENT }),
      )
      expect(result.prepared.contentBytes).toBeGreaterThan(2)
    }
  })

  test('rejects invalid content as 422 with paths', async () => {
    const result = await prepareContent({
      value: { ...GOLDEN_DOCUMENT, camera: { azimuth: 1 } },
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        status: 422,
        body: { error: { code: 'invalid', issues: [{ path: '$.camera' }] } },
      },
    })
  })

  test('rejects oversized content as 413', async () => {
    const strokes = Array.from({ length: 2_000 }, (_, index) => ({
      id: `s${index}`,
      tool: 'eraser' as const,
      width: 0.01,
      points: Array.from({ length: 200 }, () => 0.123456),
    }))
    const huge = structuredClone(GOLDEN_DOCUMENT)
    huge.panels.left.layers = [
      { id: 'big', kind: 'paint', visible: true, opacity: 1, strokes },
    ]

    const result = await prepareContent({ value: huge })

    expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_CONTENT_BYTES)
    expect(result).toMatchObject({ ok: false, error: { status: 413 } })
  })
})

describe('request parsing', () => {
  test('accepts well-formed requests', () => {
    expect(
      parseCreateDesignRequest({
        value: { mutationKey: KEY, title: 'Crest tee', content: {} },
      }).ok,
    ).toBe(true)
    expect(
      parseSaveVersionRequest({
        value: { baseSeq: 3, mutationKey: KEY, kind: 'checkpoint', label: 'v1', content: {} },
      }).ok,
    ).toBe(true)
    expect(
      parseRestoreVersionRequest({
        value: { baseSeq: 4, mutationKey: KEY, fromSeq: 2 },
      }).ok,
    ).toBe(true)
    expect(parsePublishVersionRequest({ value: { seq: 4 } }).ok).toBe(true)
  })

  test('never accepts an owner from the request body', () => {
    const result = parseSaveVersionRequest({
      value: {
        baseSeq: 1,
        mutationKey: KEY,
        kind: 'autosave',
        content: {},
        ownerId: 'someone-else',
      },
    })

    expect(result).toMatchObject({
      ok: false,
      error: { status: 422, body: { error: { issues: [{ path: '$.ownerId' }] } } },
    })
  })

  test('reports each malformed field', () => {
    const result = parseSaveVersionRequest({
      value: { baseSeq: 0, mutationKey: 'retry-1', kind: 'restore', content: {} },
    })

    expect(result.ok ? [] : result.error.body.error.issues?.map((i) => i.path)).toEqual([
      '$.baseSeq',
      '$.mutationKey',
      '$.kind',
    ])
  })
})

describe('apiErrorFromDatabase', () => {
  test('maps a stale base to 409 with the current head', () => {
    expect(
      apiErrorFromDatabase({
        code: 'FL409',
        message: 'stale base version',
        details: '{"headSeq":7}',
      }),
    ).toEqual({
      status: 409,
      body: { error: { code: 'conflict', message: 'stale base version', headSeq: 7 } },
    })
  })

  test('keeps not-found neutral for missing and foreign designs', () => {
    expect(apiErrorFromDatabase({ code: 'FL404', message: 'design not found' })).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'Design not found' } },
    })
  })

  test('does not describe unknown database failures', () => {
    expect(apiErrorFromDatabase({ code: '23505', message: 'duplicate key' })).toBeNull()
  })
})

describe('unknownLibraryReferences', () => {
  test('flags asset_lib ids that name no shipped graphic, and only those', () => {
    const document = structuredClone(GOLDEN_DOCUMENT)
    const real = structuredClone(document.panels.front.layers[1]!)
    const fake = structuredClone(document.panels.front.layers[1]!)

    if (real.kind === 'image' && fake.kind === 'image') {
      real.id = 'real-library'
      real.assetId = 'asset_lib_flame-rise'
      fake.id = 'fake-library'
      fake.assetId = 'asset_lib_not-a-graphic'
    }

    document.panels.back.layers.push(real, fake)

    expect(unknownLibraryReferences({ document })).toEqual([
      { assetId: 'asset_lib_not-a-graphic', path: '$.panels.back.layers[2].assetId' },
    ])
  })
})

describe('uploadedAssetReferences', () => {
  test('lists uploaded image ids with their paths and skips library graphics', () => {
    const document = structuredClone(GOLDEN_DOCUMENT)
    const library = structuredClone(document.panels.front.layers[1]!)

    if (library.kind === 'image') {
      library.id = 'image-library'
      library.assetId = 'asset_lib_cross-simple'
    }

    document.panels.back.layers.push(library)

    expect(uploadedAssetReferences({ document })).toEqual([
      { assetId: 'asset_3f9a1c22b7', path: '$.panels.front.layers[1].assetId' },
    ])
  })
})

describe('history requests (S07 #176)', () => {
  const query = (text: string) => parseVersionListQuery({ params: new URLSearchParams(text) })

  test('a list defaults to the newest 20 and takes a before cursor', () => {
    expect(query('')).toEqual({ ok: true, query: { before: null, limit: 20 } })
    expect(query('before=12&limit=5')).toEqual({ ok: true, query: { before: 12, limit: 5 } })
    expect(query('limit=50&path=designs/x/versions')).toEqual({ ok: true, query: { before: null, limit: 50 } })
  })

  test('cursor and limit must be positive integers within bounds', () => {
    for (const text of ['before=0', 'before=-1', 'before=1.5', 'before=abc', 'before=', 'limit=0', 'limit=51', 'limit=1e2']) {
      expect(query(text)).toMatchObject({ ok: false, error: { status: 422 } })
    }
  })

  test('a version segment is a positive integer or nothing', () => {
    expect(parseVersionSeq({ segment: '7' })).toBe(7)

    for (const segment of ['0', '07', '-1', '1.0', 'head', '9999999999']) {
      expect(parseVersionSeq({ segment })).toBeNull()
    }
  })

  test('checkpoint names are 1–60 plain characters', () => {
    expect(checkpointLabelIssues({ value: 'Before sleeves' })).toEqual([])
    expect(checkpointLabelIssues({ value: 'x'.repeat(60) })).toEqual([])

    for (const value of ['', '   ', 'x'.repeat(61), ' padded', 'two\nlines', 'tab\there', 7, null]) {
      expect(checkpointLabelIssues({ value })).toHaveLength(1)
    }
  })

  test('only a checkpoint may carry a name', () => {
    const base = { baseSeq: 3, mutationKey: KEY, content: {} }

    expect(parseSaveVersionRequest({ value: { ...base, kind: 'checkpoint', label: 'Named' } }).ok).toBe(true)
    expect(parseSaveVersionRequest({ value: { ...base, kind: 'checkpoint' } }).ok).toBe(true)
    expect(parseSaveVersionRequest({ value: { ...base, kind: 'autosave', label: 'Named' } })).toMatchObject({
      ok: false,
      error: { body: { error: { issues: [{ path: '$.label' }] } } },
    })
    expect(parseSaveVersionRequest({ value: { ...base, kind: 'checkpoint', label: ' ' } }).ok).toBe(false)
  })
})

describe('design details requests (A06 #150)', () => {
  test('a rename or description is accepted, alone or together', () => {
    expect(parseUpdateDesignRequest({ value: { title: 'Crest tee' } }).ok).toBe(true)
    expect(parseUpdateDesignRequest({ value: { description: '' } }).ok).toBe(true)
    expect(parseUpdateDesignRequest({ value: { title: 'A', description: 'B' } }).ok).toBe(true)
  })

  test('empty, blank, long or unknown fields are refused', () => {
    expect(parseUpdateDesignRequest({ value: {} }).ok).toBe(false)
    expect(parseUpdateDesignRequest({ value: { title: '  ' } }).ok).toBe(false)
    expect(parseUpdateDesignRequest({ value: { title: 'x'.repeat(81) } }).ok).toBe(false)
    expect(parseUpdateDesignRequest({ value: { description: 'x'.repeat(501) } }).ok).toBe(false)
    expect(parseUpdateDesignRequest({ value: { title: 'A', headSeq: 2 } }).ok).toBe(false)
  })

  test('a display name is set, cleared with null or empty, and capped at 40', () => {
    expect(parseProfileRequest({ value: { displayName: 'Ada' } }).ok).toBe(true)
    expect(parseProfileRequest({ value: { displayName: null } }).ok).toBe(true)
    expect(parseProfileRequest({ value: { displayName: '' } }).ok).toBe(true)
    expect(parseProfileRequest({ value: { displayName: 'x'.repeat(41) } }).ok).toBe(false)
    expect(parseProfileRequest({ value: {} }).ok).toBe(false)
  })
})
