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
} from './design-commands'
import {
  createEmptyDocument,
  createObjectId,
  documentFromDesign,
  type DesignDocument,
  type NeckId,
  type PanelId,
  type Stroke,
  type StrokePoint,
  type StrokeTool,
} from './design-document'
import type { Design, GarmentId, MaterialOverride } from './design-schema'
import { resolveGarmentId } from './design-schema'
import { rememberSnapshot, type DesignSnapshot } from './design-snapshots'
import { getFabricById } from './fabrics'
import { isSafeLayerSrc } from './look-thumbnail'
import { INK_COLORS, INK_WIDTHS } from './paint-colors'

export type EditorMode = 'design' | 'atelier'
export type StudioView = 'draw' | 'cloth'

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
  paintTool: StrokeTool
  paintColor: string
  paintWidth: number
  studioView: StudioView
  activeStroke: Stroke | null
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
  setPaintTool: ({ paintTool }: { paintTool: StrokeTool }) => void
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
  appendStroke: ({ point }: { point: StrokePoint }) => void
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
  }: {
    content: string
    panel?: PanelId
  }) => void
  setNeck: ({ neck }: { neck: NeckId }) => void
  hydrateDocument: ({
    document,
    garmentId,
  }: {
    document: DesignDocument
    garmentId?: GarmentId
  }) => void
  rememberMorning: ({ title }: { title: string }) => void
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
  studioView: 'draw' as StudioView,
  activeStroke: null as Stroke | null,
  snapshots: [] as DesignSnapshot[],
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
            studioView: 'draw',
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
        studioView: 'draw',
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
      return syncFromStack()
    })
  },
  redoLast: () => {
    set(() => {
      commandStack = redoCommand({ stack: commandStack })
      return syncFromStack()
    })
  },
  canUndo: () => canUndo({ stack: commandStack }),
  canRedo: () => canRedo({ stack: commandStack }),
  loadDesign: ({ design }) => {
    const document = documentFromDesign({ design })
    commandStack = stackFromDocument({ document })
    shelfCurrent({ garmentId: resolveGarmentId({ garmentId: design.garmentId }) })

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
      undoCount: 0,
      redoCount: 0,
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
        ...(design.artMap ? { artMap: design.artMap } : {}),
        ...(design.structural ? { structural: design.structural } : {}),
      },
    }))
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
      snapshots: [],
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
        tool: state.paintTool,
      },
    }))
  },
  appendStroke: ({ point }) => {
    set((state) => {
      if (!state.activeStroke) {
        return state
      }

      return {
        activeStroke: {
          ...state.activeStroke,
          points: [...state.activeStroke.points, point],
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

    set((state) =>
      runCommand({
        command: {
          type: 'addGraphic',
          layer: {
            id: createObjectId({ prefix: 'mark' }),
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
      }),
    )
  },
  addText: ({ content, panel }) => {
    const trimmed = content.trim()

    if (!trimmed) {
      return
    }

    set((state) =>
      runCommand({
        command: {
          type: 'addText',
          layer: {
            id: createObjectId({ prefix: 'word' }),
            kind: 'text',
            panel: panel ?? state.paintPanel,
            content: trimmed.slice(0, 32),
            face: 'display',
            color: state.paintColor,
            x: 0.5,
            y: 0.38,
            scale: 0.1,
            rotation: 0,
            visible: true,
          },
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
      undoCount: 0,
      redoCount: 0,
    })
  },
  rememberMorning: ({ title }) => {
    const snapshot = rememberSnapshot({
      title,
      document: get().document,
    })
    set((state) => ({ snapshots: [snapshot, ...state.snapshots].slice(0, 8) }))
  },
  restoreMorning: ({ snapshot }) => {
    commandStack = stackFromDocument({ document: snapshot.document })
    shelfCurrent({ garmentId: snapshot.document.garmentId })
    set(
      syncFromStack({
        extra: {
          activeStroke: null,
        },
      }),
    )
  },
}))
