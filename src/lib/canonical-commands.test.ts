import { describe, expect, test } from 'vitest'

import {
  MAX_HISTORY,
  applyCanonicalCommand,
  createCanonicalStack,
  findLayer,
  redoCanonical,
  replaceDocument,
  undoCanonical,
  type CanonicalCommand,
  type CanonicalStack,
} from './canonical-commands'
import {
  type CanonicalDocument,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import { importLegacyDesign } from './legacy-import'
import { panelPointToUv } from './panel-uv'
import { canonicalPanel, renderPanel, toRenderDocument } from './render-projection'

function run(stack: CanonicalStack, ...commands: CanonicalCommand[]) {
  let current = stack

  for (const command of commands) {
    const result = applyCanonicalCommand({ stack: current, command })

    if (!result.ok) {
      throw new Error(JSON.stringify(result.issues))
    }

    current = result.stack
  }

  return current
}

const brush = (id: string, points = [0.2, 0.2, 0.3, 0.3]) => ({
  id,
  tool: 'brush' as const,
  color: '#1a1c22' as const,
  width: 0.02,
  opacity: 1,
  points,
})

const text = (id: string, content = 'FLP') => ({
  id,
  kind: 'text' as const,
  visible: true,
  opacity: 1,
  x: 0.5,
  y: 0.6,
  scale: 0.12,
  rotation: 0,
  content,
  face: 'display' as const,
  color: '#c4a15a' as const,
})

describe('canonical commands', () => {
  test('draws on every panel independently and bumps the revision', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addStroke', panel: 'front', layerId: 'p-front', stroke: brush('s1') },
      { type: 'addStroke', panel: 'back', layerId: 'p-back', stroke: brush('s2') },
      { type: 'addStroke', panel: 'left', layerId: 'p-left', stroke: brush('s3') },
      { type: 'addStroke', panel: 'right', layerId: 'p-right', stroke: brush('s4') },
      { type: 'addStroke', panel: 'front', layerId: 'p-front', stroke: brush('s5') },
    )

    expect(stack.revision).toBe(5)
    expect(stack.document.panels.front.layers).toHaveLength(1)
    expect(findLayer({ document: stack.document, layerId: 'p-front' })?.layer).toMatchObject({
      strokes: [{ id: 's1' }, { id: 's5' }],
    })
    expect(stack.document.panels.left.layers[0]).toMatchObject({ id: 'p-left' })
    expect(validateCanonicalDocument({ value: stack.document }).ok).toBe(true)
  })

  test('erasing one paint layer leaves the others alone (E08)', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addStroke', panel: 'front', layerId: 'a', stroke: brush('s1') },
      { type: 'addStroke', panel: 'front', layerId: 'b', stroke: brush('s2') },
    )
    const created = applyCanonicalCommand({
      stack,
      command: { type: 'addStroke', panel: 'front', layerId: 'b', stroke: brush('s3') },
    })
    const cleared = run(created.stack, { type: 'clearPaintLayer', layerId: 'a' })

    expect(findLayer({ document: cleared.document, layerId: 'a' })?.layer).toMatchObject({ strokes: [] })
    expect(findLayer({ document: cleared.document, layerId: 'b' })?.layer).toMatchObject({
      strokes: [{ id: 's2' }, { id: 's3' }],
    })
  })

  test('moves, restyles, reorders, copies and removes layers', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addLayer', panel: 'front', layer: text('t1', 'one') },
      { type: 'addLayer', panel: 'front', layer: text('t2', 'two') },
      { type: 'updateLayer', layerId: 't1', patch: { x: 0.25, rotation: -0.5, content: 'ONE' } },
      { type: 'moveLayer', layerId: 't1', toIndex: 1 },
      { type: 'copyLayer', layerId: 't1', panel: 'back', newId: 't1-back' },
      { type: 'removeLayer', layerId: 't2' },
    )

    expect(stack.document.panels.front.layers.map((layer) => layer.id)).toEqual(['t1'])
    expect(stack.document.panels.back.layers[0]).toMatchObject({
      id: 't1-back',
      x: 0.25,
      rotation: -0.5,
      content: 'ONE',
    })
  })

  test('duplicating a paint layer gives its strokes fresh ids', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addStroke', panel: 'front', layerId: 'p', stroke: brush('s1') },
      { type: 'copyLayer', layerId: 'p', panel: 'front', newId: 'p-copy' },
    )

    expect(stack.document.panels.front.layers.map((layer) => layer.id)).toEqual(['p', 'p-copy'])
    expect(validateCanonicalDocument({ value: stack.document }).ok).toBe(true)
  })

  test('rejects invalid results instead of clamping, and leaves the stack as it was', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addLayer', panel: 'front', layer: text('t1') },
    )

    for (const command of [
      { type: 'updateLayer', layerId: 't1', patch: { x: 1.4 } },
      { type: 'updateLayer', layerId: 't1', patch: { scale: Number.NaN } },
      { type: 'addLayer', panel: 'back', layer: text('t1') },
      { type: 'updateLayer', layerId: 'nope', patch: { x: 0.1 } },
      { type: 'moveLayer', layerId: 't1', toIndex: 4 },
    ] satisfies CanonicalCommand[]) {
      const result = applyCanonicalCommand({ stack, command })

      expect(result.ok).toBe(false)
      expect(result.stack).toBe(stack)
    }
  })

  test('only fields that belong to a layer kind can be patched', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addStroke', panel: 'front', layerId: 'p', stroke: brush('s1') },
    )
    const result = applyCanonicalCommand({
      stack,
      command: { type: 'updateLayer', layerId: 'p', patch: { x: 0.2 } },
    })

    expect(result).toMatchObject({ ok: false, issues: [{ path: '$.patch.x' }] })
  })

  test('a no-op does not create history or a new revision', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addLayer', panel: 'front', layer: text('t1') },
    )
    const result = applyCanonicalCommand({
      stack,
      command: { type: 'updateLayer', layerId: 't1', patch: { x: 0.5 } },
    })

    expect(result).toMatchObject({ ok: true, changed: false })
    expect(result.stack).toBe(stack)
  })

  test('undo and redo walk history, each a new revision', () => {
    const start = createCanonicalStack({ document: createEmptyCanonicalDocument() })
    const drawn = run(start, { type: 'setBase', base: { kind: 'check', colors: ['#111318', '#f4ead4'], period: 0.1 } })
    const undone = undoCanonical({ stack: drawn })
    const redone = redoCanonical({ stack: undone })

    expect(undone.document).toEqual(start.document)
    expect(redone.document).toEqual(drawn.document)
    expect([drawn.revision, undone.revision, redone.revision]).toEqual([1, 2, 3])
  })

  test(`keeps at least 50 and at most ${MAX_HISTORY} undo steps (E09)`, () => {
    let stack = createCanonicalStack({ document: createEmptyCanonicalDocument() })

    for (let index = 0; index < MAX_HISTORY + 20; index += 1) {
      stack = run(stack, {
        type: 'addStroke',
        panel: 'front',
        layerId: 'p',
        stroke: brush(`s${index}`),
      })
    }

    expect(stack.past).toHaveLength(MAX_HISTORY)

    for (let index = 0; index < 50; index += 1) {
      stack = undoCanonical({ stack })
    }

    expect(stack.past).toHaveLength(MAX_HISTORY - 50)
  })

  test('loading a design drops undo history but keeps revisions increasing', () => {
    const stack = run(
      createCanonicalStack({ document: createEmptyCanonicalDocument() }),
      { type: 'addLayer', panel: 'front', layer: text('t1') },
    )
    const loaded = replaceDocument({ stack, document: GOLDEN_DOCUMENT })

    expect(loaded).toMatchObject({ past: [], future: [], revision: stack.revision + 1 })
    expect(loaded.document).toEqual(GOLDEN_DOCUMENT)
  })
})

