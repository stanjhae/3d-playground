import { create } from 'zustand'

import { DEFAULT_AVATAR_MEASUREMENTS } from './avatars'
import type { AvatarMeasurements } from './avatar-geometry'
import { garmentPanels } from './garments'
import {
  applyCommand,
  canRedo,
  canUndo,
  createCommandStack,
  editsLockedLayer,
  redoCommand,
  undoCommand,
  type CommandStack,
  type DesignCommand,
  type LayerPatch,
} from './design-commands'
import { type CreateStepId, forcesClothView } from './create-steps'
import {
  cloneDocument,
  createEmptyDocument,
  createObjectId,
  documentFromDesign,
  isLockedLayer,
  oppositePanel,
  type DesignDocument,
  type DesignLayer,
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
  placementScale,
} from './layer-hit'
import { isCanonicalGarment } from './concept-flags'
import { panelSurface, resolveTemplate, templateForGarment } from './template-manifest'
import type {
  Design,
  DesignMethod,
  GarmentId,
  MaterialOverride,
} from './design-schema'
import { resolveGarmentId } from './design-schema'
import type { StudioEnvMode } from './landing-demo'
import {
  listSnapshots,
  rememberSnapshot,
  type DesignSnapshot,
} from './design-snapshots'
import { getFabricById } from './fabrics'
import { isSafeLayerSrc } from './look-thumbnail'
import { INK_COLORS, INK_WIDTHS, TYPE_SIZES } from './paint-colors'
import {
  type TeeEngine,
  basePatternCommand,
  createTeeEngine,
  limitMessage,
  loadTeeEngine,
  documentNotice,
  redoTee,
  runTeeCommand,
  runTranslated,
  strokeLayerId,
  strokeRefusal,
  teeRenderDocument,
  undoTee,
} from './editor-canonical'
import type { ImportNote } from './legacy-import'
import { type CanonicalDocument, CANONICAL_LIMITS } from './canonical-document'
import { findLayer, replaceDocument, replaceDocumentUndoable } from './canonical-commands'
import { upgradeToCurrentTemplate } from './template-upgrade'
import { canonicalPanel, renderPanel } from './render-projection'
import { NUDGE_MERGE_MS } from './studio-keys'
import { roundPlacement } from './transform-fields'

export type EditorMode = 'design' | 'atelier'

export type CloudContext = {
  designId: string
  headSeq: number
  title: string
  description?: string
}
export type StudioView = 'draw' | 'cloth'
export type EditorPaintTool = StrokeTool | 'type'
export type CreateStep = CreateStepId
/** The Design step's tools. Each shows its own panel; none changes the design. */
export const DESIGN_TOOLS = ['draw', 'text', 'graphics', 'upload'] as const

export type DesignTool = (typeof DESIGN_TOOLS)[number]
export type CameraPreset = 'front' | 'threeQuarter' | 'back' | 'left' | 'right' | 'orbit'
export type AngleCameraPreset = Exclude<CameraPreset, 'orbit'>
export type BasePatternId = 'solid' | 'stripe' | 'check' | 'gradient'

export type { AvatarMeasurements } from './avatar-geometry'

export const BASE_FINISH_PRESETS = [
  { id: 'matte', label: 'Matte', fabricId: 'cotton' },
  { id: 'silk', label: 'Silk', fabricId: 'silk' },
  { id: 'wool', label: 'Wool', fabricId: 'wool' },
  { id: 'denim', label: 'Denim', fabricId: 'denim' },
  { id: 'leather', label: 'Leather', fabricId: 'leather' },
] as const

export type BaseFinishId = (typeof BASE_FINISH_PRESETS)[number]['id'] | string

