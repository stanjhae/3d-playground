import { describe, expect, test } from 'vitest'

import { validateCanonicalDocument } from './canonical-document'
import { importLegacyDesign } from './legacy-import'
import { panelPointToUv } from './panel-uv'
import { TEE_CREW_SHORT_V1 } from './template-manifest'

const LEGACY_TEE = {
  garmentId: 'tee',
  garmentVersion: 2,
  structural: { neck: 'v', sleeve: 'short' },
  overrides: [{ meshName: 'body', color: '#2B3A55', mapId: 'jersey' }],
  layers: [
    {
      id: 'paint-1',
      kind: 'paint',
      visible: true,
      label: 'Sketch',
      strokes: [
        {
          id: 'stroke-a',
          panel: 'front',
          points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.35, p: 0.7 }],
          color: '#1a1c22',
          width: 0.024,
          tool: 'brush',
        },
        {
          id: 'stroke-b',
          panel: 'sleeve',
          points: [{ x: 0.5, y: 0.5 }],
          color: '#1a1c22',
          width: 0.04,
          tool: 'eraser',
        },
        {
          id: 'stroke-c',
          panel: 'front',
          points: [{ x: 0.1, y: 0.1 }],
          color: '#000000',
          width: 0.02,
          tool: 'fill',
        },
      ],
    },
    {
      id: 'graphic-1',
      kind: 'graphic',
      panel: 'back',
      src: '/graphics/crest.svg',
      x: 0.5,
      y: 0.62,
      scale: 0.32,
      rotation: 0.4,
      opacity: 0.9,
      visible: true,
    },
    {
      id: 'text-1',
      kind: 'text',
      panel: 'front',
      content: 'FLP 26',
      face: 'sans',
      color: '#c4a15a',
      x: 0.5,
      y: 0.42,
      scale: 0.12,
      rotation: 0,
      opacity: 1,
      visible: false,
    },
    { id: 'pattern-1', kind: 'pattern', patternId: 'stripe', panel: 'front' },
    { id: 'art-1', kind: 'art', src: 'data:image/png;base64,AAAA', locked: true },
  ],
}

function paths({ notes }: { notes: Array<{ path: string }> }) {
  return notes.map((note) => note.path)
}

async function importOk(value: unknown) {
  const result = await importLegacyDesign({ value })

  if (!result.ok) {
    throw new Error(`import failed: ${result.message}`)
  }

  return result
}

