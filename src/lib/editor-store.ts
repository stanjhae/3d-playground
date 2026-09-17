import { create } from 'zustand'

import {
  applyCommand,
  canRedo,
  canUndo,
  createCommandStack,
  redoCommand,
  undoCommand,
  type CommandStack,
  type DesignCommand,
  type LayerPatch,
} from './design-commands'
import {
  createEmptyDocument,
  createObjectId,
  documentFromDesign,
  type DesignDocument,
  type NeckId,
  type PanelId,
  type PatternId,
  type StructuralParams,
  type Stroke,
  type StrokePoint,
  type StrokeTool,
  type TextFace,
} from './design-document'
import {
  placeablePoseMatches,
  type LayerEdit,
} from './layer-hit'
import type { Design, GarmentId, MaterialOverride } from './design-schema'
import { resolveGarmentId } from './design-schema'
import {
  listSnapshots,
  rememberSnapshot,
  type DesignSnapshot,
} from './design-snapshots'
import { getFabricById } from './fabrics'
import { isSafeLayerSrc } from './look-thumbnail'
import { INK_COLORS, INK_WIDTHS, TYPE_SIZES } from './paint-colors'

export type EditorMode = 'design' | 'atelier'
export type StudioView = 'draw' | 'cloth'
export type EditorPaintTool = StrokeTool | 'type'

type EditorState = {
  mode: EditorMode
  selectedMeshName: string | null
  fabricId: string | null
  colorId: string | null
  garmentId: GarmentId
  overrides: MaterialOverride[]
  document: DesignDocument
  title: string
  author: string
  lastPublished: Omit<Design, 'id' | 'votes'> | null
  lookSerial: number
  paintPanel: PanelId
  paintTool: EditorPaintTool
  paintColor: string
  paintWidth: number
  studioView: StudioView
  activeStroke: Stroke | null
  selectedLayerId: string | null
  activeLayerEdit: LayerEdit | null
  textFace: TextFace
  textScale: number
  typeDraft: string
  snapshots: DesignSnapshot[]
  undoCount: number
  redoCount: number
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
  redoLast: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  loadDesign: ({ design }: { design: Design }) => void
  publishLook: ({
    design,
  }: {
    design: Omit<Design, 'id' | 'votes'>
  }) => void
  reset: () => void
  setPaintPanel: ({ paintPanel }: { paintPanel: PanelId }) => void
  setPaintTool: ({ paintTool }: { paintTool: EditorPaintTool }) => void
  setPaintColor: ({ paintColor }: { paintColor: string }) => void
  setPaintWidth: ({ paintWidth }: { paintWidth: number }) => void
  setStudioView: ({ studioView }: { studioView: StudioView }) => void
  startStroke: ({
    panel,
    point,
    pressure,
  }: {
    panel: PanelId
    point: StrokePoint
    pressure?: number
  }) => void
  appendStroke: ({
    point,
    pressure,
  }: {
    point: StrokePoint
    pressure?: number
  }) => void
  endStroke: () => void
  clearInk: () => void
  addGraphic: ({
    src,
    panel,
  }: {
    src: string
    panel?: PanelId
  }) => void
  addText: ({
    content,
    panel,
    x,
    y,
    face,
    scale,
  }: {
    content: string
    panel?: PanelId
    x?: number
    y?: number
    face?: TextFace
    scale?: number
  }) => void
  selectLayer: ({
    selectedLayerId,
  }: {
    selectedLayerId: string | null
  }) => void
  startLayerEdit: ({ edit }: { edit: LayerEdit }) => void
  moveLayerEdit: ({ edit }: { edit: LayerEdit }) => void
  endLayerEdit: () => void
  updateLayer: ({
    layerId,
    patch,
  }: {
    layerId: string
    patch: LayerPatch
  }) => void
  setTextFace: ({ textFace }: { textFace: TextFace }) => void
  setTextScale: ({ textScale }: { textScale: number }) => void
  setTypeDraft: ({ typeDraft }: { typeDraft: string }) => void
  removeLayer: ({ layerId }: { layerId: string }) => void
  setNeck: ({ neck }: { neck: NeckId }) => void
  setStructural: ({ structural }: { structural: StructuralParams }) => void
  addPattern: ({
    patternId,
    panel,
    x,
    y,
  }: {
    patternId: PatternId
    panel?: PanelId
    x?: number
    y?: number
  }) => void
  hydrateDocument: ({
    document,
    garmentId,
  }: {
    document: DesignDocument
    garmentId?: GarmentId
  }) => void
  rememberMorning: ({ title }: { title: string }) => void
  rememberEnteredLook: ({
    title,
    document,
    still,
    lookId,
  }: {
    title: string
    document: DesignDocument
    still?: string
    lookId?: string
  }) => void
  restoreMorning: ({ snapshot }: { snapshot: DesignSnapshot }) => void
}

