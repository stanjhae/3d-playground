import { beforeEach, describe, expect, test } from 'vitest'

import { createEmptyDesign } from './design-schema'
import { useEditorStore } from './editor-store'

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  test('starts in design mode with the body live', () => {
    const state = useEditorStore.getState()

    expect(state.mode).toBe('design')
    expect(state.selectedMeshName).toBe('body')
    expect(state.garmentId).toBe('gown')
    expect(state.fabricId).toBeNull()
    expect(state.colorId).toBeNull()
    expect(state.overrides).toEqual([])
    expect(state.title).toBe('')
    expect(state.author).toBe('Guest')
    expect(state.lookSerial).toBe(1)
    expect(state.studioView).toBe('cloth')
  })

  test('setMode and selectMesh use named parameters', () => {
    useEditorStore.getState().setMode({ mode: 'atelier' })
    useEditorStore.getState().selectMesh({
      selectedMeshName: 'collar',
    })

    expect(useEditorStore.getState().mode).toBe('atelier')
    expect(useEditorStore.getState().selectedMeshName).toBe('collar')
  })

  test('applyFabric is a no-op without a selection or known preset', () => {
    useEditorStore.getState().selectMesh({ selectedMeshName: null })
    useEditorStore.getState().applyFabric({
      fabricId: 'ivory-silk',
      colorId: 'ivory-silk',
    })

    expect(useEditorStore.getState().overrides).toEqual([])

    useEditorStore.getState().selectMesh({ selectedMeshName: 'collar' })
    useEditorStore.getState().applyFabric({
      fabricId: 'missing',
      colorId: 'also-missing',
    })

    expect(useEditorStore.getState().overrides).toEqual([])
  })

  test('applyFabric appends an override from the fabric preset', () => {
    useEditorStore.getState().selectMesh({ selectedMeshName: 'collar' })
    useEditorStore.getState().applyFabric({
      fabricId: 'ivory-silk',
      colorId: 'ivory-silk',
    })

    expect(useEditorStore.getState().fabricId).toBe('ivory-silk')
    expect(useEditorStore.getState().colorId).toBe('ivory-silk')
    expect(useEditorStore.getState().overrides).toEqual([
      {
        meshName: 'collar',
        color: '#f4ead4',
        roughness: 0.18,
        metalness: 0.04,
        mapId: 'silk-shine',
      },
    ])
  })

  test('undoLast pops the last override', () => {
    useEditorStore.getState().selectMesh({ selectedMeshName: 'body' })
    useEditorStore.getState().applyFabric({
      fabricId: 'ink-cotton',
      colorId: 'ink-cotton',
    })
    useEditorStore.getState().applyFabric({
      fabricId: 'oxblood-leather',
      colorId: 'oxblood-leather',
    })
    useEditorStore.getState().undoLast()

    expect(useEditorStore.getState().overrides).toHaveLength(1)
    expect(useEditorStore.getState().overrides[0]?.mapId).toBe('cotton-weave')
  })

  test('loadDesign copies title, author, and overrides and clears stale fabric', () => {
    useEditorStore.getState().selectMesh({ selectedMeshName: 'collar' })
    useEditorStore.getState().applyFabric({
      fabricId: 'ivory-silk',
      colorId: 'ivory-silk',
    })

    const design = {
      ...createEmptyDesign({ id: 'look-1' }),
      title: 'Midnight Silk 04',
      author: 'Guest',
      overrides: [{ meshName: 'lining', color: '#6b1d2a' }],
    }

    useEditorStore.getState().loadDesign({ design })

    expect(useEditorStore.getState().title).toBe('Midnight Silk 04')
    expect(useEditorStore.getState().author).toBe('Guest')
    expect(useEditorStore.getState().overrides).toEqual(design.overrides)
    expect(useEditorStore.getState().overrides).not.toBe(design.overrides)
    expect(useEditorStore.getState().fabricId).toBeNull()
    expect(useEditorStore.getState().colorId).toBeNull()
    expect(useEditorStore.getState().selectedMeshName).toBe('body')
    expect(useEditorStore.getState().garmentId).toBe('gown')
  })

  test('setGarmentId clears cloth when the form changes', () => {
    useEditorStore.getState().selectMesh({ selectedMeshName: 'body' })
    useEditorStore.getState().applyFabric({
      fabricId: 'ivory-silk',
      colorId: 'ivory-silk',
    })
    useEditorStore.getState().setGarmentId({ garmentId: 'gown' })

    expect(useEditorStore.getState().overrides).toHaveLength(1)
    expect(useEditorStore.getState().fabricId).toBe('ivory-silk')

    useEditorStore.getState().setGarmentId({ garmentId: 'slip' })

    expect(useEditorStore.getState().garmentId).toBe('slip')
    expect(useEditorStore.getState().selectedMeshName).toBe('body')
    expect(useEditorStore.getState().overrides).toEqual([])
    expect(useEditorStore.getState().fabricId).toBeNull()
    expect(useEditorStore.getState().colorId).toBeNull()
    expect(useEditorStore.getState().studioView).toBe('cloth')
  })

  test('setGarmentId returns the next form to cloth', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().setStudioView({ studioView: 'draw' })
    expect(useEditorStore.getState().studioView).toBe('draw')

    useEditorStore.getState().setGarmentId({ garmentId: 'gown' })

    expect(useEditorStore.getState().studioView).toBe('cloth')
  })

  test('loadDesign maps a live column look onto the gown', () => {
    useEditorStore.getState().loadDesign({
      design: {
        ...createEmptyDesign({ id: 'look-column' }),
        // Live board still writes column.
        garmentId: 'column' as never,
      },
    })

    expect(useEditorStore.getState().garmentId).toBe('gown')
  })

  test('ink undo and redo share the cloth stack', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().startStroke({
      panel: 'front',
      point: { x: 0.4, y: 0.5 },
    })
    useEditorStore.getState().appendStroke({ point: { x: 0.45, y: 0.5 } })
    useEditorStore.getState().endStroke()

    const paint = useEditorStore.getState().document.layers[0]
    expect(paint && paint.kind === 'paint' ? paint.strokes : []).toHaveLength(1)
    expect(useEditorStore.getState().undoCount).toBe(1)

    useEditorStore.getState().undoLast()
    const undone = useEditorStore.getState().document.layers[0]
    expect(undone && undone.kind === 'paint' ? undone.strokes : []).toHaveLength(
      0,
    )

    useEditorStore.getState().redoLast()
    const redone = useEditorStore.getState().document.layers[0]
    expect(redone && redone.kind === 'paint' ? redone.strokes : []).toHaveLength(
      1,
    )
  })

  test('publishLook keeps the design for later vote wiring', () => {
    useEditorStore.getState().publishLook({
      design: {
        title: 'Ivory Silk 01',
        author: 'Guest',
        thumbnailDataUrl: 'data:image/png;base64,abc',
        overrides: [{ meshName: 'collar', color: '#f4ead4' }],
        tags: ['ivory'],
        method: 'draw',
        challengeId: 'tee-night',
        avatarId: 'atelier-tall',
      },
    })

    expect(useEditorStore.getState().title).toBe('Ivory Silk 01')
    expect(useEditorStore.getState().lastPublished?.overrides).toEqual([
      { meshName: 'collar', color: '#f4ead4' },
    ])
    expect(useEditorStore.getState().lastPublished?.thumbnailDataUrl).toContain(
      'image/png',
    )
    expect(useEditorStore.getState().lastPublished?.tags).toEqual(['ivory'])
    expect(useEditorStore.getState().lastPublished?.method).toBe('draw')
    expect(useEditorStore.getState().lastPublished?.challengeId).toBe(
      'tee-night',
    )
    expect(useEditorStore.getState().lookSerial).toBe(2)
    expect(
      useEditorStore.getState().snapshots.some(
        (snapshot) => snapshot.title === 'Ivory Silk 01',
      ),
    ).toBe(true)
  })

  test('create step and avatar fields use named setters', () => {
    useEditorStore.getState().setCreateStep({ createStep: 'preview' })
    useEditorStore.getState().setDesignEditMode({ designEditMode: 'tech' })
    useEditorStore.getState().setPublishTags({ tags: ['night'] })
    useEditorStore.getState().setPublishMethod({ method: 'combined' })
    useEditorStore.getState().setChallengeId({ challengeId: 'tee-night' })
    useEditorStore.getState().setAvatarId({ avatarId: 'atelier-tall' })
    useEditorStore.getState().setCameraPreset({ cameraPreset: 'front' })
    useEditorStore.getState().setCapturingAngles({ capturingAngles: true })
    useEditorStore.getState().setAvatarMeasurements({
      measurements: { height: 185 },
    })

    const state = useEditorStore.getState()
    expect(state.createStep).toBe('preview')
    expect(state.studioView).toBe('cloth')
    expect(state.designEditMode).toBe('tech')
    expect(state.publishTags).toEqual(['night'])
    expect(state.publishMethod).toBe('combined')
    expect(state.challengeId).toBe('tee-night')
    expect(state.avatarId).toBe('atelier-tall')
    expect(state.cameraPreset).toBe('front')
    expect(state.capturingAngles).toBe(true)
    expect(state.avatarMeasurements.height).toBe(185)
  })

  test('setBasePattern undo restores the previous fill', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().setBasePattern({ patternId: 'stripe' })
    expect(
      useEditorStore
        .getState()
        .document.layers.some(
          (layer) => layer.kind === 'pattern' && layer.patternId === 'stripe',
        ),
    ).toBe(true)

    useEditorStore.getState().setBasePattern({ patternId: 'check' })
    const checkFills = useEditorStore
      .getState()
      .document.layers.filter((layer) => layer.id.startsWith('base-fill-'))
    expect(checkFills.length).toBe(4)
    expect(checkFills.every((layer) => layer.kind === 'pattern')).toBe(true)
    expect(
      checkFills.find((layer) => layer.id === 'base-fill-front'),
    ).toMatchObject({ patternId: 'check', panel: 'front' })

    useEditorStore.getState().undoLast()
    expect(
      useEditorStore
        .getState()
        .document.layers.find((layer) => layer.id === 'base-fill-front'),
    ).toMatchObject({ patternId: 'stripe' })
  })

  test('preview step auto-selects the first avatar for tee', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().setAvatarId({ avatarId: null })
    useEditorStore.getState().setCreateStep({ createStep: 'preview' })

    const state = useEditorStore.getState()
    expect(state.avatarId).toBe('atelier-tall')
    expect(state.avatarMeasurements.height).toBe(188)
  })

  test('paint panel can target each tee side', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })

    for (const paintPanel of ['front', 'back', 'left', 'right'] as const) {
      useEditorStore.getState().setPaintPanel({ paintPanel })
      expect(useEditorStore.getState().paintPanel).toBe(paintPanel)
    }
  })

  test('entered looks keep a morning on this house', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().rememberMorning({ title: 'Morning' })

    for (let index = 0; index < 6; index += 1) {
      useEditorStore.getState().rememberEnteredLook({
        title: `Look ${index}`,
        document: useEditorStore.getState().document,
        still: '/stills/look-house-ink.png',
        lookId: `look-${index}`,
      })
    }

    const snapshots = useEditorStore.getState().snapshots
    expect(snapshots.some((snapshot) => snapshot.title === 'Morning')).toBe(
      true,
    )
    expect(
      snapshots.filter((snapshot) => snapshot.kind === 'entered'),
    ).toHaveLength(4)
  })

  test('publishLook still finishes when the shelf will not keep a still', () => {
    const memory: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem(key: string) {
          return memory[key] ?? null
        },
        setItem() {
          throw new Error('quota')
        },
        removeItem(key: string) {
          delete memory[key]
        },
        clear() {
          for (const key of Object.keys(memory)) {
            delete memory[key]
          }
        },
        key: () => null,
        length: 0,
      } satisfies Storage,
    })

    expect(() => {
      useEditorStore.getState().publishLook({
        design: {
          title: 'Silk 02',
          author: 'Guest',
          thumbnailDataUrl: `data:image/png;base64,${'a'.repeat(200)}`,
          overrides: [],
        },
      })
    }).not.toThrow()
    expect(useEditorStore.getState().title).toBe('Silk 02')
    expect(useEditorStore.getState().lastPublished?.title).toBe('Silk 02')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
    })
  })

  test('switching garments shelves the ink and restore clears undo', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().startStroke({
      panel: 'front',
      point: { x: 0.4, y: 0.5 },
    })
    useEditorStore.getState().endStroke()
    useEditorStore.getState().rememberMorning({ title: 'Morning' })

    expect(useEditorStore.getState().undoCount).toBe(1)

    useEditorStore.getState().setGarmentId({ garmentId: 'gown' })
    const gownPaint = useEditorStore.getState().document.layers[0]
    expect(
      gownPaint && gownPaint.kind === 'paint' ? gownPaint.strokes : [],
    ).toHaveLength(0)

    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    const teePaint = useEditorStore.getState().document.layers[0]
    expect(
      teePaint && teePaint.kind === 'paint' ? teePaint.strokes : [],
    ).toHaveLength(1)

    const snapshot = useEditorStore.getState().snapshots[0]
    expect(snapshot).toBeTruthy()
    if (!snapshot) {
      return
    }

    useEditorStore.getState().restoreMorning({ snapshot })
    expect(useEditorStore.getState().undoCount).toBe(0)
    expect(useEditorStore.getState().redoCount).toBe(0)
  })

  test('a word can move and hide without flattening ink', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().addText({
      content: 'FLV',
      x: 0.5,
      y: 0.4,
    })

    const word = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.kind === 'text')
    expect(word?.kind === 'text' ? word.content : null).toBe('FLV')
    if (!word) {
      return
    }

    useEditorStore.getState().startLayerEdit({
      edit: {
        layerId: word.id,
        x: 0.3,
        y: 0.55,
        scale: 0.2,
        rotation: 0,
      },
    })
    useEditorStore.getState().endLayerEdit()

    const moved = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.id === word.id)
    expect(moved && moved.kind === 'text' ? moved.x : null).toBe(0.3)

    useEditorStore.getState().updateLayer({
      layerId: word.id,
      patch: { visible: false },
    })
    const hidden = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.id === word.id)
    expect(hidden?.visible).toBe(false)

    useEditorStore.getState().removeLayer({ layerId: word.id })
    expect(
      useEditorStore
        .getState()
        .document.layers.some((layer) => layer.id === word.id),
    ).toBe(false)
  })

  test('selecting a word is not an undo', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().addText({
      content: 'FLV',
      x: 0.5,
      y: 0.4,
    })

    const word = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.kind === 'text')
    expect(word).toBeTruthy()
    if (!word || word.kind !== 'text') {
      return
    }

    expect(useEditorStore.getState().undoCount).toBe(1)

    useEditorStore.getState().startLayerEdit({
      edit: {
        layerId: word.id,
        x: word.x,
        y: word.y,
        scale: word.scale,
        rotation: word.rotation,
      },
    })
    useEditorStore.getState().endLayerEdit()

    expect(useEditorStore.getState().undoCount).toBe(1)
    expect(useEditorStore.getState().activeLayerEdit).toBeNull()
    expect(useEditorStore.getState().selectedLayerId).toBe(word.id)
  })

  test('face and size do not write onto ink', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().startStroke({
      panel: 'front',
      point: { x: 0.4, y: 0.5 },
    })
    useEditorStore.getState().endStroke()

    const paint = useEditorStore.getState().document.layers[0]
    expect(paint?.kind).toBe('paint')
    if (!paint) {
      return
    }

    expect(useEditorStore.getState().undoCount).toBe(1)

    useEditorStore.getState().selectLayer({ selectedLayerId: paint.id })
    useEditorStore.getState().updateLayer({
      layerId: paint.id,
      patch: { face: 'sans', scale: 0.22 },
    })

    expect(useEditorStore.getState().undoCount).toBe(1)
    expect(useEditorStore.getState().document.layers[0]).toBe(paint)
  })

  test('undo clears a live layer edit', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().addText({
      content: 'FLV',
      x: 0.5,
      y: 0.4,
    })

    const word = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.kind === 'text')
    if (!word || word.kind !== 'text') {
      return
    }

    useEditorStore.getState().startLayerEdit({
      edit: {
        layerId: word.id,
        x: 0.2,
        y: 0.2,
        scale: word.scale,
        rotation: word.rotation,
      },
    })
    useEditorStore.getState().undoLast()

    expect(useEditorStore.getState().activeLayerEdit).toBeNull()
    expect(useEditorStore.getState().activeStroke).toBeNull()
    expect(
      useEditorStore
        .getState()
        .document.layers.some((layer) => layer.kind === 'text'),
    ).toBe(false)
  })

  test('an empty type draft does not stamp a word', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().setTypeDraft({ typeDraft: '  ' })
    useEditorStore.getState().addText({
      content: useEditorStore.getState().typeDraft,
    })

    expect(
      useEditorStore
        .getState()
        .document.layers.some((layer) => layer.kind === 'text'),
    ).toBe(false)
    expect(useEditorStore.getState().undoCount).toBe(0)
    expect(useEditorStore.getState().typeDraft).toBe('  ')
  })

  test('clear ink is a single undo', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().startStroke({
      panel: 'front',
      point: { x: 0.2, y: 0.2 },
    })
    useEditorStore.getState().endStroke()
    useEditorStore.getState().startStroke({
      panel: 'front',
      point: { x: 0.8, y: 0.8 },
    })
    useEditorStore.getState().endStroke()
    useEditorStore.getState().clearInk()

    const paint = useEditorStore.getState().document.layers[0]
    expect(paint && paint.kind === 'paint' ? paint.strokes : []).toHaveLength(0)
    expect(useEditorStore.getState().undoCount).toBe(3)

    useEditorStore.getState().undoLast()
    const restored = useEditorStore.getState().document.layers[0]
    expect(
      restored && restored.kind === 'paint' ? restored.strokes : [],
    ).toHaveLength(2)
  })

  test('crop keeps the word and a stripe can sit on the cloth', () => {
    useEditorStore.getState().setGarmentId({ garmentId: 'tee' })
    useEditorStore.getState().addText({
      content: 'HOUSE',
      x: 0.5,
      y: 0.42,
    })
    useEditorStore.getState().addPattern({ patternId: 'check' })
    useEditorStore.getState().setStructural({
      structural: { neck: 'v', hem: 'crop', sleeve: 'long' },
    })

    const word = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.kind === 'text')
    const print = useEditorStore
      .getState()
      .document.layers.find((layer) => layer.kind === 'pattern')

    expect(word && word.kind === 'text' ? word.content : null).toBe('HOUSE')
    expect(print && print.kind === 'pattern' ? print.patternId : null).toBe(
      'check',
    )
    expect(useEditorStore.getState().document.structural).toEqual({
      neck: 'v',
      hem: 'crop',
      sleeve: 'long',
    })
  })
})
