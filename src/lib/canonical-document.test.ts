import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type GarmentBase,
  type ValidationIssue,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'

function fullDocument({ base }: { base: GarmentBase }): CanonicalDocument {
  return {
    schemaVersion: 2,
    template: { id: 'tee-crew-short', version: 1 },
    base,
    panels: {
      front: {
        layers: [
          {
            id: 'paint-front',
            kind: 'paint',
            visible: true,
            opacity: 1,
            strokes: [
              {
                id: 'stroke-1',
                tool: 'brush',
                color: '#1a1c22',
                width: 0.024,
                opacity: 0.8,
                points: [0.2, 0.2, 0.25, 0.3, 0.4, 0.35],
              },
              {
                id: 'stroke-2',
                tool: 'eraser',
                width: 0.04,
                points: [0.24, 0.28, 0.26, 0.31],
              },
            ],
          },
          {
            id: 'image-front',
            kind: 'image',
            visible: true,
            opacity: 0.9,
            name: 'Crest',
            assetId: 'asset_3f9a1c22b7',
            aspect: 1.5,
            x: 0.5,
            y: 0.4,
            scale: 0.32,
            rotation: -12.5,
          },
        ],
      },
      back: {
        layers: [
          {
            id: 'text-back',
            kind: 'text',
            visible: true,
            opacity: 1,
            content: 'FLP 26',
            face: 'display',
            color: '#c4a15a',
            x: 0.5,
            y: 0.2,
            scale: 0.2,
            rotation: 0,
          },
        ],
      },
      left: {
        layers: [
          {
            id: 'text-left',
            kind: 'text',
            visible: false,
            opacity: 0.5,
            content: 'L',
            face: 'sans',
            color: '#6b1d2a',
            x: 0.5,
            y: 0.5,
            scale: 0.1,
            rotation: 180,
          },
        ],
      },
      right: { layers: [] },
    },
  }
}

const BASES: GarmentBase[] = [
  { kind: 'solid', color: '#f7f3ea' },
  { kind: 'stripes', colors: ['#111318', '#f4ead4'], period: 0.08, angle: 45 },
  { kind: 'check', colors: ['#6b7c4a', '#f7f3ea'], period: 0.12 },
]

function issuesFor({ value }: { value: unknown }): ValidationIssue[] {
  const result = validateCanonicalDocument({ value })

  if (result.ok) {
    throw new Error('expected validation to fail')
  }

  return result.issues
}

function paths({ value }: { value: unknown }) {
  return issuesFor({ value }).map((issue) => issue.path)
}

function mutate(edit: (document: Record<string, any>) => void) {
  const document = structuredClone(
    fullDocument({ base: BASES[0]! }),
  ) as Record<string, any>
  edit(document)
  return document
}

describe('validateCanonicalDocument — valid fixtures', () => {
  test.each(BASES.map((base) => [base.kind, base] as const))(
    '%s base round-trips through JSON unchanged',
    (_kind, base) => {
      const fixture = fullDocument({ base })
      const stored = JSON.parse(JSON.stringify(fixture)) as unknown
      const result = validateCanonicalDocument({ value: stored })

      expect(result).toEqual({ ok: true, document: fixture })
    },
  )

  test('an empty document has all four panels and validates', () => {
    const document = createEmptyCanonicalDocument()

    expect(Object.keys(document.panels)).toEqual(['front', 'back', 'left', 'right'])
    expect(validateCanonicalDocument({ value: document }).ok).toBe(true)
  })
})

describe('validateCanonicalDocument — rejects with paths', () => {
  test('unknown or legacy schema versions', () => {
    expect(paths({ value: mutate((d) => (d.schemaVersion = 1)) })).toEqual([
      '$.schemaVersion',
    ])
    expect(paths({ value: { layers: [] } })).toEqual([
      '$.layers',
      '$.schemaVersion',
      '$.template',
      '$.base',
      '$.panels',
    ])
  })

  test('unknown layer kinds instead of dropping them', () => {
    const value = mutate((d) => {
      d.panels.front.layers.push({ id: 'art-1', kind: 'art', src: 'x' })
    })

    expect(paths({ value })).toEqual(['$.panels.front.layers[2].kind'])
  })

  test('unknown fields, including editor and camera state', () => {
    const value = mutate((d) => {
      d.camera = { azimuth: 30 }
      d.panels.back.layers[0].selected = true
      d.panels.front.layers[0].strokes[1].color = '#000000'
    })

    expect(paths({ value })).toEqual([
      '$.camera',
      '$.panels.front.layers[0].strokes[1].color',
      '$.panels.back.layers[0].selected',
    ])
  })

  test('non-finite and out-of-range numbers instead of clamping', () => {
    const value = mutate((d) => {
      d.panels.front.layers[1].opacity = 1.4
      d.panels.front.layers[1].x = Number.NaN
      d.panels.front.layers[1].scale = 0
      d.panels.front.layers[0].strokes[0].points[3] = Number.POSITIVE_INFINITY
      d.panels.back.layers[0].rotation = -180
    })

    expect(issuesFor({ value })).toEqual([
      {
        path: '$.panels.front.layers[0].strokes[0].points[3]',
        message: 'expected a finite number in [0, 1]',
      },
      { path: '$.panels.front.layers[1].opacity', message: 'out of range [0, 1]' },
      { path: '$.panels.front.layers[1].x', message: 'expected a finite number' },
      { path: '$.panels.front.layers[1].scale', message: 'out of range (0, 4]' },
      { path: '$.panels.back.layers[0].rotation', message: 'out of range (-180, 180]' },
    ])
  })

  test('missing panels', () => {
    const value = mutate((d) => {
      delete d.panels.right
    })

    expect(paths({ value })).toEqual(['$.panels.right'])
  })

  test('duplicate ids across panels and strokes', () => {
    const value = mutate((d) => {
      d.panels.left.layers[0].id = 'paint-front'
      d.panels.front.layers[0].strokes[1].id = 'stroke-1'
    })

    expect(paths({ value })).toEqual([
      '$.panels.front.layers[0].strokes[1].id',
      '$.panels.left.layers[0].id',
    ])
  })

  test('inline image bytes instead of an asset id', () => {
    const value = mutate((d) => {
      d.panels.front.layers[1].assetId = 'data:image/png;base64,AAAA'
    })

    expect(paths({ value })).toEqual(['$.panels.front.layers[1].assetId'])
  })

  test('non-canonical colors and pattern presets', () => {
    const value = mutate((d) => {
      d.base = { kind: 'stripes', colors: ['#FFF', '#000000'], period: 0.9, angle: 0 }
      d.panels.back.layers[0].color = 'red'
    })

    expect(paths({ value })).toEqual([
      '$.base.colors[0]',
      '$.base.period',
      '$.panels.back.layers[0].color',
    ])
  })

  test('unknown base kinds and templates', () => {
    const value = mutate((d) => {
      d.base = { kind: 'gradient', colors: ['#000000', '#ffffff'] }
      d.template = { id: 'hoodie', version: 1.5 }
    })

    expect(paths({ value })).toEqual([
      '$.template.id',
      '$.template.version',
      '$.base.kind',
    ])
  })

  test('odd point lists and empty text', () => {
    const value = mutate((d) => {
      d.panels.front.layers[0].strokes[0].points = [0.1, 0.2, 0.3]
      d.panels.back.layers[0].content = '   '
    })

    expect(paths({ value })).toEqual([
      '$.panels.front.layers[0].strokes[0].points',
      '$.panels.back.layers[0].content',
    ])
  })
})