type EditorState = {
  mode: EditorMode
  selectedMeshName: string | null
  fabricId: string | null
  colorId: string | null
  garmentId: GarmentId
  overrides: MaterialOverride[]
  document: DesignDocument
  /** Canonical content revision; 2D, 3D and saving key on it (E01 #152). */
  revision: number
  /** What the last load changed or left out (legacy import, #141). */
  importNotes: ImportNote[]
  /** A refused command or an over-limit document, in words (#162). */
  limitNotice: string | null
  /** The owned cloud design open in the studio, if any (A05 #149). */
  cloud: CloudContext | null
  /** Bumped by every `loadCanonical`, so autosave restarts on a reload. */
  cloudLoad: number
  title: string
  author: string
  lastPublished: Omit<Design, 'id' | 'votes'> | null
  lookSerial: number
  paintPanel: PanelId
  paintTool: EditorPaintTool
  paintColor: string
  paintWidth: number
  paintOpacity: number
  paintHardness: number
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
  createStep: CreateStep
  designTool: DesignTool
  // Draw tool held for turning the garment instead of inking it.
  rotateView: boolean
  /** A side picked from its tab, lit on the 3D garment for a moment. */
  panelFlash: PanelId | null
  publishTags: string[]
  publishMethod: DesignMethod | null
  challengeId: string | null
  avatarId: string | null
  avatarMeasurements: AvatarMeasurements
  cameraPreset: CameraPreset
  capturingAngles: boolean
  studioEnv: StudioEnvMode
  basePatternId: BasePatternId
  baseFinishId: BaseFinishId
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
  applyBaseColor: ({ color }: { color: string }) => void
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
  setPaintOpacity: ({ paintOpacity }: { paintOpacity: number }) => void
  setPaintHardness: ({ paintHardness }: { paintHardness: number }) => void
  setStudioView: ({ studioView }: { studioView: StudioView }) => void
  setCreateStep: ({ createStep }: { createStep: CreateStep }) => void
  setDesignTool: ({ designTool }: { designTool: DesignTool }) => void
  setRotateView: ({ rotateView }: { rotateView: boolean }) => void
  flashPanel: ({ panel }: { panel: PanelId }) => void
  setPublishTags: ({ tags }: { tags: string[] }) => void
  setPublishMethod: ({
    method,
  }: {
    method: DesignMethod | null
  }) => void
  setChallengeId: ({ challengeId }: { challengeId: string | null }) => void
  setAvatarId: ({ avatarId }: { avatarId: string | null }) => void
  setAvatarMeasurements: ({
    measurements,
  }: {
    measurements: Partial<AvatarMeasurements>
  }) => void
  resetAvatarMeasurements: () => void
  setCameraPreset: ({ cameraPreset }: { cameraPreset: CameraPreset }) => void
  setCapturingAngles: ({
    capturingAngles,
  }: {
    capturingAngles: boolean
  }) => void
  setStudioEnv: ({ studioEnv }: { studioEnv: StudioEnvMode }) => void
  setBasePattern: ({ patternId }: { patternId: BasePatternId }) => void
  setBaseFinish: ({ finishId }: { finishId: BaseFinishId }) => void
  copyLayerToOpposite: ({ layerId }: { layerId: string }) => void
  duplicateLayer: ({ layerId }: { layerId: string }) => void
  /** Remembers the selected mark or word for `pasteLayer`, this session only. */
  copyLayer: ({ layerId }: { layerId: string }) => void
  /** Adds the copied mark or word to the panel being worked on. */
  pasteLayer: () => void
  /** Drops the stroke being drawn, whatever drew it (Esc). */
  discardStroke: () => void
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
  /** A touch that was cancelled is dropped; a pen or mouse keeps its drawing. */
  cancelStroke: ({ pointerType }: { pointerType: string }) => void
  /** Clears the ink on one panel (default: the panel being drawn on). */
  clearInk: ({ panel }?: { panel?: PanelId }) => void
  addGraphic: ({
    src,
    panel,
    x,
    y,
  }: {
    src: string
    panel?: PanelId
    /** Where it was dropped; a tapped tile lands mid-panel. */
    x?: number
    y?: number
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
  /**
   * Arrow-key nudge of a placeable layer (#163). Nudges of one layer in
   * quick succession merge into one undo step.
   */
  nudgeLayer: ({
    layerId,
    dx,
    dy,
    now,
  }: {
    layerId: string
    dx: number
    dy: number
    now?: number
  }) => void
  /**
   * Move a layer one place up (towards the top) or down its panel (#157), or
   * all the way to the front (top) or back (A5).
   */
  moveLayer: ({
    layerId,
    direction,
  }: {
    layerId: string
    direction: 'up' | 'down' | 'front' | 'back'
  }) => void
  /** Put a layer at `toIndex` in its panel's stack (0 is the bottom), as one undo step (A5). */
  moveLayerTo: ({ layerId, toIndex }: { layerId: string; toIndex: number }) => void
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
  /** Open a canonical v2 document from the cloud; resets undo. */
  loadCanonical: ({
    document,
    cloud,
  }: {
    document: CanonicalDocument
    cloud: CloudContext
  }) => void
  /** Record a cloud acknowledgement (autosave, S04 #173). */
  setCloudHead: ({ headSeq }: { headSeq: number }) => void
  /** Show a rename of the open cloud design (A06 #150); not an edit. */
  setCloudTitle: ({ title }: { title: string }) => void
  setCloudDescription: ({ description }: { description: string }) => void
  /** Put recovered local work over the open cloud design as a new revision (S05 #174). */
  recoverCanonical: ({ document }: { document: CanonicalDocument }) => void
  /** Moves the open design onto its garment's newest template, as one undo step. */
  upgradeTemplate: () => boolean
  /** Place an uploaded, ready asset (S01 #170); `src` is what the renderer draws. */
  addUploadedImage: ({
    assetId,
    aspect,
    src,
    panel,
  }: {
    assetId: string
    aspect: number
    src: string
    panel?: PanelId
  }) => void
  /** Teach the renderer how to draw asset ids (uploads resolved after load). */
  registerAssetSources: ({ sources }: { sources: Record<string, string> }) => void
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
  document: emptyDocument({ garmentId: 'tee' }),
})

const garmentShelves = new Map<GarmentId, CommandStack>()

/**
 * Garments with a template (the tee, template-built forms) run on the
 * canonical v2 engine; concept garments keep the legacy v1 stack above.
 * `activeGarment` says which one is live; `tee` is the live canonical
 * engine, and `canonicalShelves` keeps the others while one is away.
 */
let tee: TeeEngine = createTeeEngine()
let activeGarment: GarmentId = 'tee'
const canonicalShelves = new Map<GarmentId, TeeEngine>()

function teeActive() {
  return isCanonicalGarment({ garmentId: activeGarment })
}

/** The engine a canonical garment resumes with: its shelf, else a fresh one. */
function canonicalEngineFor({ garmentId }: { garmentId: GarmentId }) {
  return (
    canonicalShelves.get(garmentId) ??
    createTeeEngine({
      revision: tee.stack.revision + 1,
      templateId: templateForGarment({ garmentId })?.id,
    })
  )
}

/** Point the live engine at a document; returns import notes for the tee. */
function loadEngine({
  document,
  garmentId,
}: {
  document: DesignDocument
  garmentId: GarmentId
}): { importNotes: ImportNote[]; limitNotice: string | null } {
  activeGarment = garmentId

  // Only tee v1 documents convert in full. A look on another template (a
  // board remix) keeps its cloth colour; its marks and art don't carry over.
  if (isCanonicalGarment({ garmentId }) && garmentId !== 'tee') {
    const fresh = createTeeEngine({
      revision: tee.stack.revision + 1,
      templateId: templateForGarment({ garmentId })?.id,
    })
    const color = document.overrides.find((override) => override.meshName === 'body')?.color
    const dropped = document.layers.some((layer) => layer.kind !== 'paint' || layer.strokes.length > 0)
    tee = /^#[0-9a-f]{6}$/i.test(color ?? '')
      ? {
          ...fresh,
          stack: replaceDocument({
            stack: fresh.stack,
            document: { ...fresh.stack.document, base: { kind: 'solid', color: color as `#${string}` } },
          }),
        }
      : fresh
    return {
      importNotes: dropped
        ? [{ path: '$', message: 'This look opened with its cloth colour; its marks and art stay on the original.' }]
        : [],
      limitNotice: null,
    }
  }

  if (garmentId === 'tee') {
    const loaded = loadTeeEngine({ engine: tee, document })
    tee = loaded.engine
    return { importNotes: loaded.notes, limitNotice: loaded.limitNotice ?? null }
  }

  commandStack = stackFromDocument({ document })
  shelfCurrent({ garmentId })
  return { importNotes: [], limitNotice: null }
}

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

const TEE_BASE_PATTERN: Record<CanonicalDocument['base']['kind'], BasePatternId> = {
  solid: 'solid',
  stripes: 'stripe',
  check: 'check',
}

function syncFromStack({
  extra,
}: {
  extra?: Partial<EditorState>
} = {}) {
  if (teeActive()) {
    const document = teeRenderDocument({ engine: tee })

    return {
      document,
      overrides: document.overrides,
      garmentId: activeGarment,
      revision: tee.stack.revision,
      undoCount: tee.stack.past.length,
      redoCount: tee.stack.future.length,
      limitNotice: documentNotice({ document: tee.stack.document }),
      // The picker follows the document, so undo and reopening keep it true.
      basePatternId: TEE_BASE_PATTERN[tee.stack.document.base.kind],
      ...extra,
    }
  }

  const document = commandStack.document

  return {
    document,
    overrides: document.overrides,
    garmentId: document.garmentId,
    undoCount: commandStack.past.length,
    redoCount: commandStack.future.length,
    limitNotice: null,
    ...extra,
  }
}

type PlaceableLayer = Extract<DesignLayer, { kind: 'graphic' | 'text' | 'pattern' }>

/** What ⌘C copied: a snapshot, so later edits to the original don't follow. */
let clipboardLayer: PlaceableLayer | null = null

export function hasCopiedLayer() {
  return clipboardLayer !== null
}

/** A duplicate or paste lands this share of the panel away, down and right. */
export const COPY_OFFSET = 0.03

/** How long a side picked from its tab stays lit on the 3D garment. */
const PANEL_FLASH_MS = 900
let panelFlashTimer = 0

function placeableLayer({ document, layerId }: { document: DesignDocument; layerId: string }) {
  const layer = document.layers.find((entry) => entry.id === layerId)
  return layer && (layer.kind === 'graphic' || layer.kind === 'text' || layer.kind === 'pattern') ? layer : null
}

/** Steps a copy aside so it doesn't hide its original, away from an edge. */
function offsetCopy({ layer }: { layer: PlaceableLayer }): PlaceableLayer {
  const step = ({ value, by }: { value: number; by: number }) =>
    value + by > 1 - COPY_OFFSET || value + by < COPY_OFFSET ? value - by : value + by

  // Panel y runs bottom-up, so down is a smaller y.
  return { ...layer, x: step({ value: layer.x, by: COPY_OFFSET }), y: step({ value: layer.y, by: -COPY_OFFSET }) }
}

/** A copy is a new item to place, so it starts unlocked (W3). */
function unlocked<T extends PlaceableLayer>({ layer }: { layer: T }): T {
  if (layer.kind === 'pattern' || !layer.locked) {
    return layer
  }

  const { locked: _locked, ...rest } = layer
  return rest as T
}

function addCopy({ layer }: { layer: PlaceableLayer }) {
  const id = createObjectId({
    prefix: layer.kind === 'text' ? 'word' : layer.kind === 'pattern' ? 'print' : 'mark',
  })
  const copy = { ...unlocked({ layer }), id }
  const command =
    copy.kind === 'graphic'
      ? { type: 'addGraphic' as const, layer: copy }
      : copy.kind === 'text'
        ? { type: 'addText' as const, layer: copy }
        : { type: 'addPattern' as const, layer: copy }

  return runCommand({ command, extra: { selectedLayerId: id } })
}

function runCommand({
  command,
  extra,
}: {
  command: DesignCommand
  extra?: Partial<EditorState>
}) {
  // A locked item takes no change but being unlocked (W3); the canonical
  // and v1 command layers refuse too, so no path gets round this.
  if (editsLockedLayer({ document: teeActive() ? teeRenderDocument({ engine: tee }) : commandStack.document, command })) {
    return syncFromStack()
  }

  if (teeActive()) {
    const step = runTranslated({ engine: tee, command })
    tee = step.engine
    // A refused command changes nothing else the caller meant to set.
    return syncFromStack({ extra: step.refusal ? { limitNotice: step.refusal } : extra })
  }

  commandStack = applyCommand({ stack: commandStack, command })
  return syncFromStack({ extra })
}

function finishPreset({ finishId }: { finishId: BaseFinishId }) {
  const entry = BASE_FINISH_PRESETS.find((finish) => finish.id === finishId)
  return getFabricById({ id: entry?.fabricId ?? finishId })
}

function layerPatchChanges({
  layer,
  patch,
}: {
  layer: DesignDocument['layers'][number]
  patch: LayerPatch
}) {
  if (layer.kind === 'paint') {
    return (
      (patch.visible !== undefined && patch.visible !== layer.visible) ||
      (patch.locked !== undefined && patch.locked !== Boolean(layer.locked))
    )
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

  if (patch.opacity !== undefined && patch.opacity !== layer.opacity) {
    return true
  }

  if (patch.visible !== undefined && patch.visible !== layer.visible) {
    return true
  }

  if (layer.kind === 'graphic') {
    if (patch.color !== undefined && patch.color !== layer.color) {
      return true
    }
  }

  if (layer.kind === 'text' || layer.kind === 'pattern') {
    if (patch.color !== undefined && patch.color !== layer.color) {
      return true
    }
  }

  if (layer.kind === 'graphic' || layer.kind === 'text') {
    for (const flag of ['flipX', 'flipY', 'locked'] as const) {
      if (patch[flag] !== undefined && patch[flag] !== Boolean(layer[flag])) {
        return true
      }
    }
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
  garmentId: 'tee' as GarmentId,
  overrides: [] as MaterialOverride[],
  document: teeRenderDocument({ engine: tee }),
  revision: 0,
  importNotes: [] as ImportNote[],
  limitNotice: null as string | null,
  cloud: null as CloudContext | null,
  cloudLoad: 0,
  title: '',
  author: 'Guest',
  lastPublished: null as Omit<Design, 'id' | 'votes'> | null,
  lookSerial: 1,
  paintPanel: 'front' as PanelId,
  paintTool: 'brush' as StrokeTool,
  paintColor: INK_COLORS[0]?.value ?? '#1a1c22',
  paintWidth: INK_WIDTHS[1],
  paintOpacity: 1,
  paintHardness: 0.7,
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
  createStep: 'select' as CreateStep,
  designTool: 'draw' as DesignTool,
  rotateView: false,
  panelFlash: null as PanelId | null,
  publishTags: [] as string[],
  publishMethod: null as DesignMethod | null,
  challengeId: null as string | null,
  avatarId: null as string | null,
  avatarMeasurements: {
    height: DEFAULT_AVATAR_MEASUREMENTS.height,
    chest: DEFAULT_AVATAR_MEASUREMENTS.chest,
    waist: DEFAULT_AVATAR_MEASUREMENTS.waist,
  },
  cameraPreset: 'threeQuarter' as CameraPreset,
  capturingAngles: false,
  studioEnv: 'studio' as StudioEnvMode,
  basePatternId: 'solid' as BasePatternId,
  baseFinishId: 'matte' as BaseFinishId,
}

/** The tee's canonical v2 document, for cloud saving (S04 #173). */
export function getCanonicalDocument(): CanonicalDocument {
  return tee.stack.document
}

/**
 * Where a layer sits in its panel's stack: index 0 is the bottom. Only the
 * tee's canonical layers can be reordered; null for anything else.
 */
export function layerPlacement({
  layerId,
}: {
  layerId: string
}): { panel: PanelId; index: number; count: number } | null {
  if (!teeActive()) {
    return null
  }

  const found = findLayer({ document: tee.stack.document, layerId })

  if (!found) {
    return null
  }

  return {
    panel: renderPanel({ panel: found.panel, template: tee.stack.document.template }),
    index: found.index,
    count: tee.stack.document.panels[found.panel].layers.length,
  }
}

/** The last nudge, so the next one of the same layer can merge into it. */
let lastNudge: { layerId: string; at: number; marker: unknown } | null = null

function historyMarker() {
  return teeActive() ? tee.stack : commandStack
}

/** Asset id → drawable source for the tee engine (uploads, S01 #170). */
/**
 * Where the live stroke will land: a paint layer id on the tee (null when
 * it cannot be added), undefined for concept garments, which draw it on top.
 */
export function liveStrokeLayerId({ stroke }: { stroke: Stroke | null }): string | null | undefined {
  if (!stroke || !teeActive()) {
    return undefined
  }

  return strokeLayerId({ engine: tee, stroke })
}

export function getAssetSources(): Readonly<Record<string, string>> {
  return tee.assetSources
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
      // A cloud design is pinned to its template; it never switches garment.
      if (state.garmentId === resolved || state.cloud) {
        return state
      }

      if (teeActive()) {
        canonicalShelves.set(activeGarment, tee)
      } else {
        shelfCurrent({ garmentId: state.garmentId })
      }

      activeGarment = resolved

      if (isCanonicalGarment({ garmentId: resolved })) {
        tee = canonicalEngineFor({ garmentId: resolved })
      }

      const restored = isCanonicalGarment({ garmentId: resolved }) ? tee : restoreShelf({ garmentId: resolved })

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
  applyBaseColor: ({ color }) => {
    set((state) => {
      const meshName = state.selectedMeshName ?? 'body'
      const finish = finishPreset({ finishId: state.baseFinishId })
      const override: MaterialOverride = {
        meshName,
        color,
        roughness: finish?.roughness ?? 0.86,
        metalness: finish?.metalness ?? 0,
        ...(finish?.mapId ? { mapId: finish.mapId } : {}),
      }

      return runCommand({
        command: { type: 'applyFabric', override },
        extra: {
          fabricId: finish?.id ?? state.fabricId,
          colorId: finish?.id ?? color,
        },
      })
    })
  },
  undoLast: () => {
    set(() => {
      if (teeActive()) {
        tee = undoTee({ engine: tee })
      } else {
        commandStack = undoCommand({ stack: commandStack })
      }
      return syncFromStack({
        extra: { activeLayerEdit: null, activeStroke: null },
      })
    })
  },
  redoLast: () => {
    set(() => {
      if (teeActive()) {
        tee = redoTee({ engine: tee })
      } else {
        commandStack = redoCommand({ stack: commandStack })
      }
      return syncFromStack({
        extra: { activeLayerEdit: null, activeStroke: null },
      })
    })
  },
  canUndo: () =>
    teeActive() ? tee.stack.past.length > 0 : canUndo({ stack: commandStack }),
  canRedo: () =>
    teeActive() ? tee.stack.future.length > 0 : canRedo({ stack: commandStack }),
  loadDesign: ({ design }) => {
    const document = documentFromDesign({ design })
    const garmentId = resolveGarmentId({ garmentId: design.garmentId })
    const loaded = loadEngine({ document, garmentId })
    const { snapshots } = rememberSnapshot({
      title: design.title,
      document,
      kind: 'entered',
      still: design.thumbnailDataUrl,
      lookId: design.id,
      existing: get().snapshots,
    })

    set({
      ...syncFromStack(),
      ...loaded,
      cloud: null,
      title: design.title,
      author: design.author,
      fabricId: null,
      colorId: null,
      selectedMeshName: 'body',
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
      undoCount: 0,
      redoCount: 0,
      snapshots,
      publishTags: design.tags ? [...design.tags] : [],
      publishMethod: design.method ?? null,
      challengeId: design.challengeId ?? null,
      avatarId: design.avatarId ?? null,
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
        ...(design.document ? { document: design.document } : {}),
        ...(design.tags && design.tags.length > 0
          ? { tags: [...design.tags] }
          : {}),
        ...(design.method ? { method: design.method } : {}),
        ...(design.challengeId ? { challengeId: design.challengeId } : {}),
        ...(design.createdAt ? { createdAt: design.createdAt } : {}),
        ...(design.avatarId ? { avatarId: design.avatarId } : {}),
        ...(design.angleStills && design.angleStills.length > 0
          ? { angleStills: [...design.angleStills] }
          : {}),
      },
      snapshots,
    })
  },
  reset: () => {
    garmentShelves.clear()
    canonicalShelves.clear()
    tee = createTeeEngine({ revision: tee.stack.revision + 1 })
    activeGarment = 'tee'
    commandStack = stackFromDocument({ document: emptyDocument({ garmentId: 'tee' }) })
    set({
      ...INITIAL_EDITOR_STATE,
      ...syncFromStack(),
      lastPublished: null,
      selectedMeshName: 'body',
      garmentId: 'tee',
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
      snapshots: listSnapshots(),
      avatarMeasurements: {
        height: DEFAULT_AVATAR_MEASUREMENTS.height,
        chest: DEFAULT_AVATAR_MEASUREMENTS.chest,
        waist: DEFAULT_AVATAR_MEASUREMENTS.waist,
      },
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
    set({ paintWidth: Math.min(1, Math.max(0.004, paintWidth)) })
  },
  setPaintOpacity: ({ paintOpacity }) => {
    set({ paintOpacity: Math.min(1, Math.max(0, paintOpacity)) })
  },
  setPaintHardness: ({ paintHardness }) => {
    set({ paintHardness: Math.min(1, Math.max(0, paintHardness)) })
  },
  setStudioView: ({ studioView }) => {
    set({ studioView })
  },
  setCreateStep: ({ createStep }) => {
    set(() => {
      return {
        createStep,
        rotateView: false,
        ...(forcesClothView({ step: createStep }) ? { studioView: 'cloth' as const } : {}),
      }
    })
  },
  setDesignTool: ({ designTool }) => {
    // Which panel shows, and what a press on the cloth does: leaving Text
    // drops tap-to-place so the next press never strands a word, and any
    // switch lets go of the Rotate-view hold.
    set((state) => ({
      designTool,
      rotateView: false,
      ...(designTool !== 'text' && state.paintTool === 'type' ? { paintTool: 'brush' as StrokeTool } : {}),
    }))
  },
  setRotateView: ({ rotateView }) => {
    set({ rotateView })
  },
  flashPanel: ({ panel }) => {
    set({ panelFlash: panel })
    window.clearTimeout(panelFlashTimer)
    panelFlashTimer = window.setTimeout(() => {
      set((state) => (state.panelFlash === panel ? { panelFlash: null } : state))
    }, PANEL_FLASH_MS)
  },
  setPublishTags: ({ tags }) => {
    set({
      publishTags: tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
    })
  },
  setPublishMethod: ({ method }) => {
    set({ publishMethod: method })
  },
  setChallengeId: ({ challengeId }) => {
    set({ challengeId })
  },
  setAvatarId: ({ avatarId }) => {
    set({ avatarId })
  },
  setAvatarMeasurements: ({ measurements }) => {
    set((state) => ({
      avatarMeasurements: {
        height: measurements.height ?? state.avatarMeasurements.height,
        chest: measurements.chest ?? state.avatarMeasurements.chest,
        waist: measurements.waist ?? state.avatarMeasurements.waist,
        hip: measurements.hip ?? state.avatarMeasurements.hip,
        build: measurements.build ?? state.avatarMeasurements.build,
      },
    }))
  },
  resetAvatarMeasurements: () => {
    set({
      avatarMeasurements: {
        height: DEFAULT_AVATAR_MEASUREMENTS.height,
        chest: DEFAULT_AVATAR_MEASUREMENTS.chest,
        waist: DEFAULT_AVATAR_MEASUREMENTS.waist,
      },
    })
  },
  setCameraPreset: ({ cameraPreset }) => {
    set({ cameraPreset })
  },
  setCapturingAngles: ({ capturingAngles }) => {
    set({ capturingAngles })
  },
  setStudioEnv: ({ studioEnv }) => {
    set({ studioEnv })
  },
  setBasePattern: ({ patternId }) => {
    set((state) => {
      if (teeActive()) {
        const command = basePatternCommand({
          engine: tee,
          patternId,
          fillColor: state.paintColor,
        })

        if (!command) {
          return state
        }

        const step = runTeeCommand({ engine: tee, command })

        if (step.refusal) {
          return syncFromStack({ extra: { limitNotice: step.refusal } })
        }

        tee = step.engine
        return syncFromStack({
          extra: {
            basePatternId: patternId,
            selectedLayerId: state.selectedLayerId?.startsWith('base-fill')
              ? null
              : state.selectedLayerId,
          },
        })
      }

      const before = cloneDocument({ document: state.document })
      const next = cloneDocument({ document: state.document })
      next.layers = next.layers.filter(
        (layer) =>
          layer.id !== 'base-fill' && !layer.id.startsWith('base-fill-'),
      )

      let selectedLayerId: string | null = state.selectedLayerId
      const panels = garmentPanels({ garmentId: state.garmentId })
      const panelIds =
        panels.length > 0
          ? panels.map((panel) => panel.id)
          : ([state.paintPanel] as PanelId[])

      if (patternId !== 'solid') {
        for (const panel of panelIds) {
          const layerId = `base-fill-${panel}`
          next.layers.push({
            id: layerId,
            kind: 'pattern',
            patternId,
            panel,
            color: state.paintColor,
            x: 0.5,
            y: 0.5,
            scale: 1.05,
            rotation: 0,
            opacity: patternId === 'gradient' ? 0.85 : 1,
            visible: true,
          })
        }
        selectedLayerId = `base-fill-${state.paintPanel}`
      } else if (
        selectedLayerId === 'base-fill' ||
        selectedLayerId?.startsWith('base-fill-')
      ) {
        selectedLayerId = null
      }

      commandStack = {
        document: next,
        past: [...commandStack.past, before],
        future: [],
      }

      return {
        ...syncFromStack({
          extra: {
            basePatternId: patternId,
            selectedLayerId,
          },
        }),
      }
    })
  },
  setBaseFinish: ({ finishId }) => {
    set((state) => {
      const finish = finishPreset({ finishId })
      const meshName = state.selectedMeshName ?? 'body'

      if (!finish) {
        return { baseFinishId: finishId }
      }

      const currentColor =
        state.overrides.find((entry) => entry.meshName === meshName)?.color ??
        finish.color

      const override: MaterialOverride = {
        meshName,
        color: currentColor,
        roughness: finish.roughness,
        metalness: finish.metalness,
        ...(finish.mapId ? { mapId: finish.mapId } : {}),
      }

      return runCommand({
        command: { type: 'applyFabric', override },
        extra: {
          fabricId: finish.id,
          colorId: finish.id,
          baseFinishId: finishId,
        },
      })
    })
  },
  copyLayerToOpposite: ({ layerId }) => {
    set((state) => {
      const layer = state.document.layers.find((entry) => entry.id === layerId)

      if (
        !layer ||
        (layer.kind !== 'graphic' &&
          layer.kind !== 'text' &&
          layer.kind !== 'pattern')
      ) {
        return state
      }

      const panel = oppositePanel({ panel: layer.panel })
      const nextId = createObjectId({
        prefix:
          layer.kind === 'text'
            ? 'word'
            : layer.kind === 'pattern'
              ? 'print'
              : 'mark',
      })

      if (layer.kind === 'graphic') {
        return runCommand({
          command: {
            type: 'addGraphic',
            layer: { ...unlocked({ layer }), id: nextId, panel },
          },
          extra: { selectedLayerId: nextId },
        })
      }

      if (layer.kind === 'text') {
        return runCommand({
          command: {
            type: 'addText',
            layer: { ...unlocked({ layer }), id: nextId, panel },
          },
          extra: { selectedLayerId: nextId },
        })
      }

      return runCommand({
        command: {
          type: 'addPattern',
          layer: { ...layer, id: nextId, panel },
        },
        extra: { selectedLayerId: nextId },
      })
    })
  },
  duplicateLayer: ({ layerId }) => {
    set((state) => {
      const layer = placeableLayer({ document: state.document, layerId })
      return layer ? addCopy({ layer: offsetCopy({ layer }) }) : state
    })
  },
  copyLayer: ({ layerId }) => {
    const layer = placeableLayer({ document: get().document, layerId })

    if (layer) {
      clipboardLayer = layer
    }
  },
  pasteLayer: () => {
    set((state) => {
      if (!clipboardLayer) {
        return state
      }

      // On its own panel a paste steps aside, as a duplicate does, and the
      // next paste steps from there. On another panel it keeps its place.
      const layer =
        clipboardLayer.panel === state.paintPanel
          ? offsetCopy({ layer: clipboardLayer })
          : { ...clipboardLayer, panel: state.paintPanel }
      const next = addCopy({ layer })

      if (next.selectedLayerId !== state.selectedLayerId) {
        clipboardLayer = layer
      }

      return next
    })
  },
  discardStroke: () => {
    set({ activeStroke: null })
  },
  startStroke: ({ panel, point, pressure }) => {
    set((state) => {
      const tool: StrokeTool =
        state.paintTool === 'fill'
          ? 'fill'
          : state.paintTool === 'eraser'
            ? 'eraser'
            : 'brush'
      const base = state.paintColor.replace('#', '').slice(0, 6)
      const alpha = Math.round(state.paintOpacity * 255)
        .toString(16)
        .padStart(2, '0')
      const hardnessPressure =
        pressure !== undefined
          ? pressure * (0.35 + state.paintHardness * 0.65)
          : 0.35 + state.paintHardness * 0.65
      const color =
        state.paintOpacity >= 0.999 ? `#${base}` : `#${base}${alpha}`
      const stroke: Stroke = {
        id: createObjectId({ prefix: 'ink' }),
        panel,
        points: [{ ...point, p: hardnessPressure }],
        color,
        width: state.paintWidth,
        tool,
      }
      // Refused as the pen goes down, so ink never appears and then vanishes.
      const refused = teeActive() ? strokeRefusal({ engine: tee, stroke }) : null

      if (refused) {
        return { activeStroke: null, limitNotice: refused }
      }

      return { activeStroke: stroke }
    })
  },
  appendStroke: ({ point, pressure }) => {
    set((state) => {
      if (!state.activeStroke) {
        return state
      }

      // A v2 stroke holds at most `pointsPerStroke` points; past that the
      // pen stops inking until it lifts, instead of losing the stroke (#162).
      const max = CANONICAL_LIMITS.pointsPerStroke

      if (teeActive() && state.activeStroke.points.length >= max) {
        return state.limitNotice
          ? state
          : {
              limitNotice: limitMessage({
                counter: {
                  kind: 'points',
                  panel: canonicalPanel({ renderPanel: state.activeStroke.panel, template: tee.stack.document.template }),
                  used: state.activeStroke.points.length,
                  max,
                },
              }),
            }
      }

      const hardnessPressure =
        pressure !== undefined
          ? pressure * (0.35 + state.paintHardness * 0.65)
          : 0.35 + state.paintHardness * 0.65

      return {
        activeStroke: {
          ...state.activeStroke,
          points: [
            ...state.activeStroke.points,
            {
              ...point,
              p: hardnessPressure,
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
  cancelStroke: ({ pointerType }) => {
    if (pointerType === 'touch') {
      get().discardStroke()
      return
    }

    get().endStroke()
  },
  clearInk: ({ panel } = {}) => {
    set((state) =>
      runCommand({
        command: { type: 'clearPaint', panel: panel ?? state.paintPanel },
        extra: { activeStroke: null },
      }),
    )
  },
  addGraphic: ({ src, panel, x, y }) => {
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
            x: x ?? 0.5,
            y: y ?? 0.48,
            scale: placementScale({
              panel: panel ?? state.paintPanel,
              scale: 0.28,
              aspect: 1,
              surface: panelSurface({ template: tee.stack.document.template, panel: panel ?? state.paintPanel }),
            }),
            rotation: 0,
            opacity: 1,
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
            opacity: 1,
            visible: true,
          },
        },
        extra: { selectedLayerId: layerId, typeDraft: '' },
      })
    })
  },
  selectLayer: ({ selectedLayerId }) => {
    set((state) => {
      // The panel follows its layer, so a typed word lands beside it.
      const layer = state.document.layers.find((entry) => entry.id === selectedLayerId)
      const panel = layer && 'panel' in layer ? layer.panel : state.paintPanel
      return { selectedLayerId, activeLayerEdit: null, paintPanel: panel }
    })
  },
  startLayerEdit: ({ edit }) => {
    set((state) =>
      // A locked item has no handles to drag (W3).
      isLockedLayer({ layer: state.document.layers.find((entry) => entry.id === edit.layerId) })
        ? state
        : { selectedLayerId: edit.layerId, activeLayerEdit: edit },
    )
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
  nudgeLayer: ({ layerId, dx, dy, now = Date.now() }) => {
    set((state) => {
      const layer = state.document.layers.find((entry) => entry.id === layerId)

      if (
        !layer ||
        (layer.kind !== 'graphic' && layer.kind !== 'text' && layer.kind !== 'pattern') ||
        isLockedLayer({ layer })
      ) {
        return state
      }

      // Rounded so repeated steps land on the same number a typed value
      // does (#156): 0.38 + 7 × 0.01 is 0.45, not 0.45000000000000007.
      const patch = {
        x: roundPlacement({ value: Math.min(1, Math.max(0, layer.x + dx)) }),
        y: roundPlacement({ value: Math.min(1, Math.max(0, layer.y + dy)) }),
      }

      if (!layerPatchChanges({ layer, patch })) {
        return state
      }

      const before = historyMarker()
      const merge =
        lastNudge !== null &&
        lastNudge.layerId === layerId &&
        lastNudge.marker === before &&
        now - lastNudge.at < NUDGE_MERGE_MS
      const next = runCommand({
        command: { type: 'updateLayer', layerId, patch },
        extra: { selectedLayerId: layerId, activeLayerEdit: null },
      })

      if (historyMarker() === before) {
        // Refused (a limit notice) or unchanged: no step to merge.
        return next
      }

      if (merge) {
        // Drop the step this nudge pushed; the earlier nudge's step now
        // undoes both.
        if (teeActive()) {
          tee = { ...tee, stack: { ...tee.stack, past: tee.stack.past.slice(0, -1) } }
        } else {
          commandStack = { ...commandStack, past: commandStack.past.slice(0, -1) }
        }
      }

      lastNudge = { layerId, at: now, marker: historyMarker() }
      return merge ? syncFromStack({ extra: { selectedLayerId: layerId, activeLayerEdit: null } }) : next
    })
  },
  moveLayer: ({ layerId, direction }) => {
    const placement = layerPlacement({ layerId })

    if (!placement) {
      return
    }

    const toIndex =
      direction === 'front'
        ? placement.count - 1
        : direction === 'back'
          ? 0
          : placement.index + (direction === 'up' ? 1 : -1)
    get().moveLayerTo({ layerId, toIndex })
  },
  moveLayerTo: ({ layerId, toIndex }) => {
    set((state) => {
      const placement = layerPlacement({ layerId })

      if (
        !placement ||
        toIndex === placement.index ||
        toIndex < 0 ||
        toIndex >= placement.count ||
        isLockedLayer({ layer: state.document.layers.find((entry) => entry.id === layerId) })
      ) {
        return state
      }

      const step = runTeeCommand({
        engine: tee,
        command: { type: 'moveLayer', layerId, toIndex },
      })

      if (!step.changed) {
        return step.refusal ? { limitNotice: step.refusal } : state
      }

      tee = step.engine
      return syncFromStack()
    })
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
            opacity: 1,
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
    const loaded = loadEngine({ document, garmentId: resolved })
    set({
      ...syncFromStack(),
      ...loaded,
      cloud: null,
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
      undoCount: 0,
      redoCount: 0,
    })
  },
  loadCanonical: ({ document, cloud }) => {
    canonicalShelves.clear()
    const resolved = resolveTemplate(document.template)
    activeGarment = (resolved.ok ? resolved.manifest.garmentId : 'tee') as GarmentId
    tee = { stack: replaceDocument({ stack: tee.stack, document }), assetSources: {} }
    set({
      ...syncFromStack(),
      cloud,
      cloudLoad: get().cloudLoad + 1,
      title: cloud.title,
      importNotes: [],
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
    })
  },
  setCloudHead: ({ headSeq }) => {
    set((state) => (state.cloud ? { cloud: { ...state.cloud, headSeq } } : state))
  },
  setCloudDescription: ({ description }) => {
    set((state) => (state.cloud ? { cloud: { ...state.cloud, description } } : state))
  },

  setCloudTitle: ({ title }) => {
    set((state) => (state.cloud ? { cloud: { ...state.cloud, title } } : state))
  },
  upgradeTemplate: () => {
    if (!teeActive()) {
      return false
    }

    const result = upgradeToCurrentTemplate({ document: tee.stack.document })

    if (!result.ok || !result.changed) {
      return false
    }

    const pushed = replaceDocumentUndoable({ stack: tee.stack, document: result.document })

    if (!pushed.ok) {
      return false
    }

    tee = { ...tee, stack: pushed.stack }
    set({
      ...syncFromStack(),
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
    })
    return true
  },
  recoverCanonical: ({ document }) => {
    if (!get().cloud || !teeActive()) {
      return
    }

    tee = { ...tee, stack: replaceDocument({ stack: tee.stack, document }) }
    set({
      ...syncFromStack(),
      activeStroke: null,
      activeLayerEdit: null,
      selectedLayerId: null,
    })
  },
  addUploadedImage: ({ assetId, aspect, src, panel }) => {
    if (!teeActive()) {
      return
    }

    const layerId = createObjectId({ prefix: 'mark' })
    const step = runTeeCommand({
      engine: { ...tee, assetSources: { ...tee.assetSources, [assetId]: src } },
      command: {
        type: 'addLayer',
        panel: canonicalPanel({ renderPanel: panel ?? get().paintPanel, template: tee.stack.document.template }),
        layer: {
          id: layerId,
          kind: 'image',
          visible: true,
          opacity: 1,
          x: 0.5,
          y: 0.48,
          scale: placementScale({
            panel: panel ?? get().paintPanel,
            scale: 0.28,
            aspect,
            surface: panelSurface({ template: tee.stack.document.template, panel: panel ?? get().paintPanel }),
          }),
          rotation: 0,
          assetId,
          aspect: Math.min(
            CANONICAL_LIMITS.maxImageAspect,
            Math.max(1 / CANONICAL_LIMITS.maxImageAspect, aspect),
          ),
        },
      },
    })

    if (step.refusal) {
      set({ limitNotice: step.refusal })
      return
    }

    if (!step.changed) {
      return
    }

    tee = step.engine
    set(syncFromStack({ extra: { selectedLayerId: layerId } }))
  },
  registerAssetSources: ({ sources }) => {
    tee = { ...tee, assetSources: { ...tee.assetSources, ...sources } }

    if (teeActive()) {
      set(syncFromStack())
    }
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
    const loaded = loadEngine({
      document: snapshot.document,
      garmentId: resolveGarmentId({ garmentId: snapshot.document.garmentId }),
    })
    set(
      syncFromStack({
        extra: {
          ...loaded,
          cloud: null,
          activeStroke: null,
          activeLayerEdit: null,
          selectedLayerId: null,
        },
      }),
    )
  },
}))
