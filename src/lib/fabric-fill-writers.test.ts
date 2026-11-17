// Measures the procedural tee (@3); must load before the store.
import './testing/procedural-tee'
import { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Texture } from 'three'
import { beforeEach, describe, expect, test } from 'vitest'

import { fabricOptions } from '../components/editor/FabricChooser'
import { applyDesignOverrides } from './apply-overrides'
import { applyCanonicalCommand, createCanonicalStack, undoCanonical } from './canonical-commands'
import {
  type CanonicalDocument,
  type CanonicalFillLayer,
  createEmptyCanonicalDocument,
  validateCanonicalDocument,
} from './canonical-document'
import { hashCanonicalDocument, serializeCanonicalDocument } from './canonical-hash'
import { DEFAULT_FILL_TILE, getCanonicalDocument, useEditorStore } from './editor-store'
import { BASE_FABRIC_IDS, baseFabricFor, getFabricById } from './fabrics'
import { fabricSurface, toRenderDocument } from './render-projection'

/**
 * Writers W: "Fabric in 3D" (`base.fabric`) and "Pattern on a whole
 * section" (`fill` layers), from the command to the 3D material.
 */

const cloud = { designId: 'd', headSeq: 1, title: 'Test', visibility: 'private' } as never

function open(document: CanonicalDocument) {
  useEditorStore.getState().reset()
  useEditorStore.getState().loadCanonical({ document, cloud })
}

function fill(overrides: Partial<CanonicalFillLayer> = {}): CanonicalFillLayer {
  return {
    id: 'fill-a',
    kind: 'fill',
    visible: true,
    opacity: 1,
    source: { pattern: 'stripes', colors: ['#ffffff', '#000000'] },
    tile: 0.2,
    rotation: 0,
    ...overrides,
  }
}

function run(document: CanonicalDocument, command: Parameters<typeof applyCanonicalCommand>[0]['command']) {
  return applyCanonicalCommand({ stack: createCanonicalStack({ document }), command })
}

describe('the fabric command', () => {
  test('setFabric sets the cloth and keeps the colour; null leaves it out', () => {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'solid', color: '#6b1d2a' }
    const set = run(document, { type: 'setFabric', fabric: 'satin' })

    expect(set.ok && set.stack.document.base).toEqual({ kind: 'solid', color: '#6b1d2a', fabric: 'satin' })

    const cleared = set.ok ? applyCanonicalCommand({ stack: set.stack, command: { type: 'setFabric', fabric: null } }) : null
    expect(cleared?.ok && cleared.stack.document.base).toEqual({ kind: 'solid', color: '#6b1d2a' })
  })

  test('a new colour or pattern keeps the cloth', () => {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'solid', color: '#6b1d2a', fabric: 'denim' }
    const recoloured = run(document, { type: 'setBase', base: { kind: 'stripes', colors: ['#111318', '#f4ead4'], period: 0.08, angle: 0 } })

    expect(recoloured.ok && recoloured.stack.document.base.fabric).toBe('denim')
  })

  test('a colourway is refused by the validator, so the store maps it to its base cloth', () => {
    expect(baseFabricFor({ fabricId: 'blush-silk' })).toBe('silk')
    expect(baseFabricFor({ fabricId: 'midnight-satin' })).toBe('satin')
    expect(baseFabricFor({ fabricId: 'nope' })).toBeNull()
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'solid', color: '#6b1d2a', fabric: 'blush-silk' as never }
    expect(validateCanonicalDocument({ value: document }).ok).toBe(false)
  })

  test('a design without a fabric hashes as before; a fabric changes the hash', async () => {
    const document = createEmptyCanonicalDocument()
    const before = await hashCanonicalDocument({ document })
    const set = run(document, { type: 'setFabric', fabric: 'wool' })
    const cleared = set.ok ? applyCanonicalCommand({ stack: set.stack, command: { type: 'setFabric', fabric: null } }) : null

    expect(set.ok && (await hashCanonicalDocument({ document: set.stack.document }))).not.toBe(before)
    expect(cleared?.ok && (await hashCanonicalDocument({ document: cleared.stack.document }))).toBe(before)
  })
})

