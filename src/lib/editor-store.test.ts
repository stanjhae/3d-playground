import { describe, expect, test } from 'vitest'

import { useEditorStore } from './editor-store'

describe('useEditorStore', () => {
  test('starts in design mode with no selection', () => {
    useEditorStore.setState({
      mode: 'design',
      selectedMeshName: null,
    })

    expect(useEditorStore.getState().mode).toBe('design')
    expect(useEditorStore.getState().selectedMeshName).toBeNull()
  })

  test('setMode and setSelectedMeshName use named parameters', () => {
    useEditorStore.getState().setMode({ mode: 'walk' })
    useEditorStore.getState().setSelectedMeshName({
      selectedMeshName: 'sleeve',
    })

    expect(useEditorStore.getState().mode).toBe('walk')
    expect(useEditorStore.getState().selectedMeshName).toBe('sleeve')
  })
})
