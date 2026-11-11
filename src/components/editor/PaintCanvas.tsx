import {
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
import { liveStrokeLayerId, useEditorStore } from '../../lib/editor-store'
import { type PanelGuides, panelGuides } from '../../lib/panel-guides'
import { SNAP_PIXELS, type SnapGuide, snapMove, snapRotation, snapTargets } from '../../lib/panel-snap'
import { acceptsPointer } from '../../lib/palm-rejection'
import { claimDrawingPointer, isOtherPointer } from '../../lib/pointer-owner'
import { garmentPanels } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import { useLayerImages } from '../../lib/layer-images'
import {
  applyLayerEdit,
  canvasLayerFrame,
  panelTrueAspect,
  hitLayerHandle,
  hitPlaceableLayer,
  placedType,
  wordEditShouldCommit,
  wordEditorWidth,
  type LayerHandle,
  type PlaceableLayer,
} from '../../lib/layer-hit'
import { paintSurfacePanels } from '../../lib/paint-layout'
import { createLiveAtlas } from '../../lib/paint-atlas'
import { LIVE_STROKE_CACHE } from '../../lib/studio-flags'
import { SELECTION_COLOR } from '../../lib/selection-chrome'
import { useTextFacesVersion } from '../../lib/text-faces'
import { atlasSourceRect } from '../../lib/panel-uv'
import { cn } from '../../lib/cn'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'
import { useLgUp } from '../../lib/viewport'
import { CANONICAL_LIMITS } from '../../lib/canonical-document'

/** Older templates draw every panel at 6:7; `@3` at each region's own shape. */
const DEFAULT_PANEL_ASPECT = 6 / 7

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
}

function panelFromEvent({
  event,
  node,
}: {
  event: PointerEvent
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
}: {
  canvas: HTMLCanvasElement
  atlas: HTMLCanvasElement
  panel: PanelId
  selected: PlaceableLayer | null
  /** The document's panel rectangles (absent: the tee's). */
  rects?: DesignDocument['panelUv']
}) {
  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#f3efe6'
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

  if (selected && selected.panel === panel) {
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
    context.arc(0, -frame.height / 2 - frame.rotateGap, 5, 0, Math.PI * 2)
    context.fill()
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

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !atlas) {
      return
    }

    paintPanelSurface({
      canvas,
      atlas,
      panel,
      selected,
      rects: documentState.panelUv,
    })
  }, [atlas, canvasRef, canvasSize.height, canvasSize.width, documentState.panelUv, panel, selected])

  function handlePointerDown({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    const node = canvasRef.current

    if (
      !node ||
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

    if (selected && selected.panel === panel && (selected.kind === 'pattern' || !selected.locked)) {
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

    const hit = hitPlaceableLayer({
      document: liveDocument,
      panel,
      x: point.x,
      y: point.y,
    })

    if (hit) {
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

    if (paintTool === 'type') {
      const word = placedType({ typeDraft })

      if (word) {
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
      }

      return
    }

    selectLayer({ selectedLayerId: null })

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

    // A resting palm moving while the pen draws must not add to the stroke.
    if (
      !node ||
      !acceptsPointer({ pointerType: event.pointerType }) ||
      isOtherPointer({ pointerId: event.pointerId })
    ) {
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
        const startDist = Math.hypot(
          drag.originX - drag.startX,
          drag.originY - drag.startY,
        )
        const nextDist = Math.hypot(point.x - drag.startX, point.y - drag.startY)
        moveLayerEdit({
          edit: {
            layerId: selected.id,
            x: drag.startX,
            y: drag.startY,
            scale: Math.min(
              0.6,
              Math.max(
                0.04,
                drag.startScale * (nextDist / Math.max(0.02, startDist)),
              ),
            ),
            rotation: drag.startRotation,
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
    if (isOtherPointer({ pointerId: event.pointerId })) {
      return
    }

    const drag = dragRef.current

    if (drag && drag.panel === panel) {
      setSnapGuides([])
      const openWord =
        drag.handle === 'move' && !drag.moved && drag.layerKind === 'text'
      dragRef.current = null
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
        onPointerMove={(event) => {
          handlePointerMove({ event })
        }}
        onPointerUp={(event) => {
          handlePointerUp({ event })
        }}
        onPointerCancel={(event) => {
          if (isOtherPointer({ pointerId: event.pointerId })) {
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
  const textFace = useEditorStore((state) => state.textFace)
  const textScale = useEditorStore((state) => state.textScale)
  const typeDraft = useEditorStore((state) => state.typeDraft)
  const setPaintPanel = useEditorStore((state) => state.setPaintPanel)
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
  const atlas = useMemo(() => {
    if (typeof document === 'undefined') {
      return null
    }

    const buffer = liveAtlas({
      document: liveDocument,
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
  }, [activeStroke, layerImages, liveAtlas, liveDocument, textFaces])

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
        setPaintPanel({ paintPanel: panel })
      },
    }
  }

  return (
    <aside className="flv-panel flex h-full min-h-80 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className={chromeKickerClass()}>Four sides</p>
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
              aria-pressed={paintPanel === panel.id}
              onClick={() => {
                setPaintPanel({ paintPanel: panel.id })
              }}
              className={cn('min-h-11', chromeTextClass(), {
                'text-flv-accent': paintPanel === panel.id,
                'text-flv-muted hover:text-flv-accent': paintPanel !== panel.id,
              })}
            >
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
