import { create } from 'zustand'

import type { Design, MaterialOverride } from './design-schema'
import { getFabricById } from './fabrics'

export type EditorMode = 'design' | 'atelier'

type EditorState = {
  mode: EditorMode
  selectedMeshName: string | null
  fabricId: string | null
  colorId: string | null
  overrides: MaterialOverride[]
  title: string
  author: string
  lastPublished: Omit<Design, 'id' | 'votes'> | null
  setMode: ({ mode }: { mode: EditorMode }) => void
  selectMesh: ({ selectedMeshName }: { selectedMeshName: string | null }) => void
  applyFabric: ({
    fabricId,
    colorId,
  }: {
    fabricId: string
    colorId: string
  }) => void
  undoLast: () => void
  loadDesign: ({ design }: { design: Design }) => void
  publishLook: ({
    design,
  }: {
    design: Omit<Design, 'id' | 'votes'>
  }) => void
  reset: () => void
}

const INITIAL_EDITOR_STATE = {
  mode: 'design' as const,
  selectedMeshName: null,
  fabricId: null,
  colorId: null,
  overrides: [] as MaterialOverride[],
  title: '',
  author: 'Guest',
  lastPublished: null,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...INITIAL_EDITOR_STATE,
  setMode: ({ mode }) => {
    set({ mode })
  },
  selectMesh: ({ selectedMeshName }) => {
    set({ selectedMeshName })
  },
  applyFabric: ({ fabricId, colorId }) => {
    set((state) => {
      if (!state.selectedMeshName) {
        return state
      }

      const preset = getFabricById({ id: fabricId }) ?? getFabricById({ id: colorId })

      if (!preset) {
        return state
      }

      const override: MaterialOverride = {
        meshName: state.selectedMeshName,
        color: preset.color,
        roughness: preset.roughness,
        metalness: preset.metalness,
        mapId: preset.mapId,
      }

      return {
        fabricId: preset.id,
        colorId: preset.id,
        overrides: [...state.overrides, override],
      }
    })
  },
  undoLast: () => {
    set((state) => {
      if (state.overrides.length === 0) {
        return state
      }

      return {
        overrides: state.overrides.slice(0, -1),
      }
    })
  },
  loadDesign: ({ design }) => {
    set({
      title: design.title,
      author: design.author,
      overrides: [...design.overrides],
      fabricId: null,
      colorId: null,
      selectedMeshName: null,
    })
  },
  publishLook: ({ design }) => {
    set({
      title: design.title,
      author: design.author,
      lastPublished: {
        title: design.title,
        author: design.author,
        thumbnailDataUrl: design.thumbnailDataUrl,
        overrides: [...design.overrides],
      },
    })
  },
  reset: () => {
    set({ ...INITIAL_EDITOR_STATE, overrides: [], lastPublished: null })
  },
}))
