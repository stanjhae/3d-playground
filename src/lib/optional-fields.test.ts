import { describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type CanonicalFillLayer,
  type CanonicalLayer,
  createEmptyCanonicalDocument,
  readCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { applyCanonicalCommand, createCanonicalStack } from './canonical-commands'
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
  currentTemplateFor,
  garmentOfTemplate,
  isUpcomingTemplateVersion,
  READABLE_TEMPLATE_IDS,
  resolveTemplate,
  TEMPLATE_IDS,
  UPCOMING_TEMPLATE_IDS,
} from './template-manifest'
import { hitPlaceableLayer, layerVoice } from './layer-hit'
import { layerListGroups } from './layer-list'
import { uploadedAssetReferences } from './flp-api/contract'
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

  test('the garments R read are made now (D1): each opens on its own template, and none is upcoming', () => {
    expect([...UPCOMING_GARMENT_IDS]).toEqual([])
    expect([...UPCOMING_TEMPLATE_IDS]).toEqual([])

    for (const id of ['vest', 'crop', 'dress', 'trousers']) {
      expect(GARMENT_IDS).toContain(id)
      expect(TEMPLATE_IDS).toContain(id)
      expect(READABLE_TEMPLATE_IDS).toContain(id)
      expect(resolveTemplate({ id, version: 1 }).ok).toBe(true)
      expect(garmentOfTemplate({ id, version: 1 })).toBe(id)
    }
  })

  test("a document on a D1 template reads with that template's panels", () => {
    expect(issuesOf(upcoming('vest'))).toEqual([])
    expect(issuesOf(upcoming('crop', ['front', 'back', 'left', 'right']))).toEqual([])
    expect(issuesOf(upcoming('trousers', ['front', 'back', 'leg-left']))).not.toEqual([])
    expect(issuesOf(upcoming('cape', ['front', 'back', 'left', 'right']))).toEqual([expect.stringMatching(/^\$\.template\.id: expected one of /)])
  })

  test('the server stores a design on a D1 template', async () => {
    const prepared = await prepareContent({ value: upcoming('dress') })
    expect(prepared.ok).toBe(true)
  })

  test('the D1 garments are offered in the rail, studio, search and vote filters', () => {
    for (const garmentId of ['vest', 'crop', 'dress', 'trousers'] as const) {
      expect(isUpcomingGarment({ garmentId })).toBe(false)
      expect(showsGarmentInStudio({ garmentId })).toBe(true)
      expect(parseCreateSearch({ search: { garment: garmentId } }).garment).toBe(garmentId)
      expect(boardGarmentOptions({ looks: [{ ...createEmptyDesign({ id: `look-${garmentId}` }), garmentId }] })).toEqual([garmentId])
      expect(listRailGarments().map((garment) => garment.id)).toContain(garmentId)
    }

    expect(listGarmentsByCategory({ category: 'bottoms' }).map((garment) => garment.id)).toEqual(['trousers'])
    expect(listGarmentsByCategory({ category: 'tops' }).map((garment) => garment.id)).toEqual(expect.arrayContaining(['vest', 'crop']))
  })
})

/**
 * Reader R2: the garment's fabric, stretching one side, whole-panel fills
 * and the tee's @6. This release reads and draws them while nothing writes
 * them yet; the writers merge once it is deployed (docs/release.md).
 */
const STRIPE_FILL: CanonicalFillLayer = {
  id: 'fill-stripes',
  kind: 'fill',
  visible: true,
  opacity: 1,
  source: { pattern: 'stripes', colors: ['#f3efe6', '#1a1c22'] },
  tile: 0.25,
  rotation: 0,
}

