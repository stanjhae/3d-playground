import { useEffect, useRef } from 'react'

import type { PanelId } from '../../lib/design-document'
import { useEditorStore } from '../../lib/editor-store'
import { usePanelShapes } from '../../lib/panel-shape'

const WIDTH = 16
const HEIGHT = 20

/**
 * A side's own shape in miniature beside its tab, so Front, Back and the
 * sleeves read as the pieces they are. Nothing for the drawn tee, whose
 * sides are plain rectangles.
 */
export function PanelShapeIcon({ panel }: { panel: PanelId }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const modelSrc = useEditorStore((state) => state.document.modelSrc)
  const triangles = usePanelShapes((state) => (state.src === modelSrc ? state.shapes[panel] : undefined))

  useEffect(() => {
    const context = canvas.current?.getContext('2d')

    if (!context || !triangles) {
      return
    }

    const ratio = window.devicePixelRatio || 1
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, WIDTH, HEIGHT)
    context.fillStyle = 'currentColor'
    context.fillStyle = getComputedStyle(canvas.current!).color
    context.beginPath()

    for (let i = 0; i + 5 < triangles.length; i += 6) {
      context.moveTo(triangles[i]! * WIDTH, (1 - triangles[i + 1]!) * HEIGHT)
      context.lineTo(triangles[i + 2]! * WIDTH, (1 - triangles[i + 3]!) * HEIGHT)
      context.lineTo(triangles[i + 4]! * WIDTH, (1 - triangles[i + 5]!) * HEIGHT)
      context.closePath()
    }

    context.fill()
  }, [triangles])

  if (!triangles) {
    return null
  }

  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

  return (
    <canvas
      ref={canvas}
      aria-hidden
      width={WIDTH * ratio}
      height={HEIGHT * ratio}
      style={{ width: WIDTH, height: HEIGHT }}
      className="shrink-0"
    />
  )
}
