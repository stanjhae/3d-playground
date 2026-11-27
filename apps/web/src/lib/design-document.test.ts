import { describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'
import {
  createEmptyDocument,
  documentFromDesign,
  documentHasInk,
  parseDocument,
} from './design-document'

describe('createEmptyDocument', () => {
  test('starts a look with one paint layer and no ink', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })

    expect(document.garmentId).toBe('tee')
    expect(document.garmentVersion).toBe(2)
    expect(document.structural).toEqual({})
    expect(document.overrides).toEqual([])
    expect(document.layers).toHaveLength(1)
    expect(document.layers[0]?.kind).toBe('paint')
    expect(documentHasInk({ document })).toBe(false)
  })
})

describe('parseDocument', () => {
  test('loads an old cloth-only look', () => {
    const design = {
      ...createEmptyDesign({ id: 'look-1' }),
      garmentId: 'gown' as const,
      overrides: [{ meshName: 'body', color: '#f6e7d8', mapId: 'silk-shine' }],
    }

    const document = parseDocument({ value: design })

    expect(document?.garmentId).toBe('gown')
    expect(document?.overrides).toEqual(design.overrides)
    expect(document?.layers[0]?.kind).toBe('paint')
  })

  test('keeps unknown layer kinds out and preserves stroke ids', () => {
    const document = parseDocument({
      value: {
        garmentId: 'tee',
        garmentVersion: 2,
        structural: { neck: 'v', hem: 'crop', sleeve: 'long', fake: 'no' },
        overrides: [],
        layers: [
          { id: 'paint-1', kind: 'paint', strokes: [{ id: 'ink-1', panel: 'front', points: [{ x: 0.4, y: 0.5 }], color: '#1a1c22', width: 0.03, tool: 'brush' }] },
          { id: 'ghost', kind: 'shader' },
        ],
      },
    })

    expect(document?.garmentVersion).toBe(2)
    expect(document?.structural).toEqual({
      neck: 'v',
      hem: 'crop',
      sleeve: 'long',
    })
    expect(document?.layers).toHaveLength(1)
    expect(document?.layers[0]).toMatchObject({
      id: 'paint-1',
      kind: 'paint',
    })
    if (document?.layers[0]?.kind === 'paint') {
      expect(document.layers[0].strokes[0]?.id).toBe('ink-1')
    }
  })

  test('keeps a stripe as a pattern layer', () => {
    const document = parseDocument({
      value: {
        garmentId: 'tee',
        garmentVersion: 2,
        structural: {},
        overrides: [],
        layers: [
          {
            id: 'print-1',
            kind: 'pattern',
            patternId: 'stripe',
            panel: 'front',
            color: '#1a1c22',
            x: 0.5,
            y: 0.48,
            scale: 0.46,
            rotation: 0,
            visible: true,
          },
        ],
      },
    })

    expect(document?.layers[0]).toMatchObject({
      id: 'print-1',
      kind: 'pattern',
      patternId: 'stripe',
    })
    expect(documentHasInk({ document: document! })).toBe(true)
  })
})

describe('documentFromDesign', () => {
  test('locks baked art from a published look', () => {
    const document = documentFromDesign({
      design: {
        garmentId: 'tee',
        overrides: [{ meshName: 'body', color: '#f6e7d8' }],
        artMap: 'data:image/png;base64,abc',
        structural: { neck: 'crew' },
      },
    })

    expect(document.layers[0]).toMatchObject({
      kind: 'art',
      locked: true,
      src: 'data:image/png;base64,abc',
    })
    expect(documentHasInk({ document })).toBe(true)
  })

  test('refuses a hostile art map', () => {
    const document = documentFromDesign({
      design: {
        garmentId: 'tee',
        overrides: [],
        artMap: 'data:image/svg+xml,<svg></svg>',
      },
    })

    expect(document.layers.some((layer) => layer.kind === 'art')).toBe(false)
  })

  test('restores editable layers from a stored document', () => {
    const document = documentFromDesign({
      design: {
        garmentId: 'tee',
        overrides: [],
        artMap: 'data:image/png;base64,abc',
        document: {
          garmentId: 'tee',
          garmentVersion: 2,
          structural: { neck: 'v' },
          overrides: [],
          layers: [
            {
              id: 'paint-1',
              kind: 'paint',
              visible: true,
              strokes: [
                {
                  id: 'stroke-1',
                  panel: 'front',
                  points: [{ x: 0.5, y: 0.5 }],
                  color: '#111111',
                  width: 0.02,
                  tool: 'brush',
                },
              ],
            },
          ],
        },
      },
    })

    expect(document.layers[0]).toMatchObject({
      kind: 'paint',
      strokes: [{ id: 'stroke-1' }],
    })
    expect(document.structural.neck).toBe('v')
  })
})

describe('legacy panel migration', () => {
  test('migrates a sleeve panel to left', () => {
    const document = parseDocument({
      value: {
        garmentId: 'tee',
        garmentVersion: 2,
        structural: {},
        overrides: [],
        layers: [
          {
            id: 'text-1',
            kind: 'text',
            panel: 'sleeve',
            content: 'FLV',
            face: 'display',
            color: '#111',
            x: 0.5,
            y: 0.5,
            scale: 0.1,
            rotation: 0,
            visible: true,
          },
        ],
      },
    })

    expect(document?.layers[0]).toMatchObject({
      kind: 'text',
      panel: 'left',
    })
  })
})
