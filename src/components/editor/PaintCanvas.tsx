import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { documentHasInk } from '../../lib/design-document'
import { trackAssumption } from '../../lib/assumption-events'
import type { PanelId } from '../../lib/design-document'
import { useEditorStore } from '../../lib/editor-store'
import { garmentPanels } from '../../lib/garments'
import { HOUSE_COPY } from '../../lib/house-copy'
import { useLayerImages } from '../../lib/layer-images'
import {
  applyLayerEdit,
  canvasLayerFrame,
  hitLayerHandle,
  hitPlaceableLayer,
  placedType,
  wordEditShouldCommit,
  type LayerHandle,
  type PlaceableLayer,
} from '../../lib/layer-hit'
import { paintSurfacePanels } from '../../lib/paint-layout'
import { rasterizeLayers } from '../../lib/paint-atlas'
import { atlasSourceRect } from '../../lib/panel-uv'
import { cn } from '../../lib/cn'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'
import { useLgUp } from '../../lib/viewport'

const PANEL_CANVAS_WIDTH = 360
const PANEL_CANVAS_HEIGHT = 420

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
}: {
  canvas: HTMLCanvasElement
  atlas: HTMLCanvasElement
  panel: PanelId
  selected: PlaceableLayer | null
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
    context.strokeStyle = '#c4a15a'
    context.lineWidth = 1.5
    context.strokeRect(
      -frame.width / 2,
      -frame.height / 2,
      frame.width,
      frame.height,
    )
    context.fillStyle = '#c4a15a'
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
        width: `${Math.max(18, (frame.width / canvasWidth) * 100)}%`,
        transform: `translate(-50%, -50%) rotate(${-layer.rotation}rad)`,
      }}
    >
      <span className="sr-only">{HOUSE_COPY.type}</span>
      <input
        autoFocus
        value={draftWord}
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
            onCommit({ content: draftWord.slice(0, 32) })
          }

          onClose()
        }}
        onKeyDown={(event) => {
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

function PaintSurface({
  panel,
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
  const startStroke = useEditorStore((state) => state.startStroke)
  const appendStroke = useEditorStore((state) => state.appendStroke)
  const endStroke = useEditorStore((state) => state.endStroke)
  const addText = useEditorStore((state) => state.addText)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const startLayerEdit = useEditorStore((state) => state.startLayerEdit)
  const moveLayerEdit = useEditorStore((state) => state.moveLayerEdit)
  const endLayerEdit = useEditorStore((state) => state.endLayerEdit)
  const updateLayer = useEditorStore((state) => state.updateLayer)

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
    })
  }, [atlas, canvasRef, panel, selected])

  function handlePointerDown({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    const node = canvasRef.current

    if (!node) {
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

    if (selected && selected.panel === panel) {
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

    if (!node) {
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
        moveLayerEdit({
          edit: {
            layerId: selected.id,
            x: Math.min(1, Math.max(0, drag.startX + (point.x - drag.originX))),
            y: Math.min(1, Math.max(0, drag.startY + (point.y - drag.originY))),
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

      moveLayerEdit({
        edit: {
          layerId: selected.id,
          x: drag.startX,
          y: drag.startY,
          scale: drag.startScale,
          rotation:
            drag.startRotation +
            Math.atan2(point.y - drag.startY, point.x - drag.startX) -
            Math.atan2(drag.originY - drag.startY, drag.originX - drag.startX),
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

  function handlePointerUp() {
    const drag = dragRef.current

    if (drag && drag.panel === panel) {
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
      className={cn('relative min-h-0 flex-1 border bg-flv-soft', {
        'border-flv-accent': active,
        'border-flv-line': !active,
      })}
    >
      <canvas
        ref={canvasRef}
        width={PANEL_CANVAS_WIDTH}
        height={PANEL_CANVAS_HEIGHT}
        role="img"
        aria-label={`${HOUSE_COPY.designPanel} ${panel}`}
        className="h-full w-full cursor-crosshair touch-none bg-ivory"
        onPointerDown={(event) => {
          handlePointerDown({ event })
        }}
        onPointerMove={(event) => {
          handlePointerMove({ event })
        }}
        onPointerUp={() => {
          handlePointerUp()
        }}
        onPointerCancel={() => {
          if (dragRef.current?.panel === panel) {
            dragRef.current = null
          }
          endLayerEdit()
          endStroke()
        }}
      />
      {editingWord && selected?.kind === 'text' && selected.panel === panel ? (
        <WordOnCloth
          layer={selected}
          canvasWidth={PANEL_CANVAS_WIDTH}
          canvasHeight={PANEL_CANVAS_HEIGHT}
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
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const backCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null)
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
  const canvasRefs: Record<PanelId, RefObject<HTMLCanvasElement | null>> = {
    front: frontCanvasRef,
    back: backCanvasRef,
    left: leftCanvasRef,
    right: rightCanvasRef,
  }
  const atlas = useMemo(() => {
    if (typeof document === 'undefined') {
      return null
    }

    const buffer = rasterizeLayers({
      document: liveDocument,
      extraStroke: activeStroke,
      width: 512,
      height: 512,
      images: layerImages,
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
  }, [activeStroke, layerImages, liveDocument])

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
        <p className={chromeKickerClass()}>{HOUSE_COPY.draw}</p>
        <nav
          className={cn('flex gap-3', {
            'lg:hidden': quad,
          })}
        >
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
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
      {quad && lgUp ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
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
                <PaintSurface
                  {...surfaceProps({
                    panel: panelId,
                    canvasRef: canvasRefs[panelId],
                  })}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
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