describe('reader R2', () => {
  function everyField(): CanonicalDocument {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'check', colors: ['#f3efe6', '#9c4a2b'], period: 0.1, fabric: 'linen' }
    document.panels.front.layers = [
      { ...STRIPE_FILL, rotation: 0.4, offsetX: 0.25, offsetY: 0.5, name: 'Stripes', locked: true },
      image({ scaleY: 0.2 }),
      { id: 'word', kind: 'text', visible: true, opacity: 1, x: 0.5, y: 0.3, scale: 0.1, scaleY: 0.3, rotation: 0, content: 'FLP', face: 'sans', color: '#1a1c22' },
    ]
    document.panels.back.layers = [{ ...STRIPE_FILL, id: 'fill-image', source: { assetId: ASSET, aspect: 2 }, tile: 0.5 }]
    return document
  }

  test('a design using every new field loads, validates, round-trips and hashes stably', async () => {
    const document = everyField()
    const serialized = serializeCanonicalDocument({ document })
    const reloaded = readCanonicalDocument({ value: JSON.parse(serialized) })

    expect(issuesOf(document)).toEqual([])
    expect(reloaded.ok).toBe(true)
    expect(reloaded.ok && serializeCanonicalDocument({ document: reloaded.document })).toBe(serialized)
    expect(await hashCanonicalDocument({ document: JSON.parse(serialized) })).toBe(await hashCanonicalDocument({ document }))
    expect(serialized).toContain('"fabric":"linen"')
    expect(serialized).toContain('"scaleY":0.2')
    expect(serialized).toContain('"kind":"fill"')
    expect((await prepareContent({ value: JSON.parse(serialized) })).ok).toBe(true)
  })

  test('documents without the new fields hash exactly as before', async () => {
    // Pinned before reader R2.
    const plain = createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 5 })
    const marked = createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version: 5 })
    marked.base = { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.08, angle: 0.5 }
    marked.panels.front.layers = [
      { id: 'img', kind: 'image', visible: true, opacity: 1, assetId: ASSET, aspect: 1.5, x: 0.5, y: 0.5, scale: 0.4, rotation: 0.3 },
      { id: 'word', kind: 'text', visible: true, opacity: 1, x: 0.5, y: 0.3, scale: 0.1, rotation: 0, content: 'FLP', face: 'sans', color: '#1a1c22' },
    ]
    const hoodie = createEmptyCanonicalDocument({ templateId: 'hoodie' })
    hoodie.base = { kind: 'check', colors: ['#f3efe6', '#9c4a2b'], period: 0.1 }

    expect(await hashCanonicalDocument({ document: plain })).toBe('sha256:11166646439a98a72b7c9a1e3e75a986f28acb444fb3f83b27df66439e9ef74f')
    expect(await hashCanonicalDocument({ document: marked })).toBe('sha256:a2c0a8fe288833bb3d0643b15fe00b48f611272ff34180925fcd130163cadafd')
    expect(await hashCanonicalDocument({ document: hoodie })).toBe('sha256:4ddb693a8355118acc566f9eca51ba40a0392b4a3ea093403e8a6181d98890b9')
    expect(serializeCanonicalDocument({ document: marked })).not.toMatch(/fabric|scaleY|"fill"/)
  })

  test('scaling a stretched layer back to square drops scaleY, so it hashes as uniform', () => {
    const stack = createCanonicalStack({ document: withFront([image({ scaleY: 0.2 })]) })
    const result = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'img', patch: { scale: 0.2 } } })

    expect(result.ok).toBe(true)
    expect(result.stack.document.panels.front.layers[0]).not.toHaveProperty('scaleY')
  })

  test('a fill is hidden, faded and locked from the layer list, but never placed', () => {
    const stack = createCanonicalStack({ document: withFront([STRIPE_FILL]) })
    const hidden = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'fill-stripes', patch: { visible: false, opacity: 0.5, locked: true } } })
    const moved = applyCanonicalCommand({ stack, command: { type: 'updateLayer', layerId: 'fill-stripes', patch: { x: 0.2 } } })

    expect(hidden.ok && hidden.stack.document.panels.front.layers[0]).toMatchObject({ visible: false, opacity: 0.5, locked: true })
    expect(moved.ok).toBe(false)
  })

  test('an image fill counts as a use of its asset', () => {
    expect(uploadedAssetReferences({ document: everyField() })).toEqual([
      { assetId: ASSET, path: '$.panels.front.layers[1].assetId' },
      { assetId: ASSET, path: '$.panels.back.layers[0].source.assetId' },
    ])
  })

  test('the layer list names a fill, and the panel never hit-tests it', () => {
    const { document: render } = toRenderDocument({ document: everyField(), assetSources: { [ASSET]: SRC } })
    const fills = render.layers.filter((layer) => layer.kind === 'fill')

    expect(fills.map((layer) => layerVoice({ layer }))).toEqual(['Stripes', 'Image fill'])
    expect(layerVoice({ layer: { ...fills[0]!, label: undefined } })).toBe('Stripe fill')
    const groups = layerListGroups({
      layers: render.layers,
      panels: [
        { id: 'front', label: 'Front' },
        { id: 'back', label: 'Back' },
      ],
      placement: () => null,
    })
    // Above the base check, which the projection draws first.
    expect(groups.find((group) => group.panel === 'back')?.rows.map((row) => row.name)).toEqual(['Image fill', 'Check'])

    const onlyFill = toRenderDocument({ document: withFront([STRIPE_FILL]) }).document

    for (const x of [0.1, 0.5, 0.9]) {
      expect(hitPlaceableLayer({ document: onlyFill, panel: 'front', x, y: 0.5 })).toBeNull()
    }
  })

  test('tee-crew-short@6, read since R2, is baked: it opens, and the tee has moved on to @7', async () => {
    const document = { ...createEmptyCanonicalDocument(), template: { id: 'tee-crew-short', version: 6 } }
    const resolved = resolveTemplate(document.template)

    // The seam-gaps writer baked it, so it is no longer upcoming.
    expect(isUpcomingTemplateVersion(document.template)).toBe(false)
    expect(issuesOf(document)).toEqual([])
    expect(resolved.ok).toBe(true)
    expect(garmentOfTemplate(document.template)).toBe('tee')
    expect((await prepareContent({ value: document })).ok).toBe(true)
  })
})

