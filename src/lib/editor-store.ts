import { create } from 'zustand'

type EditorState = {
  mode: 'design' | 'walk'
  selectedMeshName: string | null
  setMode: ({ mode }: { mode: 'design' | 'walk' }) => void
  setSelectedMeshName: ({
    selectedMeshName,
  }: {
    selectedMeshName: string | null
  }) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  mode: 'design',
  selectedMeshName: null,
  setMode: ({ mode }) => {
    set({ mode })
  },
  setSelectedMeshName: ({ selectedMeshName }) => {
    set({ selectedMeshName })
  },
}))
