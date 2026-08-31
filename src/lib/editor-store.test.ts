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
    expect(state.garmentId).toBe('column')
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
    expect(useEditorStore.getState().garmentId).toBe('column')
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
})