describe('importLegacyDesign', () => {
  test('maps a legacy tee into a valid v2 document', async () => {
    const result = await importOk(LEGACY_TEE)

    expect(result.source).toBe('document')
    expect(validateCanonicalDocument({ value: result.document }).ok).toBe(true)
    expect(result.document.base).toEqual({ kind: 'solid', color: '#2b3a55' })
    expect(result.document.panels.front.layers.map((layer) => layer.id)).toEqual([
      'paint-1--front',
      'text-1',
    ])
    expect(result.document.panels.right.layers.map((layer) => layer.id)).toEqual([
      'paint-1--right',
    ])
    expect(result.document.panels.back.layers[0]).toMatchObject({
      kind: 'image',
      aspect: 1,
      assetId: result.pendingAssets[0]?.assetId,
    })
    expect(result.pendingAssets).toEqual([
      { assetId: expect.stringMatching(/^asset_legacy_[0-9a-f]{32}$/), src: '/graphics/crest.svg' },
    ])
  })

  test('reports every left-out item instead of dropping it', async () => {
    const result = await importOk(LEGACY_TEE)

    expect(paths({ notes: result.unsupported })).toEqual([
      'structural.neck',
      'overrides[0].mapId',
      'layers[0].strokes[2]',
      'layers[3]',
      'layers[4]',
    ])
  })

  test('maps the legacy sleeve alias to the sleeve it was drawn on: the wearer\'s right', async () => {
    const result = await importOk(LEGACY_TEE)

    expect(result.warnings).toContainEqual({
      path: 'layers[0].strokes[1].panel',
      message: 'legacy panel "sleeve" mapped to the wearer\'s right sleeve',
    })
  })

  test('v1 sleeve ids name render panels, so they swap to wearer sides', async () => {
    const result = await importOk({
      ...LEGACY_TEE,
      layers: [
        { id: 'on-v1-left', kind: 'text', panel: 'left', content: 'R', x: 0.4, y: 0.6, scale: 0.1 },
        { id: 'on-v1-right', kind: 'text', panel: 'right', content: 'L', x: 0.4, y: 0.6, scale: 0.1 },
      ],
    })

    expect(result.document.panels.right.layers.map((layer) => layer.id)).toEqual(['on-v1-left'])
    expect(result.document.panels.left.layers.map((layer) => layer.id)).toEqual(['on-v1-right'])
    // Same physical sleeve, same atlas position.
    expect(panelPointToUv({ panel: 'left', x: 0.4, y: 0.6 })).toEqual(
      panelPointToUv({ panel: TEE_CREW_SHORT_V1.regions.right.renderPanel, x: 0.4, y: 0.6 }),
    )
  })

  test('preserves visible placement on the atlas', async () => {
    const result = await importOk(LEGACY_TEE)
    const text = result.document.panels.front.layers[1]
    const image = result.document.panels.back.layers[0]
    const brush = result.document.panels.front.layers[0]

    expect(text).toMatchObject({ x: 0.5, y: 0.42, scale: 0.12, rotation: 0, visible: false })
    expect(image).toMatchObject({ x: 0.5, y: 0.62, scale: 0.32, rotation: 0.4 })
    expect(panelPointToUv({ panel: 'back', x: 0.5, y: 0.62 })).toEqual(
      panelPointToUv({ panel: 'back', x: (image as { x: number }).x, y: (image as { y: number }).y }),
    )
    expect(brush?.kind === 'paint' ? brush.strokes[0]?.points : null).toEqual([
      0.2, 0.3, 0.4, 0.35,
    ])
  })

  test('importing the same source twice is identical and idempotent', async () => {
    const first = await importOk(LEGACY_TEE)
    const second = await importOk(JSON.stringify(LEGACY_TEE))

    expect(second.document).toEqual(first.document)
    expect(second.contentHash).toBe(first.contentHash)
    expect(second.importKey).toBe(first.importKey)
    expect(first.importKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  test('keeps the exact original as a backup', async () => {
    const raw = JSON.stringify(LEGACY_TEE)
    const result = await importOk(raw)

    expect(result.backup).toBe(raw)
  })

  test('reads drafts and snapshots', async () => {
    const draft = await importOk({ garmentId: 'tee', document: { ...LEGACY_TEE, garmentId: undefined } })
    const snapshot = await importOk({
      id: 'morning-1',
      title: 'Monday look',
      createdAt: '2026-10-01T09:00:00.000Z',
      kind: 'morning',
      document: LEGACY_TEE,
    })

    expect(draft.source).toBe('draft')
    expect(snapshot).toMatchObject({ source: 'snapshot', title: 'Monday look' })
    expect(snapshot.document).toEqual(draft.document)
  })

  test('clamps off-panel points like the old renderer and says so', async () => {
    const result = await importOk({
      ...LEGACY_TEE,
      layers: [
        {
          id: 'paint-2',
          kind: 'paint',
          strokes: [
            { id: 's1', panel: 'front', color: '#000', width: 0.02, points: [{ x: 1.2, y: -0.1 }] },
          ],
        },
      ],
    })
    const layer = result.document.panels.front.layers[0]

    expect(layer?.kind === 'paint' ? layer.strokes[0] : null).toMatchObject({
      color: '#000000',
      points: [1, 0],
    })
    expect(paths({ notes: result.warnings })).toEqual(
      expect.arrayContaining(['layers[0].strokes[0].points[0].x', 'layers[0].strokes[0].points[0].y']),
    )
  })

  test('wraps rotations and leaves out sizes v2 cannot hold', async () => {
    const result = await importOk({
      ...LEGACY_TEE,
      layers: [
        { id: 't1', kind: 'text', panel: 'front', content: 'A', x: 0.5, y: 0.5, scale: 0.1, rotation: 4 },
        { id: 't2', kind: 'text', panel: 'front', content: 'B', x: 0.5, y: 0.5, scale: 3 },
      ],
    })

    expect((result.document.panels.front.layers[0] as { rotation: number }).rotation).toBeCloseTo(
      4 - Math.PI * 2,
      6,
    )
    expect(result.document.panels.front.layers).toHaveLength(1)
    expect(paths({ notes: result.unsupported })).toContain('layers[1].scale')
  })

  test('keeps how strokes looked: pressure folds into width, alpha into opacity', async () => {
    const result = await importOk({
      ...LEGACY_TEE,
      layers: [
        {
          id: 'p',
          kind: 'paint',
          strokes: [
            {
              id: 'soft',
              panel: 'front',
              color: '#1A1C2280',
              width: 0.02,
              tool: 'brush',
              points: [{ x: 0.2, y: 0.2, p: 0.805 }, { x: 0.3, y: 0.3, p: 0.805 }],
            },
          ],
        },
      ],
    })
    const layer = result.document.panels.front.layers[0]
    const stroke = layer?.kind === 'paint' ? layer.strokes[0] : null

    expect(stroke).toMatchObject({ color: '#1a1c22', opacity: 0.501961 })
    expect(stroke?.width).toBeCloseTo((0.02 * (0.55 + 0.805 * 0.7)) / (0.55 + 0.7 * 0.7), 6)
  })

  test('the legacy stripe/check base fill becomes the v2 base pattern', async () => {
    const result = await importOk({
      ...LEGACY_TEE,
      layers: ['front', 'back', 'left', 'right'].map((panel) => ({
        id: `base-fill-${panel}`,
        kind: 'pattern',
        patternId: 'stripe',
        panel,
        color: '#F4EAD4',
      })),
    })

    expect(result.document.base).toEqual({
      kind: 'stripes',
      colors: ['#2b3a55', '#f4ead4'],
      period: 0.08,
      angle: 0,
    })
    expect(result.unsupported.filter((note) => note.path.startsWith('layers['))).toEqual([])
  })

  test('rejects corrupt and out-of-scope sources explicitly', async () => {
    expect(await importLegacyDesign({ value: '{not json' })).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(await importLegacyDesign({ value: [LEGACY_TEE] })).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(await importLegacyDesign({ value: { garmentId: 'tee' } })).toMatchObject({ ok: false, reason: 'corrupt' })
    expect(await importLegacyDesign({ value: { ...LEGACY_TEE, garmentId: 'gown' } })).toMatchObject({
      ok: false,
      reason: 'unsupported-garment',
    })
    expect(await importLegacyDesign({ value: { schemaVersion: 2 } })).toMatchObject({
      ok: false,
      reason: 'already-v2',
    })
  })

  test('refuses to import duplicate ids rather than guessing', async () => {
    const result = await importLegacyDesign({
      value: {
        ...LEGACY_TEE,
        layers: [
          { id: 'dup', kind: 'text', panel: 'front', content: 'A', x: 0.5, y: 0.5, scale: 0.1 },
          { id: 'dup', kind: 'text', panel: 'back', content: 'B', x: 0.5, y: 0.5, scale: 0.1 },
        ],
      },
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid',
      issues: [{ path: '$.panels.back.layers[0].id' }],
    })
  })
})
