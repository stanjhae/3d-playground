import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type CanonicalLayer,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { hashCanonicalDocument, serializeCanonicalDocument } from './canonical-hash'
import { boardGarmentOptions } from './board-filters'
import { showsGarmentInStudio } from './concept-flags'
import { parseCreateSearch } from './create-search'
import { createEmptyDesign, GARMENT_IDS, isUpcomingGarment, UPCOMING_GARMENT_IDS } from './design-schema'
import { prepareContent } from './flp-api/contract'
import { listRailGarments } from './garments'
import { listGarmentsByCategory } from './landing-demo'
import { FABRICS } from './pattern/build-cloth'
import { PATTERN_FABRICS } from './pattern/pattern-document'
import { fixtureTeePattern } from './pattern/pattern-fixtures'
import {
  garmentOfTemplate,
  READABLE_TEMPLATE_IDS,
  resolveTemplate,
  TEMPLATE_IDS,
  UPCOMING_TEMPLATE_IDS,
} from './template-manifest'
import { atlasPixelAtPanel, createAtlasBuffer, rasterizeLayers } from './paint-atlas'
import { toRenderDocument } from './render-projection'

/**
 * Optional fields a later release writes: flips and locks on layers, and
 * pen pressure on strokes. This release reads and draws them, so a design
 * written by the next one still opens here if that one is rolled back.
 */

const ASSET = 'asset_optional01'
const SRC = '/optional/asset.png'

function withFront(layers: CanonicalLayer[]): CanonicalDocument {
  const document = createEmptyCanonicalDocument()
  document.panels.front.layers = layers
  return document
}

function image(extra: Partial<Extract<CanonicalLayer, { kind: 'image' }>> = {}): CanonicalLayer {
  return { id: 'img', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 1, x: 0.5, y: 0.5, scale: 0.5, rotation: 0, ...extra }
}

function stroke(extra: Record<string, unknown> = {}): CanonicalLayer {
  return {
    id: 'paint',
    kind: 'paint',
    visible: true,
    opacity: 1,
    strokes: [{ id: 's', tool: 'brush', color: '#1a1c22', width: 0.05, opacity: 1, points: [0.2, 0.5, 0.5, 0.5, 0.8, 0.5], ...extra }],
  }
}