/**
 * The tee's @7 (round 2): both sleeves print all round and lay out as
 * mirror images. Its reader and writer land together, so the floor moves to
 * the release carrying it from the first design saved on it
 * (docs/release.md). Builds before it read such a design but can't open it.
 */
describe('tee-crew-short@7', () => {
  test('is current: a new tee pins it, and it reads, validates, opens and hashes stably', async () => {
    const document = createEmptyCanonicalDocument()
    document.panels.left!.layers = [image({})]
    document.panels.right!.layers = [{ ...STRIPE_FILL, id: 'fill-right' }]
    const serialized = serializeCanonicalDocument({ document })
    const reloaded = readCanonicalDocument({ value: JSON.parse(serialized) })

    expect(document.template).toEqual({ id: 'tee-crew-short', version: 7 })
    expect(currentTemplateFor({ templateId: 'tee-crew-short' }).version).toBe(7)
    expect(isUpcomingTemplateVersion(document.template)).toBe(false)
    expect(issuesOf(document)).toEqual([])
    expect(resolveTemplate(document.template).ok).toBe(true)
    expect(garmentOfTemplate(document.template)).toBe('tee')
    expect(reloaded.ok && serializeCanonicalDocument({ document: reloaded.document })).toBe(serialized)
    expect(await hashCanonicalDocument({ document: JSON.parse(serialized) })).toBe(await hashCanonicalDocument({ document }))
    expect((await prepareContent({ value: JSON.parse(serialized) })).ok).toBe(true)
  })

  test('a build before it reads the design on the tee\'s panels and says it cannot open it', () => {
    // What a build without @7 does with an unknown version: the tee's panels
    // validate, and opening reports the version, never dropping anything.
    const later = resolveTemplate({ id: 'tee-crew-short', version: 8 })
    expect(!later.ok && later.reason).toBe('unsupported-version')
    expect(!later.ok && later.message).toMatch(/cannot open/)
    expect(issuesOf({ ...createEmptyCanonicalDocument(), template: { id: 'tee-crew-short', version: 8 } })).toEqual([])
  })
})

