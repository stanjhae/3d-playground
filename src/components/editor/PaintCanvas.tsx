import {
  Suspense,
  createRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { documentHasInk } from '../../lib/design-document'
import { trackAssumption } from '../../lib/assumption-events'
import type { DesignDocument, PanelId } from '../../lib/design-document'
import { type DesignTool, liveStrokeLayerId, useEditorStore } from '../../lib/editor-store'
import { surfaceGesture } from '../../lib/surface-gesture'
import { outsideVeil, panelOutline, usePanelShapes } from '../../lib/panel-shape'
import { PanelShapeLoader } from './PanelShapeLoader'
import { GRAPHIC_DROP_EVENT, type GraphicDropDetail, carriesGraphic, droppedGraphic } from '../../lib/graphic-drag'
import { type PanelGuides, panelGuides } from '../../lib/panel-guides'
import { SNAP_PIXELS, type SnapGuide, snapMove, snapRotation, snapTargets } from '../../lib/panel-snap'
import { acceptsPointer } from '../../lib/palm-rejection'
import { claimDrawingPointer, isOtherPointer } from '../../lib/pointer-owner'
import { type Point, pinchedPlacement, twoFingerChange } from '../../lib/two-finger'
import { garmentPanels } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import { useLayerImages } from '../../lib/layer-images'
import {
  applyLayerEdit,
  canvasLayerFrame,
  panelTrueAspect,
  hitLayerHandle,
  hitPlaceableLayer,
  isBaseFill,
  movableOnSurface,
  isEdgeHandle,
  layerStretches,
  layerVoice,
  scaleCorner,
  stretchEdge,
  placedType,
  rotateHandleBelow,
  wordEditShouldCommit,
  wordEditorWidth,
  type LayerHandle,
  type PlaceableLayer,
} from '../../lib/layer-hit'
import { paintSurfacePanels } from '../../lib/paint-layout'
import { createLiveAtlas } from '../../lib/paint-atlas'
import { LIVE_STROKE_CACHE } from '../../lib/studio-flags'
import { SELECTION_COLOR } from '../../lib/selection-chrome'
import { ACTIVE_OUTLINE_COLOR, OUTLINE_COLOR, OUTLINE_GROUND, outlineViewDocument } from '../../lib/outline-view'
import { useTextFacesVersion } from '../../lib/text-faces'
import { atlasSourceRect } from '../../lib/panel-uv'
import { clothColorOf } from '../../lib/cloth-color'
import { cn } from '../../lib/cn'
import { BringToFront, Copy, Trash2 } from 'lucide-react'
import { LOCKED_NOTICE, announce, flashNotice } from '../../lib/studio-announcer'
import { PanelShapeIcon } from './PanelShapeIcon'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'
import { useLgUp } from '../../lib/viewport'
import { CANONICAL_LIMITS } from '../../lib/canonical-document'

/** Older templates draw every panel at 6:7; `@3` at each region's own shape. */
const DEFAULT_PANEL_ASPECT = 6 / 7
/** The garment's outline on a 2D side, in canvas pixels. */
const OUTLINE_WIDTH = 2

function panelCanvasSize({ aspect }: { aspect: number }) {
  if (aspect === DEFAULT_PANEL_ASPECT) {
    return { width: 360, height: 420 }
  }

  return aspect < 1
    ? { width: Math.round(560 * aspect), height: 560 }
    : { width: 560, height: Math.round(560 / aspect) }
}
/** Centres each panel at the canvas's 6:7 aspect, however its cell is shaped. */
const PANEL_FRAME_CLASS = 'grid min-h-0 flex-1 place-items-center [container-type:size]'

/** Two fingers resizing and turning a mark, or a pinch over whose fingers are still down. */
type PinchState =
  | { kind: 'pinch'; start: [Point, Point]; layerId: string; x: number; y: number; scale: number; rotation: number }
  | { kind: 'spent' }

type DragState = {
  handle: LayerHandle
  originX: number
  originY: number
  startX: number
  startY: number
  startScale: number
  startRotation: number
  moved: boolean
  layerKind: PlaceableLayer['kind']
  panel: PanelId
  /** The layer as it was at pointer-down, which corner and edge drags measure from. */
  startLayer: PlaceableLayer
}

function panelFromEvent({
  event,
  node,
}: {
  event: Pick<PointerEvent, 'clientX' | 'clientY'>
  node: HTMLCanvasElement
}) {
  const rect = node.getBoundingClientRect()
  const x = (event.clientX - rect.left) / Math.max(1, rect.width)
  const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height)

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  }
}

/**
 * The panel under a screen point: a panel canvas (with the point on it) or
 * a panel's tab (no point), from their `data-panel-target`.
 */
function panelUnder({ clientX, clientY }: { clientX: number; clientY: number }) {
  const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-panel-target]')
  const panel = element?.dataset.panelTarget as PanelId | undefined

  if (!element || !panel) {
    return null
  }

  return {
    panel,
    point: element instanceof HTMLCanvasElement ? panelFromEvent({ event: { clientX, clientY }, node: element }) : null,
  }
}