function issuesOf(document: unknown) {
  const result = validateCanonicalDocument({ value: document })
  return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

/** Red rises left to right, so a mirror shows as red falling instead. */
function gradient() {
  const buffer = createAtlasBuffer({ width: 16, height: 16 })

  for (let index = 0; index < 16 * 16; index += 1) {
    buffer.pixels[index * 4] = (index % 16) * 16
    buffer.pixels[index * 4 + 3] = 255
  }

  return buffer
}

function draw(document: CanonicalDocument) {
  const { document: render } = toRenderDocument({ document, assetSources: { [ASSET]: SRC } })
  return rasterizeLayers({ document: render, width: 512, height: 512, images: { [SRC]: gradient() } })
}

describe('reading the optional fields', () => {
  test('a document using every optional field is valid and keeps them through a save', () => {
    const document = withFront([
      { ...stroke({ pressures: [0.2, 0.9, 0.4] }), locked: true } as CanonicalLayer,
      image({ flipX: true, flipY: true, locked: true }),
      { id: 'word', kind: 'text', visible: true, opacity: 1, x: 0.5, y: 0.3, scale: 0.1, rotation: 0, content: 'FLP', face: 'sans', color: '#1a1c22', flipX: true },
    ])

    expect(issuesOf(document)).toEqual([])
    expect(issuesOf(JSON.parse(serializeCanonicalDocument({ document })))).toEqual([])
    expect(serializeCanonicalDocument({ document })).toContain('"pressures":[0.2,0.9,0.4]')
  })

  test('a flag is written only when on, and only where it means something', () => {
    expect(issuesOf(withFront([image({ flipX: false as unknown as true })]))).toEqual([
      '$.panels.front.layers[0].flipX: expected true, or left out',
    ])
    expect(issuesOf(withFront([{ ...stroke(), flipX: true } as unknown as CanonicalLayer]))).toEqual([
      '$.panels.front.layers[0].flipX: unknown field',
    ])
  })

  test('pressures need one value per point, each from 0 to 1', () => {
    expect(issuesOf(withFront([stroke({ pressures: [0.5, 0.5] })]))).toEqual([
      '$.panels.front.layers[0].strokes[0].pressures: expected one pressure per point',
    ])
    expect(issuesOf(withFront([stroke({ pressures: [0.5, 1.2, 0.5] })]))).toEqual([
      '$.panels.front.layers[0].strokes[0].pressures[1]: expected a finite number in [0, 1]',
    ])
  })
})

/**
 * Byte equality for two atlases. `toEqual` walks a 1 MB array element by
 * element, which took over 5 s on CI runners.
 */
function expectSamePixels(actual: Uint8ClampedArray, expected: Uint8ClampedArray) {
  expect(actual.length).toBe(expected.length)
  const first = actual.findIndex((value, index) => value !== expected[index])
  expect(first, `first differing byte at ${first}`).toBe(-1)
}

describe('drawing the optional fields', () => {
  test('a stroke at the default pressure draws exactly like one with none', () => {
    expectSamePixels(draw(withFront([stroke({ pressures: [0.7, 0.7, 0.7] })])).pixels, draw(withFront([stroke()])).pixels)
  })

  test('pressure changes the width along the stroke', () => {
    const ink = (pressures: number[]) => draw(withFront([stroke({ pressures })])).pixels.filter((_, index) => index % 4 === 3 && _ > 0).length

    expect(ink([1, 1, 1])).toBeGreaterThan(ink([0.7, 0.7, 0.7]))
    expect(ink([0.1, 0.1, 0.1])).toBeLessThan(ink([0.7, 0.7, 0.7]))
  })

  test('flipping an image mirrors it about its own axis', () => {
    const red = (document: CanonicalDocument, x: number) =>
      atlasPixelAtPanel({ buffer: draw(document), panel: 'front', x, y: 0.5 }).r

    expect(red(withFront([image()]), 0.4)).toBeLessThan(red(withFront([image()]), 0.6))
    expect(red(withFront([image({ flipX: true })]), 0.4)).toBeGreaterThan(red(withFront([image({ flipX: true })]), 0.6))
  })

  test('a lock changes nothing that is drawn', () => {
    expectSamePixels(draw(withFront([{ ...image(), locked: true }])).pixels, draw(withFront([image()])).pixels)
  })
})

describe('shape (parametric shape v1)', () => {
  test('a shaped v4 tee reads, projects its shape, and serializes stably', () => {
    const document: CanonicalDocument = {
      ...createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 4 }),
      shape: { leftSleeveLength: 0.5, rightSleeveLength: -0.2, bodyLength: 0.1, bodyWidth: 0.05, necklineDepth: 0.4 },
    }

    expect(issuesOf(document)).toEqual([])
    expect(toRenderDocument({ document }).document.shape).toEqual(document.shape)
    expect(serializeCanonicalDocument({ document: JSON.parse(serializeCanonicalDocument({ document })) })).toBe(
      serializeCanonicalDocument({ document }),
    )
  })
})

/**
 * Pattern-reader R: cut-outs, more simulation fabrics and four upcoming
 * garments. This release reads them; the cut-out, fabric-drape and
 * new-garment writers merge only after it has been out a release cycle
 * (docs/release.md). Holes are covered in pattern/pattern-document.test.ts.
 */