describe('drawing reader R2', () => {
  const inked = (buffer: ReturnType<typeof draw>, x: number, y: number) => atlasPixelAtPanel({ buffer, panel: 'front', x, y }).a > 0

  test('a stretched image draws taller than it is wide; a uniform one draws as before', () => {
    const square = draw(withFront([image({ scale: 0.2 })]))
    const tall = draw(withFront([image({ scale: 0.2, scaleY: 0.6 })]))

    // Same width either way…
    expect(inked(tall, 0.5, 0.5)).toBe(true)
    for (const x of [0.3, 0.7, 0.8]) {
      expect(inked(tall, x, 0.5), String(x)).toBe(inked(square, x, 0.5))
    }
    // …but only the stretched one reaches well above and below its centre.
    expect(inked(square, 0.5, 0.75)).toBe(false)
    expect(inked(tall, 0.5, 0.75)).toBe(true)
    expect(inked(tall, 0.5, 0.25)).toBe(true)
  })

  test('uniform layers draw bit-identically with or without the new code paths', () => {
    // A stretch to the same height is refused by the validator, but drawn it is a no-op.
    const { document: render } = toRenderDocument({ document: withFront([image({ scale: 0.3, rotation: 0.4 })]), assetSources: { [ASSET]: SRC } })
    const same = { ...render, layers: render.layers.map((layer) => (layer.kind === 'graphic' ? { ...layer, scaleY: layer.scale } : layer)) }

    expect(render.layers[0]).not.toHaveProperty('scaleY')
    expectSamePixels(
      rasterizeLayers({ document: same, width: 512, height: 512, images: { [SRC]: gradient() } }).pixels,
      rasterizeLayers({ document: render, width: 512, height: 512, images: { [SRC]: gradient() } }).pixels,
    )
  })

  test('a stretched word projects its scaleY; a uniform one carries none', () => {
    const word = (extra: Record<string, unknown> = {}) =>
      ({ id: 'w', kind: 'text', visible: true, opacity: 1, x: 0.5, y: 0.5, scale: 0.1, rotation: 0, content: 'II', face: 'sans', color: '#1a1c22', ...extra }) as CanonicalLayer

    expect(toRenderDocument({ document: withFront([word()]) }).document.layers[0]).not.toHaveProperty('scaleY')
    expect(toRenderDocument({ document: withFront([word({ scaleY: 0.3 })]) }).document.layers[0]).toMatchObject({ scaleY: 0.3 })
  })

  test('a stripe fill covers its whole panel and nothing else', () => {
    const buffer = draw(withFront([STRIPE_FILL]))
    const colours = new Set<number>()

    for (let x = 0.01; x < 1; x += 0.049) {
      for (let y = 0.01; y < 1; y += 0.049) {
        const pixel = atlasPixelAtPanel({ buffer, panel: 'front', x, y })
        expect(pixel.a, `${x}, ${y}`).toBe(255)
        colours.add(pixel.r)
      }
    }

    // Both the ground and the stripe show, and the sleeves and back stay bare.
    expect([...colours].sort((a, b) => a - b)).toEqual([0x1a, 0xf3])
    for (const panel of ['back', 'left', 'right']) {
      expect(atlasPixelAtPanel({ buffer, panel, x: 0.5, y: 0.5 }).a, panel).toBe(0)
    }
  })

  test('an image fill repeats its tile across the panel', () => {
    const fill: CanonicalLayer = { ...STRIPE_FILL, id: 'fill-image', source: { assetId: ASSET, aspect: 1 }, tile: 0.25 }
    const buffer = draw(withFront([fill]))
    const red = (x: number) => atlasPixelAtPanel({ buffer, panel: 'front', x, y: 0.5 }).r

    // One repeat is a quarter of the panel's width: the gradient restarts.
    for (const x of [0.05, 0.3, 0.55]) {
      expect(atlasPixelAtPanel({ buffer, panel: 'front', x, y: 0.5 }).a).toBe(255)
      expect(Math.abs(red(x) - red(x + 0.125)), String(x)).toBeGreaterThan(64)
      expect(Math.abs(red(x) - red(x + 0.25)), String(x)).toBeLessThanOrEqual(32)
    }
  })

  test('a fill draws in layer order', () => {
    const over = draw(withFront([STRIPE_FILL, image({ scale: 0.2 })]))
    const under = draw(withFront([image({ scale: 0.2 }), STRIPE_FILL]))
    const centre = (buffer: ReturnType<typeof draw>) => atlasPixelAtPanel({ buffer, panel: 'front', x: 0.5, y: 0.5 })

    expect(centre(over)).not.toEqual(centre(under))
    expect([0x1a, 0xf3]).toContain(centre(under).r)
  })

  test('a hidden fill draws nothing', () => {
    expectSamePixels(draw(withFront([{ ...STRIPE_FILL, visible: false }])).pixels, draw(withFront([])).pixels)
  })
})

