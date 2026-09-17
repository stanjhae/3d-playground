import { useEffect, useRef } from 'react'

import { documentHasInk } from '../../lib/design-document'
import { trackAssumption } from '../../lib/assumption-events'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { useLayerImages } from '../../lib/layer-images'
import { rasterizeLayers } from '../../lib/paint-atlas'
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

export function PaintCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const documentState = useEditorStore((state) => state.document)
  const activeStroke = useEditorStore((state) => state.activeStroke)
  const paintPanel = useEditorStore((state) => state.paintPanel)
  const setPaintPanel = useEditorStore((state) => state.setPaintPanel)
  const startStroke = useEditorStore((state) => state.startStroke)
  const appendStroke = useEditorStore((state) => state.appendStroke)
  const endStroke = useEditorStore((state) => state.endStroke)
  const layerImages = useLayerImages({ document: documentState })

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
      document: documentState,
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

    const sourceX = paintPanel === 'front' ? 0 : buffer.width / 2
    context.drawImage(
      scratch,
      sourceX,
      0,
      buffer.width / 2,
      buffer.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  }, [activeStroke, documentState, layerImages, paintPanel])

  return (
    <aside className="flex h-full min-h-80 flex-col gap-3 border border-atelier-line bg-atelier/92 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
          {HOUSE_COPY.draw}
        </p>
        <nav className="flex gap-3">
          {(['front', 'back'] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => {
                setPaintPanel({ paintPanel: panel })
              }}
              className={cn(
                'min-h-11 font-display text-xs tracking-[0.16em] uppercase',
                {
                  'text-brass': paintPanel === panel,
                  'text-ivory-muted hover:text-brass': paintPanel !== panel,
                },
              )}
            >
              {panel === 'front' ? HOUSE_COPY.front : HOUSE_COPY.back}
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
            const point = panelFromEvent({ event: event.nativeEvent, node })
            if (!documentHasInk({ document: documentState }) && !activeStroke) {
              void trackAssumption({ name: 'started_drawing' })
            }
            startStroke({
              panel: paintPanel,
              point,
              pressure: event.pressure || undefined,
            })
          }}
          onPointerMove={(event) => {
            if (event.buttons === 0) {
              return
            }

            const node = canvasRef.current

            if (!node) {
              return
            }

            appendStroke({
              point: panelFromEvent({ event: event.nativeEvent, node }),
            })
          }}
          onPointerUp={() => {
            endStroke()
          }}
          onPointerCancel={() => {
            endStroke()
          }}
        />
      </div>
    </aside>
  )
}