describe('rendering a fabric', () => {
  test.each(BASE_FABRIC_IDS)('%s emits its surface on the body, in the chosen colour', (fabric) => {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'solid', color: '#1a1c22', fabric }
    const preset = getFabricById({ id: fabric })!
    const [override] = toRenderDocument({ document }).document.overrides

    expect(override).toMatchObject({
      meshName: 'body',
      color: '#1a1c22',
      roughness: preset.roughness,
      metalness: preset.metalness,
      mapId: preset.mapId,
    })
    expect(override!.sheen).toBe(preset.sheen)
    expect(override!.clearcoat).toBe(preset.clearcoat)
    expect(override!.detailId).toBe(preset.detailId)
    expect(override!.detailScale).toBe(preset.detailScale)
    expect(override!.opacity).toBe(preset.opacity)
    // Nothing undefined is written: each field is there only when the cloth has it.
    expect(Object.values(override!).every((value) => value !== undefined)).toBe(true)
  })

  test('stripes keep their ground as the colour', () => {
    const document = createEmptyCanonicalDocument()
    document.base = { kind: 'stripes', colors: ['#c4a15a', '#111318'], period: 0.08, angle: 0, fabric: 'linen' }
    expect(toRenderDocument({ document }).document.overrides[0]).toMatchObject({ color: '#c4a15a', mapId: 'linen-slub' })
  })

  test('no fabric renders exactly as before', () => {
    expect(toRenderDocument({ document: createEmptyCanonicalDocument() }).document.overrides).toEqual([])
  })

  test('the 3D material is shiny for satin, twill for denim, sheer for chiffon, coated for leather', () => {
    const material = (fabric: (typeof BASE_FABRIC_IDS)[number]) => {
      const mesh = new Mesh(undefined, new MeshStandardMaterial())
      mesh.name = 'body'
      applyDesignOverrides({
        root: mesh,
        overrides: [{ meshName: 'body', color: '#1a1c22', ...fabricSurface({ fabric }) }],
        maps: {} as Record<string, Texture>,
      })
      return mesh.material as MeshPhysicalMaterial
    }

    const satin = material('satin')
    expect(satin.sheen).toBe(1)
    expect(satin.roughness).toBeLessThan(0.4)
    expect(satin.color.getHexString()).toBe('1a1c22')
    expect(material('denim').userData.detailId).toBe('twill')
    expect(material('chiffon').transparent).toBe(true)
    expect(material('chiffon').opacity).toBeCloseTo(0.62)
    expect(material('leather').clearcoat).toBeGreaterThan(0)
    expect(material('canvas').roughness).toBeGreaterThan(0.9)
  })
})

describe('the fabric picker in the store', () => {
  beforeEach(() => open(createEmptyCanonicalDocument()))

  test('picking a fabric is one undo step and keeps the colour', () => {
    useEditorStore.getState().applyBaseColor({ color: '#6b1d2a' })
    const undo = useEditorStore.getState().undoCount
    useEditorStore.getState().setBaseFabric({ fabricId: 'satin' })

    expect(getCanonicalDocument().base).toEqual({ kind: 'solid', color: '#6b1d2a', fabric: 'satin' })
    expect(useEditorStore.getState().baseFabricId).toBe('satin')
    expect(useEditorStore.getState().undoCount).toBe(undo + 1)
    expect(useEditorStore.getState().overrides[0]).toMatchObject({ color: '#6b1d2a', mapId: 'satin-sheen', sheen: 1 })

    useEditorStore.getState().undoLast()
    expect(getCanonicalDocument().base).toEqual({ kind: 'solid', color: '#6b1d2a' })
    expect(useEditorStore.getState().baseFabricId).toBeNull()
  })

  test('applyFabric on a canonical garment stores the cloth, not its colour', () => {
    useEditorStore.getState().applyFabric({ fabricId: 'oxblood-leather', colorId: 'oxblood-leather' })
    expect(getCanonicalDocument().base).toEqual({ kind: 'solid', color: '#f3efe6', fabric: 'leather' })
  })

  test('a colour or pattern change keeps the cloth', () => {
    useEditorStore.getState().setBaseFabric({ fabricId: 'denim' })
    useEditorStore.getState().applyBaseColor({ color: '#c4a15a' })
    useEditorStore.getState().setBasePattern({ patternId: 'check' })

    expect(getCanonicalDocument().base).toMatchObject({ kind: 'check', fabric: 'denim' })
    expect(useEditorStore.getState().baseFabricId).toBe('denim')
  })

  test('the picker shows the saved fabric on load', () => {
    const saved = createEmptyCanonicalDocument()
    saved.base = { kind: 'solid', color: '#1a1c22', fabric: 'chiffon' }
    open(saved)

    expect(useEditorStore.getState().baseFabricId).toBe('chiffon')
    const options = fabricOptions({ selected: useEditorStore.getState().baseFabricId })
    expect(options.filter((option) => option.pressed).map((option) => option.id)).toEqual(['chiffon'])
    expect(options.map((option) => option.id)).toEqual([...BASE_FABRIC_IDS])
    expect(options.every((option) => option.map?.startsWith('/fabrics/'))).toBe(true)
  })
})

