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
      },
    })

    expect(useEditorStore.getState().title).toBe('Ivory Silk 01')
    expect(useEditorStore.getState().lastPublished?.overrides).toEqual([
      { meshName: 'collar', color: '#f4ead4' },
    ])
    expect(useEditorStore.getState().lastPublished?.thumbnailDataUrl).toContain(
      'image/png',
    )
    expect(useEditorStore.getState().lookSerial).toBe(2)
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
})
