import { create } from 'zustand'

import type { Design, GarmentId, MaterialOverride } from './design-schema'
import { resolveGarmentId } from './design-schema'
import { getFabricById } from './fabrics'

export type EditorMode = 'design' | 'atelier'

type EditorState = {
  mode: EditorMode
  selectedMeshName: string | null
  fabricId: string | null
  colorId: string | null
  garmentId: GarmentId
  overrides: MaterialOverride[]
  title: string
  author: string
  lastPublished: Omit<Design, 'id' | 'votes'> | null
  lookSerial: number
  setMode: ({ mode }: { mode: EditorMode }) => void
  selectMesh: ({ selectedMeshName }: { selectedMeshName: string | null }) => void
  setGarmentId: ({ garmentId }: { garmentId: GarmentId }) => void
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
  selectedMeshName: 'body' as string | null,
  fabricId: null as string | null,
  colorId: null as string | null,
  garmentId: 'column' as GarmentId,
  overrides: [] as MaterialOverride[],
  title: '',
  author: 'Guest',
  lastPublished: null as Omit<Design, 'id' | 'votes'> | null,
  lookSerial: 1,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...INITIAL_EDITOR_STATE,
  setMode: ({ mode }) => {
    set({ mode })
  },
  selectMesh: ({ selectedMeshName }) => {
    set({ selectedMeshName })
  },
  setGarmentId: ({ garmentId }) => {
    set({
      garmentId: resolveGarmentId({ garmentId }),
      selectedMeshName: 'body',
    })
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
      selectedMeshName: 'body',
      garmentId: resolveGarmentId({ garmentId: design.garmentId }),
    })
  },
  publishLook: ({ design }) => {
    set((state) => ({
      title: design.title,
      author: design.author,
      lookSerial: state.lookSerial + 1,
      lastPublished: {
        title: design.title,
        author: design.author,
        thumbnailDataUrl: design.thumbnailDataUrl,
        overrides: [...design.overrides],
        garmentId: resolveGarmentId({ garmentId: design.garmentId }),
      },
    }))
  },
  reset: () => {
    set({
      ...INITIAL_EDITOR_STATE,
      overrides: [],
      lastPublished: null,
      selectedMeshName: 'body',
      garmentId: 'column',
    })
  },
}))
