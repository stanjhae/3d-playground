import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type GarmentBase,
  type ValidationIssue,
  createEmptyCanonicalDocument,
  imageBox,
  validateCanonicalDocument,
} from './canonical-document'
import { ATLAS_SIZE } from './paint-atlas'
import {
  DEFAULT_PANEL_UV,
  atlasPixelForUv,
  panelPointToUv,
} from './panel-uv'

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
            rotation: -0.218166,
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
            rotation: 3.141593,
          },
        ],
      },
      right: { layers: [] },
    },
  }
}

const BASES: GarmentBase[] = [
  { kind: 'solid', color: '#f7f3ea' },
  { kind: 'stripes', colors: ['#111318', '#f4ead4'], period: 0.08, angle: 0.785398 },
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests write invalid shapes on purpose
function mutate(edit: (document: Record<string, any>) => void) {
  const document = structuredClone(
    fullDocument({ base: BASES[0]! }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
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
      d.panels.back.layers[0].rotation = -3.141593
    })

    expect(issuesFor({ value })).toEqual([
      {
        path: '$.panels.front.layers[0].strokes[0].points[3]',
        message: 'expected a finite number in [0, 1]',
      },
      { path: '$.panels.front.layers[1].opacity', message: 'out of range [0, 1]' },
      { path: '$.panels.front.layers[1].x', message: 'expected a finite number' },
      { path: '$.panels.front.layers[1].scale', message: 'out of range (0, 1]' },
      { path: '$.panels.back.layers[0].rotation', message: 'out of range (-3.141593, 3.141593]' },
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
      d.template = { id: 'cape', version: 1.5 }
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

describe('coordinate contract', () => {
  test('panel y grows up: y = 0 is the bottom row of the print region', () => {
    const bottom = panelPointToUv({ panel: 'front', x: 0, y: 0 })
    const top = panelPointToUv({ panel: 'front', x: 0, y: 1 })
    const atlas = { width: ATLAS_SIZE, height: ATLAS_SIZE }

    expect(bottom).toEqual({
      u: DEFAULT_PANEL_UV.front.u0,
      v: DEFAULT_PANEL_UV.front.v0,
    })
    expect(atlasPixelForUv({ ...bottom, ...atlas }).row).toBeGreaterThan(
      atlasPixelForUv({ ...top, ...atlas }).row,
    )
  })

  test('aspect 1 reproduces the legacy square image stamp', () => {
    expect(imageBox({ scale: 0.32, aspect: 1 })).toEqual({
      width: 0.32,
      height: 0.32,
    })
  })

  test('non-square images are contained in the scale square', () => {
    expect(imageBox({ scale: 0.3, aspect: 2 })).toEqual({
      width: 0.3,
      height: 0.15,
    })
    expect(imageBox({ scale: 0.3, aspect: 0.5 })).toEqual({
      width: 0.15,
      height: 0.3,
    })
  })
})

describe('template-driven panels', () => {
  test('a new document takes its panels and colour from the template', async () => {
    const { createEmptyCanonicalDocument, panelIdsOf } = await import('./canonical-document')
    const document = createEmptyCanonicalDocument()

    expect(document.template).toEqual({ id: 'tee-crew-short', version: 5 })
    expect(document.base).toEqual({ kind: 'solid', color: '#ffffff' })
    expect(panelIdsOf({ document })).toEqual(['front', 'back', 'left', 'right'])
  })

  test('the validator asks for exactly the template panels', async () => {
    const { createEmptyCanonicalDocument, validateCanonicalDocument } = await import('./canonical-document')
    const document = createEmptyCanonicalDocument()
    const { left: _left, ...withoutLeft } = document.panels

    const result = validateCanonicalDocument({ value: { ...document, panels: withoutLeft } })

    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toContain('$.panels.left')
  })

  test('an unknown template is refused by id, not by its panels', async () => {
    const { createEmptyCanonicalDocument, templatePanelIds, validateCanonicalDocument } = await import('./canonical-document')
    const document = createEmptyCanonicalDocument()

    expect(templatePanelIds({ template: { id: 'nope', version: 1 } })).toEqual(['front', 'back', 'left', 'right'])
    const result = validateCanonicalDocument({ value: { ...document, template: { id: 'nope', version: 1 } } })
    expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toEqual(['$.template.id'])
  })
})

/**
 * Reader R2: base fabric, stretched layers, whole-panel fills and the
 * tee's @6. Nothing writes them yet; the reader refuses every malformed form.
 */
describe('reader R2 contract', () => {
  const FILL = {
    id: 'fill-front',
    kind: 'fill',
    visible: true,
    opacity: 1,
    source: { pattern: 'stripes', colors: ['#f3efe6', '#1a1c22'] },
    tile: 0.2,
    rotation: 0,
  }

  test('a known base fabric is read on every kind of base', () => {
    for (const base of BASES) {
      expect(validateCanonicalDocument({ value: mutate((d) => (d.base = { ...base, fabric: 'linen' })) }).ok, base.kind).toBe(true)
    }
  })

  test('an unknown fabric, or a colourway, is refused', () => {
    expect(issuesFor({ value: mutate((d) => (d.base.fabric = 'tweed')) })).toEqual([
      { path: '$.base.fabric', message: expect.stringMatching(/^expected one of cotton, silk, /) },
    ])
    expect(paths({ value: mutate((d) => (d.base.fabric = 'ivory-silk')) })).toEqual(['$.base.fabric'])
    expect(paths({ value: mutate((d) => (d.base.fabric = null)) })).toEqual(['$.base.fabric'])
  })

  test('scaleY takes the bounds of scale, and is left out when uniform', () => {
    expect(validateCanonicalDocument({ value: mutate((d) => (d.panels.front.layers[1].scaleY = 0.6)) }).ok).toBe(true)
    expect(validateCanonicalDocument({ value: mutate((d) => (d.panels.back.layers[0].scaleY = 0.05)) }).ok).toBe(true)

    expect(issuesFor({ value: mutate((d) => (d.panels.front.layers[1].scaleY = 0)) })).toEqual([
      { path: '$.panels.front.layers[1].scaleY', message: 'out of range (0, 1]' },
    ])
    expect(issuesFor({ value: mutate((d) => (d.panels.back.layers[0].scaleY = 1.2)) })).toEqual([
      { path: '$.panels.back.layers[0].scaleY', message: 'out of range (0, 1]' },
    ])
    expect(paths({ value: mutate((d) => (d.panels.front.layers[1].scaleY = Number.NaN)) })).toEqual([
      '$.panels.front.layers[1].scaleY',
    ])
    expect(issuesFor({ value: mutate((d) => (d.panels.front.layers[1].scaleY = 0.32)) })).toEqual([
      { path: '$.panels.front.layers[1].scaleY', message: 'equal to scale; leave it out' },
    ])
    expect(paths({ value: mutate((d) => (d.panels.front.layers[0].scaleY = 0.5)) })).toEqual([
      '$.panels.front.layers[0].scaleY',
    ])
  })

  test('a well-formed fill is read, with a pattern or an image', () => {
    expect(validateCanonicalDocument({ value: mutate((d) => d.panels.right.layers.push(FILL)) }).ok).toBe(true)
    expect(
      validateCanonicalDocument({
        value: mutate((d) =>
          d.panels.right.layers.push({
            ...FILL,
            source: { assetId: 'asset_3f9a1c22b7', aspect: 2 },
            tile: 1,
            rotation: -1.2,
            offsetX: 0.25,
            offsetY: 0.5,
            name: 'Roses',
            locked: true,
          }),
        ),
      }).ok,
    ).toBe(true)
  })

  test('a malformed fill is refused with paths', () => {
    const value = mutate((d) =>
      d.panels.right.layers.push({
        ...FILL,
        x: 0.5,
        scaleY: 0.5,
        source: { pattern: 'gradient', colors: ['#FFFFFF', '#000000'] },
        tile: 0.01,
        rotation: 4,
        offsetX: 0,
        offsetY: 1,
      }),
    )

    expect(paths({ value })).toEqual([
      '$.panels.right.layers[0].x',
      '$.panels.right.layers[0].scaleY',
      '$.panels.right.layers[0].source.pattern',
      '$.panels.right.layers[0].source.colors[0]',
      '$.panels.right.layers[0].tile',
      '$.panels.right.layers[0].rotation',
      '$.panels.right.layers[0].offsetX',
      '$.panels.right.layers[0].offsetY',
    ])
    const { tile: _tile, source: _source, ...bare } = FILL
    expect(issuesFor({ value: mutate((d) => d.panels.right.layers.push(bare)) }).slice(0, 2)).toEqual([
      { path: '$.panels.right.layers[0].source', message: 'required' },
      { path: '$.panels.right.layers[0].tile', message: 'required' },
    ])
    expect(
      paths({ value: mutate((d) => d.panels.right.layers.push({ ...FILL, source: { assetId: 'data:image/png;base64,abc', aspect: 0 } })) }),
    ).toEqual(['$.panels.right.layers[0].source.assetId', '$.panels.right.layers[0].source.aspect'])
    expect(
      paths({
        value: mutate((d) =>
          d.panels.right.layers.push({ ...FILL, source: { assetId: 'asset_3f9a1c22b7', aspect: 1, pattern: 'stripes' } }),
        ),
      }),
    ).toEqual(['$.panels.right.layers[0].source.pattern'])
  })

  test('an empty fill source is refused', () => {
    expect(issuesFor({ value: mutate((d) => d.panels.right.layers.push({ ...FILL, source: {} })) })).toEqual([
      { path: '$.panels.right.layers[0].source', message: 'expected an assetId or a pattern' },
    ])
    expect(issuesFor({ value: mutate((d) => d.panels.right.layers.push({ ...FILL, source: null })) })).toEqual([
      { path: '$.panels.right.layers[0].source', message: 'expected an object' },
    ])
  })
})