function emptyDocument({ garmentId }: { garmentId: GarmentId }) {
  return createEmptyDocument({ garmentId })
}

function stackFromDocument({ document }: { document: DesignDocument }) {
  return createCommandStack({ document })
}

let commandStack: CommandStack = stackFromDocument({
  document: emptyDocument({ garmentId: 'gown' }),
})

const garmentShelves = new Map<GarmentId, CommandStack>()

function shelfCurrent({ garmentId }: { garmentId: GarmentId }) {
  garmentShelves.set(garmentId, commandStack)
}

function restoreShelf({ garmentId }: { garmentId: GarmentId }) {
  const shelved = garmentShelves.get(garmentId)

  if (!shelved) {
    return null
  }

  commandStack = shelved
  return commandStack
}

function syncFromStack({
  extra,
}: {
  extra?: Partial<EditorState>
} = {}) {
  const document = commandStack.document

  return {
    document,
    overrides: document.overrides,
    garmentId: document.garmentId,
    undoCount: commandStack.past.length,
    redoCount: commandStack.future.length,
    ...extra,
  }
}

function runCommand({
  command,
  extra,
}: {
  command: DesignCommand
  extra?: Partial<EditorState>
}) {
  commandStack = applyCommand({ stack: commandStack, command })
  return syncFromStack({ extra })
}

function layerPatchChanges({
  layer,
  patch,
}: {
  layer: DesignDocument['layers'][number]
  patch: LayerPatch
}) {
  if (layer.kind === 'paint') {
    return patch.visible !== undefined && patch.visible !== layer.visible
  }

  if (layer.kind !== 'graphic' && layer.kind !== 'text' && layer.kind !== 'pattern') {
    return false
  }

  if (patch.x !== undefined && patch.x !== layer.x) {
    return true
  }

  if (patch.y !== undefined && patch.y !== layer.y) {
    return true
  }

  if (patch.scale !== undefined && patch.scale !== layer.scale) {
    return true
  }

  if (patch.rotation !== undefined && patch.rotation !== layer.rotation) {
    return true
  }

  if (patch.visible !== undefined && patch.visible !== layer.visible) {
    return true
  }

  if (layer.kind === 'text') {
    if (patch.content !== undefined && patch.content !== layer.content) {
      return true
    }

    if (patch.face !== undefined && patch.face !== layer.face) {
      return true
    }
  }

  return false
}