test('uniform layers on tee @2, @4 and @5 draw exactly as pinned', async () => {
  const out: string[] = []

  for (const version of [2, 4, 5]) {
    const document = createEmptyCanonicalDocument({ templateId: 'tee-crew-short', version })
    document.base = { kind: 'stripes', colors: ['#f3efe6', '#1a1c22'], period: 0.08, angle: 0.5 }
    document.panels.front.layers = [
      { id: 'img', kind: 'image', visible: true, opacity: 0.8, assetId: 'asset_optional01', aspect: 1.5, x: 0.4, y: 0.5, scale: 0.4, rotation: 0.3, flipX: true },
      { id: 'img2', kind: 'image', visible: true, opacity: 1, assetId: 'asset_optional02', aspect: 0.5, x: 0.6, y: 0.3, scale: 0.3, rotation: 0 },
      { id: 'word', kind: 'text', visible: true, opacity: 1, x: 0.5, y: 0.3, scale: 0.1, rotation: 0.2, content: 'FLP', face: 'sans', color: '#1a1c22' },
    ]
    document.panels.back.layers = [
      { id: 'img3', kind: 'image', visible: true, opacity: 1, assetId: 'asset_missing01', aspect: 1, x: 0.3, y: 0.6, scale: 0.2, rotation: -1 },
    ]
    const image = createAtlasBuffer({ width: 16, height: 16 })
    for (let index = 0; index < 256; index += 1) {
      image.pixels[index * 4] = (index % 16) * 16
      image.pixels[index * 4 + 1] = Math.floor(index / 16) * 16
      image.pixels[index * 4 + 3] = 255
    }
    const { document: render } = toRenderDocument({ document, assetSources: { asset_optional01: '/a.png', asset_optional02: '/b.png' } })
    const buffer = rasterizeLayers({ document: render, width: 512, height: 512, images: { '/a.png': image, '/b.png': image } })
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(buffer.pixels)))
    out.push([...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
  }

  // Pinned before reader R2: stripes, flipped, tall and missing images, a
  // word. R2 drew them bit for bit the same. The seam-gaps writer (atlas
  // compiler 2) re-approved @4 and @5: their panels now bleed into the
  // padding round them and clip edges round outward. @2's panels touch, so
  // it has no padding to bleed into and draws as before.
  expect(out).toEqual([
    'a8e543d224554ae9d9a42a1a6db664ec17e232606a99d4236048592af2cbcb12',
    '49852e3926b3dc8f13b5d14968d9a5de6535a086aa5dcb33b89c93a67d7891a1',
    'fd2821aae78a782c6576cb9fbf0415df55d3553c354f8e140d1778be9b397fbe',
  ])
})