describe('render projection', () => {
  test('maps wearer sleeves to the render panels they use', () => {
    expect(renderPanel({ panel: 'left' })).toBe('right')
    expect(canonicalPanel({ renderPanel: 'left' })).toBe('right')
    expect(canonicalPanel({ renderPanel: 'front' })).toBe('front')
  })

  test('a legacy design survives import and projection at the same atlas positions', async () => {
    const legacy = {
      garmentId: 'tee',
      garmentVersion: 2,
      structural: {},
      overrides: [{ meshName: 'body', color: '#2b3a55' }],
      layers: [
        {
          id: 'paint-1',
          kind: 'paint',
          visible: true,
          strokes: [
            { id: 'sa', panel: 'front', color: '#1a1c22', width: 0.024, tool: 'brush', points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.35 }] },
            { id: 'sb', panel: 'left', color: '#1a1c22', width: 0.04, tool: 'eraser', points: [{ x: 0.5, y: 0.5 }] },
          ],
        },
        { id: 'g1', kind: 'graphic', panel: 'back', src: '/graphics/crest.svg', x: 0.5, y: 0.62, scale: 0.32, rotation: 0.4, opacity: 0.9, visible: true },
        { id: 't1', kind: 'text', panel: 'right', content: 'FLP', face: 'sans', color: '#c4a15a', x: 0.3, y: 0.42, scale: 0.12, rotation: 0, opacity: 1, visible: false },
      ],
    }
    const imported = await importLegacyDesign({ value: legacy })

    if (!imported.ok) {
      throw new Error(imported.message)
    }

    const assetSources = Object.fromEntries(
      imported.pendingAssets.map((asset) => [asset.assetId, asset.src]),
    )
    const { document: projected, missingAssets } = toRenderDocument({
      document: imported.document,
      assetSources,
    })
    const byId = new Map(projected.layers.map((layer) => [layer.id, layer]))
    const strokes = projected.layers.flatMap((layer) => (layer.kind === 'paint' ? layer.strokes : []))

    expect(missingAssets).toEqual([])
    expect(projected.overrides[0]?.color).toBe('#2b3a55')
    expect(byId.get('g1')).toMatchObject({ panel: 'back', src: '/graphics/crest.svg', x: 0.5, y: 0.62, scale: 0.32, rotation: 0.4 })
    expect(byId.get('t1')).toMatchObject({ panel: 'right', content: 'FLP', x: 0.3, y: 0.42, visible: false })

    for (const original of legacy.layers[0]!.strokes!) {
      const stroke = strokes.find((entry) => entry.id === original.id)

      expect(stroke?.panel).toBe(original.panel)
      expect(stroke?.tool).toBe(original.tool)
      expect(
        stroke?.points.map((point) => panelPointToUv({ panel: stroke.panel, x: point.x, y: point.y })),
      ).toEqual(
        original.points.map((point) => panelPointToUv({ panel: original.panel as 'front', x: point.x, y: point.y })),
      )
    }
  })

  test('stripes and check project to the base color and fill stamps on every panel', () => {
    const document: CanonicalDocument = {
      ...createEmptyCanonicalDocument(),
      base: { kind: 'stripes', colors: ['#111318', '#f4ead4'], period: 0.08, angle: 0.785398 },
    }
    const { document: projected } = toRenderDocument({ document })

    expect(projected.overrides[0]?.color).toBe('#111318')
    expect(projected.layers.filter((layer) => layer.kind === 'pattern').map((layer) => layer.id).sort()).toEqual([
      'base-fill-back',
      'base-fill-front',
      'base-fill-left',
      'base-fill-right',
    ])
  })

  test('an image without bytes is reported, not drawn', () => {
    const { document: projected, missingAssets } = toRenderDocument({ document: GOLDEN_DOCUMENT })

    expect(missingAssets).toEqual(['asset_3f9a1c22b7'])
    expect(projected.layers.some((layer) => layer.id === 'image-front')).toBe(false)
  })
})
