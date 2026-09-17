import { useEffect, useRef, useState } from 'react'

import { documentHasInk } from '../../lib/design-document'
import { trackAssumption } from '../../lib/assumption-events'
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
import { rasterizeLayers } from '../../lib/paint-atlas'
import { atlasSourceRect } from '../../lib/panel-uv'
import { cn } from '../../lib/cn'

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
        className="min-h-11 w-full border border-brass bg-atelier px-3 text-ivory"
      />
    </label>
  )
}

export function PaintCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{
    handle: LayerHandle
    originX: number
    originY: number
    startX: number
    startY: number
    startScale: number
    startRotation: number
    moved: boolean
    layerKind: PlaceableLayer['kind']
  } | null>(null)
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
  const startStroke = useEditorStore((state) => state.startStroke)
  const appendStroke = useEditorStore((state) => state.appendStroke)
  const endStroke = useEditorStore((state) => state.endStroke)
  const addText = useEditorStore((state) => state.addText)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const startLayerEdit = useEditorStore((state) => state.startLayerEdit)
  const moveLayerEdit = useEditorStore((state) => state.moveLayerEdit)
  const endLayerEdit = useEditorStore((state) => state.endLayerEdit)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const layerImages = useLayerImages({ document: documentState })
  const [draftWord, setDraftWord] = useState('')
  const [editingWord, setEditingWord] = useState(false)
  const liveDocument = applyLayerEdit({
    document: documentState,
    edit: activeLayerEdit,
  })
  const selected = selectedPlaceable({
    document: liveDocument,
    selectedLayerId,
  })

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const buffer = rasterizeLayers({
      document: liveDocument,
      extraStroke: activeStroke,
      width: 512,
      height: 512,
      images: layerImages,
    })
    const image = new ImageData(
      new Uint8ClampedArray(buffer.pixels),
      buffer.width,
      buffer.height,
    )
    const scratch = document.createElement('canvas')
    scratch.width = buffer.width
    scratch.height = buffer.height
    scratch.getContext('2d')?.putImageData(image, 0, 0)

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f3efe6'
    context.fillRect(0, 0, canvas.width, canvas.height)

    const source = atlasSourceRect({
      panel: paintPanel,
      width: buffer.width,
      height: buffer.height,
    })
    context.drawImage(
      scratch,
      source.sourceX,
      source.sourceY,
      source.sourceWidth,
      source.sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    if (selected && selected.panel === paintPanel) {
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
      context.arc(
        0,
        -frame.height / 2 - frame.rotateGap,
        5,
        0,
        Math.PI * 2,
      )
      context.fill()
      context.restore()
    }
  }, [activeStroke, layerImages, liveDocument, paintPanel, selected])

  useEffect(() => {
    if (!selected || selected.kind !== 'text') {
      setEditingWord(false)
    }
  }, [selected])

  return (
    <aside className="flex h-full min-h-80 flex-col gap-3 border border-atelier-line bg-atelier/92 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
          {HOUSE_COPY.draw}
        </p>
        <nav className="flex gap-3">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => {
                setPaintPanel({ paintPanel: panel.id })
              }}
              className={cn(
                'min-h-11 font-display text-xs tracking-[0.16em] uppercase',
                {
                  'text-brass': paintPanel === panel.id,
                  'text-ivory-muted hover:text-brass': paintPanel !== panel.id,
                },
              )}
            >
              {panel.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          width={360}
          height={420}
          role="img"
          aria-label="Design panel"
          className="h-full w-full cursor-crosshair touch-none bg-ivory"
          onPointerDown={(event) => {
            const node = canvasRef.current

            if (!node) {
              return
            }

            node.setPointerCapture(event.pointerId)
            event.preventDefault()
            const point = panelFromEvent({ event: event.nativeEvent, node })
            const pressure =
              event.pressure > 0 && event.pointerType !== 'mouse'
                ? event.pressure
                : undefined

            if (selected && selected.panel === paintPanel) {
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
              panel: paintPanel,
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
              panel: paintPanel,
              point,
              pressure,
            })
          }}
          onPointerMove={(event) => {
            const node = canvasRef.current
            const drag = dragRef.current

            if (!node) {
              return
            }

            if (drag && selected) {
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
                    x: Math.min(
                      1,
                      Math.max(0, drag.startX + (point.x - drag.originX)),
                    ),
                    y: Math.min(
                      1,
                      Math.max(0, drag.startY + (point.y - drag.originY)),
                    ),
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
                const nextDist = Math.hypot(
                  point.x - drag.startX,
                  point.y - drag.startY,
                )
                moveLayerEdit({
                  edit: {
                    layerId: selected.id,
                    x: drag.startX,
                    y: drag.startY,
                    scale: Math.min(
                      0.6,
                      Math.max(
                        0.04,
                        drag.startScale *
                          (nextDist / Math.max(0.02, startDist)),
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
                    Math.atan2(
                      drag.originY - drag.startY,
                      drag.originX - drag.startX,
                    ),
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
          }}
          onPointerUp={() => {
            const drag = dragRef.current

            if (drag) {
              const openWord =
                drag.handle === 'move' &&
                !drag.moved &&
                drag.layerKind === 'text'
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
          }}
          onPointerCancel={() => {
            dragRef.current = null
            endLayerEdit()
            endStroke()
          }}
        />
        {editingWord && selected?.kind === 'text' ? (
          <WordOnCloth
            layer={selected}
            canvasWidth={360}
            canvasHeight={420}
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
    </aside>
  )
}