describe('pattern-reader R', () => {
  function upcoming(templateId: string, panels: string[] = ['front', 'back']): Record<string, unknown> {
    return {
      ...createEmptyCanonicalDocument(),
      template: { id: templateId, version: 1 },
      panels: Object.fromEntries(panels.map((panel) => [panel, { layers: [] }])),
    }
  }

  test('a tee with holes on its front reads and keeps them through a save', () => {
    const pattern = fixtureTeePattern()
    pattern.pieces[0]!.holes = [[{ id: 'h0', x: 0, y: 330 }, { id: 'h1', x: 30, y: 300 }, { id: 'h2', x: -30, y: 300 }]]
    const document = { ...createEmptyCanonicalDocument(), pattern }

    expect(issuesOf(document)).toEqual([])
    expect(JSON.parse(serializeCanonicalDocument({ document })).pattern.pieces[0].holes).toEqual(pattern.pieces[0]!.holes)
  })

  test('a document without holes or new fabrics hashes as it always did', async () => {
    // Pinned before pattern-reader R.
    const document = { ...createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 4 }), pattern: fixtureTeePattern() }
    expect(await hashCanonicalDocument({ document })).toBe('sha256:4ef1d28a830aacdaecacd65005f1f7faf11c9623f6543c91a96c4ad958ae5796')
    expect(serializeCanonicalDocument({ document })).not.toContain('holes')
  })

  test('every simulation fabric has stable compliances, and the old ones are unchanged', () => {
    for (const fabric of PATTERN_FABRICS) {
      const { stretch, bend } = FABRICS[fabric]
      expect(stretch, fabric).toBeGreaterThanOrEqual(1e-7)
      expect(bend / stretch, fabric).toBeGreaterThanOrEqual(10)
    }

    expect(PATTERN_FABRICS).toEqual(expect.arrayContaining(['linen', 'chiffon', 'canvas', 'wool']))
    expect({ jersey: FABRICS.jersey, woven: FABRICS.woven, fleece: FABRICS.fleece, denim: FABRICS.denim, satin: FABRICS.satin, firm: FABRICS.firm }).toEqual({
      jersey: { stretch: 2e-6, bend: 4e-5 },
      woven: { stretch: 1e-6, bend: 2e-5 },
      fleece: { stretch: 1.5e-6, bend: 2e-5 },
      denim: { stretch: 6e-7, bend: 1.2e-5 },
      satin: { stretch: 1e-6, bend: 6e-5 },
      firm: { stretch: 5e-7, bend: 1e-5 },
    })
  })

  test('upcoming garments are named after their templates, which this build reads but cannot open', () => {
    expect([...UPCOMING_GARMENT_IDS]).toEqual(['vest', 'crop', 'dress', 'trousers'])
    expect([...UPCOMING_TEMPLATE_IDS]).toEqual([...UPCOMING_GARMENT_IDS])

    for (const id of UPCOMING_TEMPLATE_IDS) {
      expect(GARMENT_IDS).toContain(id)
      expect(TEMPLATE_IDS).not.toContain(id)
      expect(READABLE_TEMPLATE_IDS).toContain(id)
      expect(resolveTemplate({ id, version: 1 }).ok).toBe(false)
      expect(garmentOfTemplate({ id, version: 1 })).toBe(id)
    }
  })

  test("a document on an upcoming template reads with its own panels", () => {
    expect(issuesOf(upcoming('vest'))).toEqual([])
    expect(issuesOf(upcoming('trousers', ['front', 'back', 'leg-left', 'leg-right']))).toEqual([])
    expect(issuesOf(upcoming('vest', []))).toEqual(['$.panels: expected 1 to 8 panels'])
    expect(issuesOf(upcoming('vest', ['front', 'bad panel']))).toEqual(['$.panels.bad panel: expected a stable panel id'])
    expect(issuesOf(upcoming('cape', ['front', 'back', 'left', 'right']))).toEqual([expect.stringMatching(/^\$\.template\.id: expected one of /)])
  })

  test('the server still refuses to store a design this build cannot open', async () => {
    const prepared = await prepareContent({ value: upcoming('dress') })
    expect(prepared.ok).toBe(false)
  })

  test('upcoming garments stay out of the rail, studio, search and vote filters', () => {
    for (const garmentId of UPCOMING_GARMENT_IDS) {
      expect(isUpcomingGarment({ garmentId })).toBe(true)
      expect(showsGarmentInStudio({ garmentId })).toBe(false)
      expect(parseCreateSearch({ search: { garment: garmentId } }).garment).toBeUndefined()
      expect(boardGarmentOptions({ looks: [{ ...createEmptyDesign({ id: `look-${garmentId}` }), garmentId }] })).toEqual([])
    }

    const shown = [
      ...listRailGarments(),
      ...(['tops', 'bottoms', 'outerwear', 'accessories'] as const).flatMap((category) => listGarmentsByCategory({ category })),
    ].map((garment) => garment.id)
    expect(shown.filter((id) => isUpcomingGarment({ garmentId: id }))).toEqual([])
    expect(showsGarmentInStudio({ garmentId: 'tee' })).toBe(true)
    expect(parseCreateSearch({ search: { garment: 'tee' } }).garment).toBe('tee')
  })
})