describe('section fills', () => {
  beforeEach(() => open(createEmptyCanonicalDocument()))

  const fills = () =>
    (['front', 'back', 'left', 'right'] as const).flatMap((panel) =>
      getCanonicalDocument().panels[panel].layers.filter((layer) => layer.kind === 'fill').map((layer) => ({ panel, layer })),
    )

  test('"Fill this side" adds one stripe fill on the side being worked on, with defaults left out', () => {
    useEditorStore.getState().setPaintPanel({ paintPanel: 'back' })
    const ids = useEditorStore.getState().addSectionFill({
      source: { kind: 'pattern', pattern: 'stripes', colors: ['#f7f3ea', '#1a1c22'] },
      sides: 'this',
    })

    expect(ids).toHaveLength(1)
    const [only] = fills()
    expect(only!.layer).toEqual({
      id: ids[0],
      kind: 'fill',
      visible: true,
      opacity: 1,
      source: { pattern: 'stripes', colors: ['#f7f3ea', '#1a1c22'] },
      tile: DEFAULT_FILL_TILE,
      rotation: 0,
    })
    expect(useEditorStore.getState().selectedLayerId).toBe(ids[0])
    // In the layer list, by name, and drawn.
    expect(useEditorStore.getState().document.layers.find((layer) => layer.id === ids[0])?.kind).toBe('fill')
    expect(serializeCanonicalDocument({ document: getCanonicalDocument() })).not.toMatch(/offset/)
  })

  test('"All sides" adds one fill per panel as one undo step', () => {
    const undo = useEditorStore.getState().undoCount
    const ids = useEditorStore.getState().addSectionFill({
      source: { kind: 'pattern', pattern: 'check', colors: ['#f4ead4', '#6b1d2a'] },
      sides: 'all',
    })

    expect(ids).toHaveLength(4)
    expect(fills().map(({ panel }) => panel).sort()).toEqual(['back', 'front', 'left', 'right'])
    expect(useEditorStore.getState().undoCount).toBe(undo + 1)

    useEditorStore.getState().undoLast()
    expect(fills()).toEqual([])
  })

  test('an image fill repeats the selected graphic, which it replaces, as one step', () => {
    useEditorStore.getState().addGraphic({ src: '/graphics/anchor.svg' })
    const markId = useEditorStore.getState().selectedLayerId!
    const mark = getCanonicalDocument().panels.front.layers.find((layer) => layer.id === markId)
    expect(mark?.kind).toBe('image')
    const undo = useEditorStore.getState().undoCount

    const [id] = useEditorStore.getState().addSectionFill({ source: { kind: 'image', replaceLayerId: markId }, sides: 'this' })

    const front = getCanonicalDocument().panels.front.layers
    expect(front.map((layer) => layer.id)).toEqual([id])
    expect(front[0]).toMatchObject({ kind: 'fill', source: { assetId: (mark as { assetId: string }).assetId, aspect: 1 } })
    expect(useEditorStore.getState().undoCount).toBe(undo + 1)
    // An image fill's asset is a use of it; a library one draws from the bundle.
    expect(useEditorStore.getState().document.layers.find((layer) => layer.id === id)).toMatchObject({
      kind: 'fill',
      source: { kind: 'image', src: '/graphics/anchor.svg' },
    })
  })

  test('tiling, turning, shifting and recolouring a fill; a zero phase is left out', () => {
    const [id] = useEditorStore.getState().addSectionFill({
      source: { kind: 'pattern', pattern: 'stripes', colors: ['#f7f3ea', '#1a1c22'] },
      sides: 'this',
    })
    const store = useEditorStore.getState()
    store.updateFill({ layerId: id!, patch: { tile: 0.5 } })
    store.updateFill({ layerId: id!, patch: { rotation: Math.PI / 4, offsetX: 0.25, offsetY: 0.5 } })
    store.updateFill({ layerId: id!, patch: { colors: ['#111318', '#c4a15a'] } })

    expect(fills()[0]!.layer).toMatchObject({
      tile: 0.5,
      rotation: Math.PI / 4,
      offsetX: 0.25,
      offsetY: 0.5,
      source: { pattern: 'stripes', colors: ['#111318', '#c4a15a'] },
    })

    store.updateFill({ layerId: id!, patch: { offsetX: 0, offsetY: 1 } })
    expect('offsetX' in fills()[0]!.layer).toBe(false)
    expect('offsetY' in fills()[0]!.layer).toBe(false)

    // Out-of-range tiles are clamped by the studio; the validator never sees them.
    store.updateFill({ layerId: id!, patch: { tile: 4 } })
    expect(fills()[0]!.layer).toMatchObject({ tile: 1 })
  })

  test('a fill is hidden, locked, restacked and removed like any layer', () => {
    useEditorStore.getState().addGraphic({ src: '/graphics/anchor.svg' })
    const [id] = useEditorStore.getState().addSectionFill({
      source: { kind: 'pattern', pattern: 'check', colors: ['#f7f3ea', '#1a1c22'] },
      sides: 'this',
    })
    const store = useEditorStore.getState()

    store.moveLayer({ layerId: id!, direction: 'back' })
    expect(getCanonicalDocument().panels.front.layers[0]!.id).toBe(id)

    store.updateLayer({ layerId: id!, patch: { visible: false } })
    expect(fills()[0]!.layer.visible).toBe(false)

    store.updateLayer({ layerId: id!, patch: { locked: true } })
    store.updateFill({ layerId: id!, patch: { tile: 0.6 } })
    expect(fills()[0]!.layer.tile).toBe(DEFAULT_FILL_TILE)

    store.updateLayer({ layerId: id!, patch: { locked: false } })
    store.removeLayer({ layerId: id! })
    expect(fills()).toEqual([])
  })

  test('the command refuses colours on an image fill and a locked fill', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers.push(fill({ source: { assetId: 'asset_lib_anchor', aspect: 1 } }))
    expect(run(document, { type: 'updateFill', layerId: 'fill-a', patch: { colors: ['#ffffff', '#000000'] } }).ok).toBe(false)

    document.panels.front.layers[0] = fill({ locked: true })
    expect(run(document, { type: 'updateFill', layerId: 'fill-a', patch: { tile: 0.3 } }).ok).toBe(false)
  })

  test('undo restores the tile', () => {
    const document = createEmptyCanonicalDocument()
    document.panels.front.layers.push(fill())
    const changed = run(document, { type: 'updateFill', layerId: 'fill-a', patch: { tile: 0.4 } })

    expect(changed.ok && changed.stack.document.panels.front.layers[0]).toMatchObject({ tile: 0.4 })
    expect(changed.ok && undoCanonical({ stack: changed.stack }).document.panels.front.layers[0]).toMatchObject({ tile: 0.2 })
  })
})