const INITIAL_EDITOR_STATE = {
  mode: 'design' as const,
  selectedMeshName: 'body' as string | null,
  fabricId: null as string | null,
  colorId: null as string | null,
  garmentId: 'gown' as GarmentId,
  overrides: [] as MaterialOverride[],
  document: emptyDocument({ garmentId: 'gown' }),
  title: '',
  author: 'Guest',
  lastPublished: null as Omit<Design, 'id' | 'votes'> | null,
  lookSerial: 1,
  paintPanel: 'front' as PanelId,
  paintTool: 'brush' as StrokeTool,
  paintColor: INK_COLORS[0]?.value ?? '#1a1c22',
  paintWidth: INK_WIDTHS[1],
  studioView: 'cloth' as StudioView,
  activeStroke: null as Stroke | null,
  selectedLayerId: null as string | null,
  activeLayerEdit: null as LayerEdit | null,
  textFace: 'display' as TextFace,
  textScale: TYPE_SIZES[1]?.scale ?? 0.12,
  typeDraft: '',
  snapshots: listSnapshots(),
  undoCount: 0,
  redoCount: 0,
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...INITIAL_EDITOR_STATE,
  setMode: ({ mode }) => {
    set({ mode })
  },
  selectMesh: ({ selectedMeshName }) => {
    set({ selectedMeshName })
  },
  setGarmentId: ({ garmentId }) => {
    const resolved = resolveGarmentId({ garmentId })

    set((state) => {
      if (state.garmentId === resolved) {
        return state
      }

      shelfCurrent({ garmentId: state.garmentId })
      const restored = restoreShelf({ garmentId: resolved })

      if (restored) {
        return syncFromStack({
          extra: {
            selectedMeshName: 'body',
            fabricId: null,
            colorId: null,
            activeStroke: null,
            activeLayerEdit: null,
            selectedLayerId: null,
            studioView: 'cloth',
          },
        })
      }

      const document = emptyDocument({ garmentId: resolved })
      commandStack = stackFromDocument({ document })
      shelfCurrent({ garmentId: resolved })

      return {
        garmentId: resolved,
        selectedMeshName: 'body',
        fabricId: null,
        colorId: null,
        overrides: [],
        document,
        activeStroke: null,
        activeLayerEdit: null,
        selectedLayerId: null,
        studioView: 'cloth',
        undoCount: 0,
        redoCount: 0,
      }
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

      return runCommand({
        command: { type: 'applyFabric', override },
        extra: {
          fabricId: preset.id,
          colorId: preset.id,
        },
      })
    })
  },
  undoLast: () => {
    set(() => {
      commandStack = undoCommand({ stack: commandStack })
      return syncFromStack({
        extra: { activeLayerEdit: null, activeStroke: null },
      })
    })
  },
  redoLast: () => {
    set(() => {
      commandStack = redoCommand({ stack: commandStack })
      return syncFromStack({
        extra: { activeLayerEdit: null, activeStroke: null },
      })
    })
  },
  canUndo: () => canUndo({ stack: commandStack }),
  canRedo: () => canRedo({ stack: commandStack }),
  loadDesign: ({ design }) => {
    const document = documentFromDesign({ design })
    commandStack = stackFromDocument({ document })
    shelfCurrent({ garmentId: resolveGarmentId({ garmentId: design.garmentId }) })
    const { snapshots } = rememberSnapshot({
      title: design.title,
      document,
      kind: 'entered',
      still: design.thumbnailDataUrl,
      lookId: design.id,
      existing: get().snapshots,
    })

    set({
      title: design.title,
      author: design.author,
      overrides: [...document.overrides],
      document,
      fabricId: null,
      colorId: null,
      selectedMeshName: 'body',
      garmentId: resolveGarmentId({ garmentId: design.garmentId }),
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
      undoCount: 0,
      redoCount: 0,
      snapshots,
    })
  },
  publishLook: ({ design }) => {
    const { snapshots } = rememberSnapshot({
      title: design.title,
      document: get().document,
      kind: 'entered',
      still: design.thumbnailDataUrl,
      existing: get().snapshots,
    })

    set({
      title: design.title,
      author: design.author,
      lookSerial: get().lookSerial + 1,
      lastPublished: {
        title: design.title,
        author: design.author,
        thumbnailDataUrl: design.thumbnailDataUrl,
        overrides: [...design.overrides],
        garmentId: resolveGarmentId({ garmentId: design.garmentId }),
        ...(design.artMap ? { artMap: design.artMap } : {}),
        ...(design.structural ? { structural: design.structural } : {}),
      },
      snapshots,
    })
  },
  reset: () => {
    garmentShelves.clear()
    const document = emptyDocument({ garmentId: 'gown' })
    commandStack = stackFromDocument({ document })
    set({
      ...INITIAL_EDITOR_STATE,
      document,
      overrides: [],
      lastPublished: null,
      selectedMeshName: 'body',
      garmentId: 'gown',
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
      snapshots: listSnapshots(),
    })
  },
  setPaintPanel: ({ paintPanel }) => {
    set({ paintPanel })
  },
  setPaintTool: ({ paintTool }) => {
    set({ paintTool })
  },
  setPaintColor: ({ paintColor }) => {
    set({ paintColor })
  },
  setPaintWidth: ({ paintWidth }) => {
    set({ paintWidth })
  },
  setStudioView: ({ studioView }) => {
    set({ studioView })
  },
  startStroke: ({ panel, point, pressure }) => {
    set((state) => ({
      activeStroke: {
        id: createObjectId({ prefix: 'ink' }),
        panel,
        points: [{ ...point, ...(pressure !== undefined ? { p: pressure } : {}) }],
        color: state.paintColor,
        width: state.paintWidth,
        tool: state.paintTool === 'eraser' ? 'eraser' : 'brush',
      },
    }))
  },
  appendStroke: ({ point, pressure }) => {
    set((state) => {
      if (!state.activeStroke) {
        return state
      }

      return {
        activeStroke: {
          ...state.activeStroke,
          points: [
            ...state.activeStroke.points,
            {
              ...point,
              ...(pressure !== undefined ? { p: pressure } : {}),
            },
          ],
        },
      }
    })
  },
  endStroke: () => {
    set((state) => {
      if (!state.activeStroke || state.activeStroke.points.length === 0) {
        return { activeStroke: null }
      }

      const next = runCommand({
        command: { type: 'addStroke', stroke: state.activeStroke },
      })

      return {
        ...next,
        activeStroke: null,
      }
    })
  },
  clearInk: () => {
    set(() =>
      runCommand({
        command: { type: 'clearPaint' },
        extra: { activeStroke: null },
      }),
    )
  },
  addGraphic: ({ src, panel }) => {
    if (!isSafeLayerSrc({ src })) {
      return
    }

    set((state) => {
      const layerId = createObjectId({ prefix: 'mark' })

      return runCommand({
        command: {
          type: 'addGraphic',
          layer: {
            id: layerId,
            kind: 'graphic',
            panel: panel ?? state.paintPanel,
            src,
            x: 0.5,
            y: 0.48,
            scale: 0.28,
            rotation: 0,
            visible: true,
          },
        },
        extra: { selectedLayerId: layerId },
      })
    })
  },
  addText: ({ content, panel, x, y, face, scale }) => {
    const trimmed = content.trim()

    if (!trimmed) {
      return
    }

    set((state) => {
      const layerId = createObjectId({ prefix: 'word' })

      return runCommand({
        command: {
          type: 'addText',
          layer: {
            id: layerId,
            kind: 'text',
            panel: panel ?? state.paintPanel,
            content: trimmed.slice(0, 32),
            face: face ?? state.textFace,
            color: state.paintColor,
            x: x ?? 0.5,
            y: y ?? 0.38,
            scale: scale ?? state.textScale,
            rotation: 0,
            visible: true,
          },
        },
        extra: { selectedLayerId: layerId, typeDraft: '' },
      })
    })
  },
  selectLayer: ({ selectedLayerId }) => {
    set({ selectedLayerId, activeLayerEdit: null })
  },
  startLayerEdit: ({ edit }) => {
    set({ selectedLayerId: edit.layerId, activeLayerEdit: edit })
  },
  moveLayerEdit: ({ edit }) => {
    set({ activeLayerEdit: edit })
  },
  endLayerEdit: () => {
    set((state) => {
      if (!state.activeLayerEdit) {
        return state
      }

      const edit = state.activeLayerEdit
      const layer = state.document.layers.find(
        (entry) => entry.id === edit.layerId,
      )

      if (
        layer &&
        (layer.kind === 'graphic' ||
          layer.kind === 'text' ||
          layer.kind === 'pattern') &&
        placeablePoseMatches({ layer, edit })
      ) {
        return {
          ...state,
          selectedLayerId: edit.layerId,
          activeLayerEdit: null,
        }
      }

      const next = runCommand({
        command: {
          type: 'updateLayer',
          layerId: edit.layerId,
          patch: {
            x: edit.x,
            y: edit.y,
            scale: edit.scale,
            rotation: edit.rotation,
          },
        },
      })

      return {
        ...next,
        selectedLayerId: edit.layerId,
        activeLayerEdit: null,
      }
    })
  },
  updateLayer: ({ layerId, patch }) => {
    set((state) => {
      const layer = state.document.layers.find((entry) => entry.id === layerId)

      if (!layer || !layerPatchChanges({ layer, patch })) {
        return state
      }

      return runCommand({
        command: { type: 'updateLayer', layerId, patch },
        extra: { selectedLayerId: layerId },
      })
    })
  },
  setTextFace: ({ textFace }) => {
    set({ textFace })
  },
  setTextScale: ({ textScale }) => {
    set({ textScale })
  },
  setTypeDraft: ({ typeDraft }) => {
    set({ typeDraft })
  },
  removeLayer: ({ layerId }) => {
    set((state) =>
      runCommand({
        command: { type: 'removeLayer', layerId },
        extra: {
          selectedLayerId:
            state.selectedLayerId === layerId ? null : state.selectedLayerId,
          activeLayerEdit: null,
        },
      }),
    )
  },
  setNeck: ({ neck }) => {
    set(() =>
      runCommand({
        command: { type: 'setStructural', structural: { neck } },
      }),
    )
  },
  setStructural: ({ structural }) => {
    set(() =>
      runCommand({
        command: { type: 'setStructural', structural },
      }),
    )
  },
  addPattern: ({ patternId, panel, x, y }) => {
    set((state) => {
      const layerId = createObjectId({ prefix: 'print' })

      return runCommand({
        command: {
          type: 'addPattern',
          layer: {
            id: layerId,
            kind: 'pattern',
            patternId,
            panel: panel ?? state.paintPanel,
            color: state.paintColor,
            x: x ?? 0.5,
            y: y ?? 0.48,
            scale: 0.46,
            rotation: 0,
            visible: true,
          },
        },
        extra: { selectedLayerId: layerId },
      })
    })
  },
  hydrateDocument: ({ document, garmentId }) => {
    const resolved = resolveGarmentId({
      garmentId: garmentId ?? document.garmentId,
    })
    commandStack = stackFromDocument({ document })
    shelfCurrent({ garmentId: resolved })
    set({
      document,
      overrides: document.overrides,
      garmentId: resolved,
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
      undoCount: 0,
      redoCount: 0,
    })
  },
  rememberMorning: ({ title }) => {
    const { snapshots } = rememberSnapshot({
      title,
      document: get().document,
      kind: 'morning',
      existing: get().snapshots,
    })
    set({ snapshots })
  },
  rememberEnteredLook: ({ title, document, still, lookId }) => {
    const { snapshots } = rememberSnapshot({
      title,
      document,
      kind: 'entered',
      still,
      lookId,
      existing: get().snapshots,
    })
    set({ snapshots })
  },
  restoreMorning: ({ snapshot }) => {
    commandStack = stackFromDocument({ document: snapshot.document })
    shelfCurrent({ garmentId: snapshot.document.garmentId })
    set(
      syncFromStack({
        extra: {
          activeStroke: null,
          activeLayerEdit: null,
          selectedLayerId: null,
        },
      }),
    )
  },
}))