function selectedPlaceable({
  document,
  selectedLayerId,
}: {
  document: ReturnType<typeof useEditorStore.getState>['document']
  selectedLayerId: string | null
}): PlaceableLayer | null {
  const layer = document.layers.find((entry) => entry.id === selectedLayerId)

  if (
    !layer ||
    (layer.kind !== 'graphic' &&
      layer.kind !== 'text' &&
      layer.kind !== 'pattern')
  ) {
    return null
  }

  return layer
}

function pointerMoved({
  originX,
  originY,
  x,
  y,
}: {
  originX: number
  originY: number
  x: number
  y: number
}) {
  return Math.hypot(x - originX, y - originY) > 0.012
}

function paintPanelSurface({
  canvas,
  atlas,
  panel,
  selected,
  rects,
  ground,
  veil = null,
  outline = null,
  outlineColor,
}: {
  canvas: HTMLCanvasElement
  atlas: HTMLCanvasElement
  panel: PanelId
  selected: PlaceableLayer | null
  /** The bare cloth's colour, as the 3D garment draws it (`clothColorOf`). */
  ground: string
  /** Shades what lies off the garment, so the panel shows its true shape. */
  veil?: HTMLCanvasElement | null
  /** The garment's silhouette line (`panelOutline`); absent, the panel's edge is outlined. */
  outline?: HTMLCanvasElement | null
  outlineColor: string
  /** The document's panel rectangles (absent: the tee's). */
  rects?: DesignDocument['panelUv']
}) {
  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = ground
  context.fillRect(0, 0, canvas.width, canvas.height)

  const source = atlasSourceRect({
    panel,
    width: atlas.width,
    height: atlas.height,
    rects,
  })
  context.drawImage(
    atlas,
    source.sourceX,
    source.sourceY,
    source.sourceWidth,
    source.sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  if (veil) {
    context.drawImage(veil, 0, 0, canvas.width, canvas.height)
  }

  // The garment's shape stays readable over any print (tester, 22 Nov).
  if (outline) {
    context.drawImage(outline, 0, 0, canvas.width, canvas.height)
  } else {
    context.save()
    context.strokeStyle = outlineColor
    context.lineWidth = OUTLINE_WIDTH
    context.strokeRect(OUTLINE_WIDTH / 2, OUTLINE_WIDTH / 2, canvas.width - OUTLINE_WIDTH, canvas.height - OUTLINE_WIDTH)
    context.restore()
  }

  // A hidden layer, or the garment's own base pattern, gets no frame to grab.
  if (selected && selected.panel === panel && selected.visible && !isBaseFill({ layer: selected })) {
    const frame = canvasLayerFrame({
      layer: selected,
      width: canvas.width,
      height: canvas.height,
    })

    context.save()
    context.translate(frame.x, frame.y)
    context.rotate(-selected.rotation)
    context.strokeStyle = SELECTION_COLOR
    context.lineWidth = 1.5
    // A locked item is outlined, dashed, with no handles to drag (W3).
    const locked = selected.kind !== 'pattern' && selected.locked === true

    if (locked) {
      context.setLineDash([4, 4])
    }

    context.strokeRect(
      -frame.width / 2,
      -frame.height / 2,
      frame.width,
      frame.height,
    )

    if (locked) {
      context.restore()
      return
    }

    context.fillStyle = SELECTION_COLOR
    context.beginPath()
    context.arc(frame.width / 2, frame.height / 2, 5, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    // Below the box when above it would be off the panel's top.
    const rotateY = frame.height / 2 + frame.rotateGap
    context.arc(0, rotateHandleBelow({ layer: selected }) ? rotateY : -rotateY, 5, 0, Math.PI * 2)
    context.fill()

    // Mid-edge handles stretch one side (W): squares, told apart from the round corner.
    if (layerStretches({ layer: selected })) {
      context.fillStyle = '#ffffff'
      for (const [x, y] of [
        [-frame.width / 2, 0],
        [frame.width / 2, 0],
        [0, -frame.height / 2],
        [0, frame.height / 2],
      ] as const) {
        context.fillRect(x - 4, y - 4, 8, 8)
        context.strokeRect(x - 4, y - 4, 8, 8)
      }
    }
    context.restore()
  }
}

function WordOnCloth({
  layer,
  canvasWidth,
  canvasHeight,
  draftWord,
  setDraftWord,
  editStartContent,
  onClose,
  onCommit,
}: {
  layer: Extract<PlaceableLayer, { kind: 'text' }>
  canvasWidth: number
  canvasHeight: number
  draftWord: string
  setDraftWord: (word: string) => void
  editStartContent: string
  onClose: () => void
  onCommit: ({ content }: { content: string }) => void
}) {
  const frame = canvasLayerFrame({
    layer,
    width: canvasWidth,
    height: canvasHeight,
  })

  return (
    <label
      className="absolute"
      style={{
        left: `${(frame.x / canvasWidth) * 100}%`,
        top: `${(frame.y / canvasHeight) * 100}%`,
        width: wordEditorWidth({ frameShare: frame.width / canvasWidth, length: draftWord.length }),
        transform: `translate(-50%, -50%) rotate(${-layer.rotation}rad)`,
      }}
    >
      <span className="sr-only">{HOUSE_COPY.type}</span>
      <input
        autoFocus
        value={draftWord}
        maxLength={CANONICAL_LIMITS.textLength}
        onChange={(event) => {
          setDraftWord(event.target.value)
        }}
        onBlur={() => {
          if (
            wordEditShouldCommit({
              layerContent: layer.content,
              editStartContent,
            })
          ) {
            // The whole word; the canonical limit is enforced (with a
            // message) by the command, never by silently cutting it (#155).
            onCommit({ content: draftWord })
          }

          onClose()
        }}
        onKeyDown={(event) => {
          // Leaving the box commits the word.
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            event.currentTarget.blur()
            return
          }

          if (event.key !== 'Escape') {
            return
          }

          event.preventDefault()
          onClose()
        }}
        className="min-h-11 w-full border border-flv-accent bg-white px-3 text-flv-ink"
      />
    </label>
  )
}

/** Chest line and collar band, faint and out of the pointer's way. */
/**
 * Remove, Duplicate and Bring forward right beside the selected mark, so
 * nobody hunts for them (tester feedback). Sits above the mark, or below it
 * when the mark is near the top of the panel; hidden while it is dragged.
 */
function SelectionToolbar({
  layer,
  canvasWidth,
  canvasHeight,
}: {
  layer: PlaceableLayer
  canvasWidth: number
  canvasHeight: number
}) {
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const dragging = useEditorStore((state) => state.activeLayerEdit !== null)
  const locked = layer.kind !== 'pattern' && layer.locked === true

  if (dragging || locked) {
    return null
  }

  const frame = canvasLayerFrame({ layer, width: canvasWidth, height: canvasHeight })
  const top = (frame.y - frame.height / 2 - frame.rotateGap) / canvasHeight
  const below = top < 0.14
  const left = Math.min(0.85, Math.max(0.15, frame.x / canvasWidth))
  // Clear of the rotate handle when it has moved below the box.
  const bottom = frame.y + frame.height / 2 + (rotateHandleBelow({ layer }) ? frame.rotateGap + 6 : 0)
  const at = below ? bottom / canvasHeight : top
  const name = layerVoice({ layer })
  const button =
    'inline-flex size-9 items-center justify-center rounded-full text-flv-ink hover:bg-flv-soft hover:text-flv-accent'

  return (
    <div
      role="toolbar"
      aria-label={`${name} actions`}
      className={cn(
        'pointer-events-auto absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-flv-line bg-white/95 p-0.5 shadow-md',
        below ? 'mt-2' : '-translate-y-full -mt-2',
      )}
      style={{ left: `${left * 100}%`, top: `${Math.min(0.92, Math.max(0, at)) * 100}%` }}
      // A press here is for the toolbar, not a stroke on the panel below.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title="Remove"
        className={button}
        onClick={() => {
          removeLayer({ layerId: layer.id })
          announce({ message: `${name} removed. Undo brings it back.` })
        }}
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {layer.kind === 'pattern' ? null : (
        <button
          type="button"
          aria-label={`Duplicate ${name}`}
          title="Duplicate"
          className={button}
          onClick={() => {
            duplicateLayer({ layerId: layer.id })
          }}
        >
          <Copy aria-hidden className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-label={`Bring ${name} forward`}
        title="Bring forward"
        className={button}
        onClick={() => {
          moveLayer({ layerId: layer.id, direction: 'up' })
        }}
      >
        <BringToFront aria-hidden className="size-4" />
      </button>
    </div>
  )
}

function PanelGuideOverlay({ guides }: { guides: PanelGuides }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden font-body text-[0.6rem] text-flv-muted">
      <div
        className="absolute inset-x-0 top-0 border-b border-dashed border-flv-muted/40 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(91_98_112/0.08)_4px_8px)]"
        style={{ height: `${guides.collarFromTop * 100}%` }}
      >
        <span className="absolute bottom-0.5 left-1">Collar · doesn't print</span>
      </div>
      <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-flv-muted/25" />
      <div
        className="absolute inset-x-0 border-t border-dashed border-flv-muted/35"
        style={{ top: `${guides.chestFromTop * 100}%` }}
      >
        <span className="absolute top-0.5 left-1">{guides.chestLabel}</span>
      </div>
    </div>
  )
}

/** Where a dragged item has snapped: thin accent lines across the panel. */
function SnapGuideOverlay({ guides }: { guides: SnapGuide[] }) {
  return (
    <div aria-hidden data-testid="snap-guides" className="pointer-events-none absolute inset-0 overflow-hidden">
      {guides.map((guide) =>
        guide.axis === 'x' ? (
          <div key="x" className="absolute inset-y-0 border-l border-flv-accent" style={{ left: `${guide.value * 100}%` }} />
        ) : (
          <div key="y" className="absolute inset-x-0 border-t border-flv-accent" style={{ top: `${(1 - guide.value) * 100}%` }} />
        ),
      )}
    </div>
  )
}

function PaintSurface({
  panel,
  label,
  active,
  canvasRef,
  atlas,
  liveDocument,
  documentState,
  activeStroke,
  selected,
  paintTool,
  designTool,
  typeDraft,
  textFace,
  textScale,
  dragRef,
  editStartContentRef,
  editingWord,
  draftWord,
  setDraftWord,
  setEditingWord,
  onActivate,
}: {
  panel: PanelId
  label: string
  active: boolean
  canvasRef: RefObject<HTMLCanvasElement | null>
  atlas: HTMLCanvasElement | null
  liveDocument: ReturnType<typeof useEditorStore.getState>['document']
  documentState: ReturnType<typeof useEditorStore.getState>['document']
  activeStroke: ReturnType<typeof useEditorStore.getState>['activeStroke']
  selected: PlaceableLayer | null
  paintTool: ReturnType<typeof useEditorStore.getState>['paintTool']
  designTool: DesignTool
  typeDraft: string
  textFace: ReturnType<typeof useEditorStore.getState>['textFace']
  textScale: number
  dragRef: RefObject<DragState | null>
  editStartContentRef: RefObject<string>
  editingWord: boolean
  draftWord: string
  setDraftWord: (word: string) => void
  setEditingWord: (editing: boolean) => void
  onActivate: () => void
}) {
  // Guides are measured on the tee; concept garments have none.
  // Chest and collar guides are measured on the procedural tee (@1–@3).
  const teeGuides = useEditorStore((state) => state.garmentId === 'tee' && !state.document.modelSrc)
  const guides = teeGuides ? panelGuides({ panel }) : null
  const startStroke = useEditorStore((state) => state.startStroke)
  const appendStroke = useEditorStore((state) => state.appendStroke)
  const endStroke = useEditorStore((state) => state.endStroke)
  const cancelStroke = useEditorStore((state) => state.cancelStroke)
  const addText = useEditorStore((state) => state.addText)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const startLayerEdit = useEditorStore((state) => state.startLayerEdit)
  const moveLayerEdit = useEditorStore((state) => state.moveLayerEdit)
  const endLayerEdit = useEditorStore((state) => state.endLayerEdit)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const panelAspect = documentState.panelAspects?.[panel] ?? DEFAULT_PANEL_ASPECT
  const canvasSize = panelCanvasSize({ aspect: panelAspect })
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const shapes = usePanelShapes((state) => state.shapes)
  const shapeSrc = usePanelShapes((state) => state.src)
  const outlineOnly = useEditorStore((state) => state.outlineOnly)
  const ground = outlineOnly ? OUTLINE_GROUND : clothColorOf({ document: documentState })
  const outlineColor = active ? ACTIVE_OUTLINE_COLOR : OUTLINE_COLOR


  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !atlas) {
      return
    }

    const modelSrc = documentState.modelSrc
    const triangles = modelSrc && shapeSrc === modelSrc ? shapes[panel] : undefined

    paintPanelSurface({
      canvas,
      atlas,
      panel,
      selected,
      rects: documentState.panelUv,
      ground,
      veil:
        modelSrc && triangles
          ? outsideVeil({ src: modelSrc, panel, triangles, width: canvas.width, height: canvas.height })
          : null,
      outline:
        modelSrc && triangles
          ? panelOutline({
              src: modelSrc,
              panel,
              triangles,
              width: canvas.width,
              height: canvas.height,
              color: outlineColor,
              lineWidth: OUTLINE_WIDTH,
            })
          : null,
      outlineColor,
    })
  }, [atlas, canvasRef, canvasSize.height, canvasSize.width, documentState.modelSrc, documentState.panelUv, ground, outlineColor, panel, selected, shapeSrc, shapes])

  // Two fingers on a selected mark resize and turn it, as on the cloth
  // (`ClothTwoFinger`). Whatever the first finger began (a stroke, a drag)
  // is dropped, and the pinch is one undo step. Until every finger lifts,
  // the panel's own handlers ignore the fingers, so no stray line or drag
  // follows the pinch.
  const pinchRef = useRef<PinchState | null>(null)

  useEffect(() => {
    const node = canvasRef.current

    if (!node) {
      return
    }

    const touches = new Map<number, Point>()
    // The mark selected when the first finger landed: that finger's press may
    // have cleared it (a stroke starts on bare cloth) before the second came.
    let selectedAtFirstTouch: string | null = null
    const pair = (): [Point, Point] => {
      const [a, b] = [...touches.values()]
      return [a!, b!]
    }

    function begin() {
      const state = useEditorStore.getState()
      const layer =
        selectedPlaceable({ document: state.document, selectedLayerId: state.selectedLayerId }) ??
        selectedPlaceable({ document: state.document, selectedLayerId: selectedAtFirstTouch })

      if (!layer || layer.panel !== panel || !movableOnSurface({ layer })) {
        return
      }

      if (state.selectedLayerId !== layer.id) {
        state.selectLayer({ selectedLayerId: layer.id })
      }

      // The first finger's stroke goes, unrecorded; its drag goes back to where it began.
      if (state.activeStroke) {
        state.discardStroke()
      }

      dragRef.current = null
      setSnapGuides([])
      const start = { layerId: layer.id, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation }

      if (useEditorStore.getState().activeLayerEdit) {
        state.moveLayerEdit({ edit: start })
      } else {
        state.startLayerEdit({ edit: start })
      }

      pinchRef.current = { kind: 'pinch', start: pair(), ...start }
    }

    function onPointerDown(event: PointerEvent) {
      // A touch while the pen is in use is a palm: it never pinches.
      if (event.pointerType !== 'touch' || !acceptsPointer({ pointerType: event.pointerType })) {
        return
      }

      if (touches.size === 0) {
        selectedAtFirstTouch = useEditorStore.getState().selectedLayerId
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (touches.size === 2 && !pinchRef.current) {
        begin()
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!touches.has(event.pointerId)) {
        return
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const pinch = pinchRef.current

      if (pinch?.kind !== 'pinch' || touches.size !== 2) {
        return
      }

      const placed = pinchedPlacement({
        scale: pinch.scale,
        rotation: pinch.rotation,
        change: twoFingerChange({ start: pinch.start, now: pair() }),
      })
      useEditorStore.getState().moveLayerEdit({ edit: { layerId: pinch.layerId, x: pinch.x, y: pinch.y, ...placed } })
    }

    function onPointerUp(event: PointerEvent) {
      if (!touches.delete(event.pointerId)) {
        return
      }

      // The first finger up ends the pinch (one undo step); the rest of the
      // hand is ignored until it's all off the panel.
      if (pinchRef.current?.kind === 'pinch') {
        const state = useEditorStore.getState()

        if (state.activeLayerEdit?.layerId === pinchRef.current.layerId) {
          state.endLayerEdit()
        }

        pinchRef.current = { kind: 'spent' }
      }

      if (touches.size === 0) {
        pinchRef.current = null
      }
    }

    node.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('pointermove', onPointerMove, { capture: true })
    window.addEventListener('pointerup', onPointerUp, { capture: true })
    window.addEventListener('pointercancel', onPointerUp, { capture: true })

    return () => {
      node.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onPointerMove, { capture: true })
      window.removeEventListener('pointerup', onPointerUp, { capture: true })
      window.removeEventListener('pointercancel', onPointerUp, { capture: true })

      if (pinchRef.current?.kind === 'pinch') {
        useEditorStore.getState().endLayerEdit()
      }

      pinchRef.current = null
    }
  }, [canvasRef, dragRef, panel])

  function handlePointerDown({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    const node = canvasRef.current

    if (
      !node ||
      pinchRef.current ||
      !acceptsPointer({ pointerType: event.pointerType }) ||
      !claimDrawingPointer({ pointerId: event.pointerId, pointerType: event.pointerType })
    ) {
      return
    }

    onActivate()
    node.setPointerCapture(event.pointerId)
    event.preventDefault()
    const point = panelFromEvent({ event: event.nativeEvent, node })
    const pressure =
      event.pressure > 0 && event.pointerType !== 'mouse'
        ? event.pressure
        : undefined

    if (selected && selected.panel === panel && movableOnSurface({ layer: selected })) {
      const handle = hitLayerHandle({
        layer: selected,
        x: point.x,
        y: point.y,
      })

      if (handle) {
        dragRef.current = {
          handle,
          originX: point.x,
          originY: point.y,
          startX: selected.x,
          startY: selected.y,
          startScale: selected.scale,
          startRotation: selected.rotation,
          moved: false,
          layerKind: selected.kind,
          panel,
          startLayer: selected,
        }
        startLayerEdit({
          edit: {
            layerId: selected.id,
            x: selected.x,
            y: selected.y,
            scale: selected.scale,
            rotation: selected.rotation,
          },
        })
        return
      }
    }

    const top = hitPlaceableLayer({
      document: liveDocument,
      panel,
      x: point.x,
      y: point.y,
      withLocked: true,
    })

    // A locked item is selected and says why it stays put; the press never
    // becomes a stroke or clears the selection (W3).
    if (top && top.kind !== 'pattern' && top.locked) {
      selectLayer({ selectedLayerId: top.id })
      flashNotice({ message: LOCKED_NOTICE })
      return
    }

    const hit = top
    // One rule for the panels and the cloth (`surface-gesture.ts`).
    const word = paintTool === 'type' && designTool === 'text' ? placedType({ typeDraft }) : null
    const gesture = surfaceGesture({
      designTool,
      wordArmed: Boolean(word),
      hitsLayer: Boolean(hit),
      rotatingView: false,
    })

    if (gesture === 'drag-layer' && hit) {
      selectLayer({ selectedLayerId: hit.id })
      dragRef.current = {
        handle: 'move',
        originX: point.x,
        originY: point.y,
        startX: hit.x,
        startY: hit.y,
        startScale: hit.scale,
        startRotation: hit.rotation,
        moved: false,
        layerKind: hit.kind,
        panel,
        startLayer: hit,
      }
      startLayerEdit({
        edit: {
          layerId: hit.id,
          x: hit.x,
          y: hit.y,
          scale: hit.scale,
          rotation: hit.rotation,
        },
      })
      return
    }

    if (gesture === 'place-text' && word) {
      addText({
        content: word,
        x: point.x,
        y: point.y,
        face: textFace,
        scale: textScale,
        panel,
      })
      editStartContentRef.current = word
      setDraftWord(word)
      setEditingWord(true)
      return
    }

    selectLayer({ selectedLayerId: null })

    // Graphics, Upload and Text place by tapping their tiles or dropping on
    // the panel: a press on bare cloth only clears the selection.
    if (gesture !== 'stroke') {
      return
    }

    if (!documentHasInk({ document: documentState }) && !activeStroke) {
      void trackAssumption({ name: 'started_drawing' })
    }

    startStroke({
      panel,
      point,
      pressure,
    })
  }

  function handlePointerMove({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    const node = canvasRef.current
    const drag = dragRef.current

    // A resting palm moving while the pen draws must not add to the stroke,
    // and a pinch's fingers move the mark, not the stroke or the drag.
    if (
      !node ||
      pinchRef.current ||
      !acceptsPointer({ pointerType: event.pointerType }) ||
      isOtherPointer({ pointerId: event.pointerId })
    ) {
      return
    }

    // An undo or redo mid-drag ended the edit: the drag ends with it and
    // nothing it held is put back on release.
    if (drag && useEditorStore.getState().activeLayerEdit === null) {
      dragRef.current = null
      setSnapGuides([])
      return
    }

    if (drag && drag.panel === panel && selected) {
      event.preventDefault()
      const point = panelFromEvent({ event: event.nativeEvent, node })

      if (
        pointerMoved({
          originX: drag.originX,
          originY: drag.originY,
          x: point.x,
          y: point.y,
        })
      ) {
        drag.moved = true
      }

      if (drag.handle === 'move') {
        const x = Math.min(1, Math.max(0, drag.startX + (point.x - drag.originX)))
        const y = Math.min(1, Math.max(0, drag.startY + (point.y - drag.originY)))
        const rect = node.getBoundingClientRect()
        // Alt (Option) places freely.
        const snapped = event.altKey
          ? { x, y, guides: [] }
          : snapMove({
              x,
              y,
              targets: snapTargets({ document: liveDocument, panel, layerId: selected.id, withChest: teeGuides }),
              withinX: SNAP_PIXELS / Math.max(1, rect.width),
              withinY: SNAP_PIXELS / Math.max(1, rect.height),
            })
        setSnapGuides(snapped.guides)
        moveLayerEdit({
          edit: {
            layerId: selected.id,
            x: snapped.x,
            y: snapped.y,
            scale: drag.startScale,
            rotation: drag.startRotation,
          },
        })
        return
      }

      if (drag.handle === 'scale') {
        // Uniform about the centre; Shift lets width and height go their own ways.
        moveLayerEdit({
          edit: {
            layerId: selected.id,
            ...scaleCorner({
              layer: drag.startLayer,
              from: { x: drag.originX, y: drag.originY },
              to: point,
              free: event.shiftKey,
            }),
          },
        })
        return
      }

      if (isEdgeHandle(drag.handle)) {
        // One side only: the opposite edge stays put.
        moveLayerEdit({
          edit: {
            layerId: selected.id,
            ...stretchEdge({
              layer: drag.startLayer,
              edge: drag.handle,
              from: { x: drag.originX, y: drag.originY },
              to: point,
            }),
          },
        })
        return
      }

      const trueAspect = panelTrueAspect({ layer: selected })
      moveLayerEdit({
        edit: {
          layerId: selected.id,
          x: drag.startX,
          y: drag.startY,
          scale: drag.startScale,
          rotation: (() => {
            const rotation =
              drag.startRotation +
              Math.atan2(point.y - drag.startY, (point.x - drag.startX) * trueAspect) -
              Math.atan2(drag.originY - drag.startY, (drag.originX - drag.startX) * trueAspect)
            return event.altKey ? rotation : snapRotation({ rotation })
          })(),
        },
      })
      return
    }

    if (event.buttons === 0) {
      return
    }

    event.preventDefault()
    appendStroke({
      point: panelFromEvent({ event: event.nativeEvent, node }),
      pressure:
        event.pressure > 0 && event.pointerType !== 'mouse'
          ? event.pressure
          : undefined,
    })
  }

  function handlePointerUp({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    if (isOtherPointer({ pointerId: event.pointerId }) || pinchRef.current) {
      return
    }

    const drag = dragRef.current

    if (drag && drag.panel === panel) {
      setSnapGuides([])
      const openWord =
        drag.handle === 'move' && !drag.moved && drag.layerKind === 'text'
      dragRef.current = null
      const onto = drag.handle === 'move' && drag.moved ? panelUnder({ clientX: event.clientX, clientY: event.clientY }) : null
      const edit = useEditorStore.getState().activeLayerEdit

      // Let go over another panel, or its tab: the item moves there.
      if (onto && onto.panel !== panel && edit) {
        // The view follows the item to its new panel.
        useEditorStore.getState().showPanel({ panel: onto.panel })
        useEditorStore.getState().moveLayerToPanel({
          layerId: edit.layerId,
          panel: onto.panel,
          x: onto.point?.x ?? edit.x,
          y: onto.point?.y ?? edit.y,
        })
        return
      }

      endLayerEdit()

      if (openWord) {
        const word = selectedPlaceable({
          document: useEditorStore.getState().document,
          selectedLayerId: useEditorStore.getState().selectedLayerId,
        })

        if (word?.kind === 'text') {
          editStartContentRef.current = word.content
          setDraftWord(word.content)
          setEditingWord(true)
        }
      }

      return
    }

    endStroke()
  }

  // A graphic carried by a finger from the library (`graphic-drag.ts`).
  useEffect(() => {
    const node = canvasRef.current

    if (!node) {
      return
    }

    function onTouchDrop(event: Event) {
      const detail = (event as CustomEvent<GraphicDropDetail>).detail
      const target = canvasRef.current

      if (!target) {
        return
      }

      detail.handled = true
      const point = panelFromEvent({ event: detail, node: target })
      onActivate()
      useEditorStore.getState().addGraphic({ src: detail.src, panel, x: point.x, y: point.y })
    }

    node.addEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
    return () => {
      node.removeEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
    }
  })

  return (
    <div
      className={cn('relative border bg-flv-soft', {
        'border-flv-accent': active,
        'border-flv-line': !active,
      })}
      style={{ aspectRatio: panelAspect, width: `min(100cqw, calc(100cqh * ${panelAspect}))` }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        role="img"
        data-panel-target={panel}
        aria-label={`${HOUSE_COPY.designPanel} ${label}${active ? ', active' : ''}`}
        // A tab stop per panel (#163): focusing one makes it the panel a
        // typed word lands on, with no pointer needed.
        tabIndex={0}
        onFocus={() => {
          if (!active) {
            onActivate()
          }
        }}
        className="h-full w-full cursor-crosshair touch-none bg-ivory"
        onPointerDown={(event) => {
          handlePointerDown({ event })
        }}
        onDragOver={(event) => {
          if (carriesGraphic({ dataTransfer: event.dataTransfer })) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(event) => {
          const src = droppedGraphic({ dataTransfer: event.dataTransfer })
          const node = canvasRef.current

          if (!src || !node) {
            return
          }

          // A graphic dragged from the library lands where it was let go.
          event.preventDefault()
          const point = panelFromEvent({ event: event.nativeEvent, node })
          onActivate()
          useEditorStore.getState().addGraphic({ src, panel, x: point.x, y: point.y })
        }}
        onPointerMove={(event) => {
          handlePointerMove({ event })
        }}
        onPointerUp={(event) => {
          handlePointerUp({ event })
        }}
        onPointerCancel={(event) => {
          if (isOtherPointer({ pointerId: event.pointerId }) || pinchRef.current) {
            return
          }

          if (dragRef.current?.panel === panel) {
            dragRef.current = null
          }
          setSnapGuides([])
          endLayerEdit()
          cancelStroke({ pointerType: event.pointerType })
        }}
      />
      {guides ? <PanelGuideOverlay guides={guides} /> : null}
      {snapGuides.length ? <SnapGuideOverlay guides={snapGuides} /> : null}
      {selected && selected.panel === panel && selected.visible && !isBaseFill({ layer: selected }) && !editingWord ? (
        <SelectionToolbar layer={selected} canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} />
      ) : null}
      {editingWord && selected?.kind === 'text' && selected.panel === panel ? (
        <WordOnCloth
          layer={selected}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          draftWord={draftWord}
          setDraftWord={setDraftWord}
          editStartContent={editStartContentRef.current}
          onClose={() => {
            setEditingWord(false)
          }}
          onCommit={({ content }: { content: string }) => {
            updateLayer({
              layerId: selected.id,
              patch: { content },
            })
          }}
        />
      ) : null}
    </div>
  )
}

export function PaintCanvas({
  layout = 'single',
}: {
  layout?: 'single' | 'quad'
}) {
  const phoneCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // One canvas per panel; template-built garments have their own panels.
  const canvasRefMap = useRef(new Map<PanelId, RefObject<HTMLCanvasElement | null>>())
  const dragRef = useRef<DragState | null>(null)
  const editStartContentRef = useRef('')
  const documentState = useEditorStore((state) => state.document)
  const activeStroke = useEditorStore((state) => state.activeStroke)
  const activeLayerEdit = useEditorStore((state) => state.activeLayerEdit)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const garmentId = useEditorStore((state) => state.garmentId)
  const paintPanel = useEditorStore((state) => state.paintPanel)
  const panels = garmentPanels({ garmentId })
  const paintTool = useEditorStore((state) => state.paintTool)
  const designTool = useEditorStore((state) => state.designTool)
  const textFace = useEditorStore((state) => state.textFace)
  const textScale = useEditorStore((state) => state.textScale)
  const typeDraft = useEditorStore((state) => state.typeDraft)
  const showPanel = useEditorStore((state) => state.showPanel)
  const flashPanel = useEditorStore((state) => state.flashPanel)
  const layerImages = useLayerImages({ document: documentState })
  // Words draw in a fallback until their face loads, then redraw (#155).
  const textFaces = useTextFacesVersion()
  // Its own cache: the 2D panel draws pending words in a stand-in face.
  const [liveAtlas] = useState(() => createLiveAtlas({ enabled: LIVE_STROKE_CACHE }))
  const [draftWord, setDraftWord] = useState('')
  const [editingWord, setEditingWord] = useState(false)
  const lgUp = useLgUp()
  const liveDocument = applyLayerEdit({
    document: documentState,
    edit: activeLayerEdit,
  })
  const selected = selectedPlaceable({
    document: liveDocument,
    selectedLayerId,
  })
  const quad = layout === 'quad'
  const mountedPanels = paintSurfacePanels({
    layout,
    paintPanel,
    panels,
    lgUp,
  })
  const canvasRefFor = (panel: PanelId) => {
    let ref = canvasRefMap.current.get(panel)

    if (!ref) {
      ref = createRef<HTMLCanvasElement>()
      canvasRefMap.current.set(panel, ref)
    }

    return ref
  }
  const outlineOnly = useEditorStore((state) => state.outlineOnly)
  const setOutlineOnly = useEditorStore((state) => state.setOutlineOnly)
  const viewDocument = useMemo(
    () => (outlineOnly ? outlineViewDocument({ document: liveDocument }) : liveDocument),
    [liveDocument, outlineOnly],
  )
  const atlas = useMemo(() => {
    if (typeof document === 'undefined') {
      return null
    }

    const buffer = liveAtlas({
      document: viewDocument,
      extraStroke: activeStroke,
      extraStrokeLayerId: liveStrokeLayerId({ stroke: activeStroke }),
      width: 512,
      height: 512,
      images: layerImages,
      fontVersion: textFaces,
    })
    const scratch = document.createElement('canvas')
    scratch.width = buffer.width
    scratch.height = buffer.height
    const image = new ImageData(
      new Uint8ClampedArray(buffer.pixels),
      buffer.width,
      buffer.height,
    )
    scratch.getContext('2d')?.putImageData(image, 0, 0)
    return scratch
  }, [activeStroke, layerImages, liveAtlas, textFaces, viewDocument])

  useEffect(() => {
    if (!selected || selected.kind !== 'text') {
      setEditingWord(false)
    }
  }, [selected])

  function surfaceProps({
    panel,
    canvasRef,
  }: {
    panel: PanelId
    canvasRef: RefObject<HTMLCanvasElement | null>
  }) {
    return {
      panel,
      label: panels.find((entry) => entry.id === panel)?.label ?? panel,
      active: paintPanel === panel,
      canvasRef,
      atlas,
      liveDocument,
      documentState,
      activeStroke,
      selected,
      paintTool,
      designTool,
      typeDraft,
      textFace,
      textScale,
      dragRef,
      editStartContentRef,
      editingWord,
      draftWord,
      setDraftWord,
      setEditingWord,
      onActivate: () => {
        // Moving to another side lights it on the garment; working on the
        // same side doesn't flash on every stroke.
        if (useEditorStore.getState().paintPanel !== panel) {
          flashPanel({ panel })
        }

        // A new side also turns the 3D view to it.
        showPanel({ panel })
      },
    }
  }

  return (
    <aside className="flv-panel flex h-full min-h-80 flex-col gap-3 p-3">
      {/* The sides' true shapes, even when no 3D view is mounted to read them from. */}
      {documentState.modelSrc && documentState.panelUv ? (
        <Suspense fallback={null}>
          <PanelShapeLoader modelSrc={documentState.modelSrc} panelUv={documentState.panelUv} />
        </Suspense>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3">
          <p className={chromeKickerClass()}>Every side</p>
          {/* A busy print can hide the garment's shape while drawing (tester, 22 Nov). */}
          <button
            type="button"
            aria-pressed={outlineOnly}
            onClick={() => setOutlineOnly({ outlineOnly: !outlineOnly })}
            className={cn('inline-flex min-h-11 items-center', chromeTextClass(), {
              'text-flv-accent': outlineOnly,
              'text-flv-muted hover:text-flv-accent': !outlineOnly,
            })}
          >
            Outline only
          </button>
        </div>
        <nav
          aria-label={HOUSE_COPY.draw}
          className={cn('flex flex-wrap justify-end gap-x-3', {
            'lg:hidden': quad,
          })}
        >
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              // An item dragged onto a tab moves to that panel.
              data-panel-target={panel.id}
              aria-pressed={paintPanel === panel.id}
              onClick={() => {
                showPanel({ panel: panel.id })
                // Show which piece of the garment that is.
                flashPanel({ panel: panel.id })
              }}
              className={cn('inline-flex min-h-11 items-center gap-1.5', chromeTextClass(), {
                'text-flv-accent': paintPanel === panel.id,
                'text-flv-muted hover:text-flv-accent': paintPanel !== panel.id,
              })}
            >
              <PanelShapeIcon panel={panel.id} />
              {panel.label}
            </button>
          ))}
        </nav>
      </div>
      {garmentId === 'tee' ? (
        <p className="font-body text-xs text-flv-muted">{HOUSE_COPY.panelOrientationHint}</p>
      ) : null}
      {quad && lgUp ? (
        <div
          className="grid min-h-0 flex-1 grid-cols-2 gap-2"
          // Two per row: the tee's four panels, or a template's own (a hood, a skirt).
          style={{ gridTemplateRows: `repeat(${Math.ceil(mountedPanels.length / 2)}, minmax(0, 1fr))` }}
        >
          {mountedPanels.map((panelId) => {
            const meta = panels.find((panel) => panel.id === panelId)

            return (
              <div key={panelId} className="flex min-h-0 flex-col gap-1">
                <p
                  className={cn(chromeTextClass(), {
                    'text-flv-accent': paintPanel === panelId,
                    'text-flv-muted': paintPanel !== panelId,
                  })}
                >
                  {meta?.label ?? panelId}
                </p>
                <div className={PANEL_FRAME_CLASS}>
                  <PaintSurface
                    {...surfaceProps({
                      panel: panelId,
                      canvasRef: canvasRefFor(panelId),
                    })}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={PANEL_FRAME_CLASS}>
          <PaintSurface
            {...surfaceProps({
              panel: paintPanel,
              canvasRef: phoneCanvasRef,
            })}
          />
        </div>
      )}
    </aside>
  )
}
