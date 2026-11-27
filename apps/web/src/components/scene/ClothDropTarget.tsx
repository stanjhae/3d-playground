import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { useEditorStore } from '../../lib/editor-store'
import { GRAPHIC_DROP_EVENT, type GraphicDropDetail, carriesGraphic, droppedGraphic } from '../../lib/graphic-drag'
import { announce } from '../../lib/studio-announcer'
import { createPanelPointAt, type PanelPointAt } from './panel-point-at'

/**
 * A graphic dragged from the library onto the 3D cloth lands under the
 * pointer, on whichever printable side it was let go over. A drop on a seam
 * or the collar says so instead of doing nothing. Mouse drags arrive as
 * HTML5 drops; a finger's as `GRAPHIC_DROP_EVENT` (`graphic-drag.ts`).
 *
 * The canvas also carries `flvPanelPointAt`, the same lookup, so browser
 * tests can find a panel point on screen.
 */
export function ClothDropTarget() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const element = gl.domElement as HTMLCanvasElement & { flvPanelPointAt?: PanelPointAt }
    const panelPointAt = createPanelPointAt({
      element,
      camera,
      scene,
      panelUv: () => useEditorStore.getState().document.panelUv,
    })

    function place({ src, clientX, clientY }: { src: string; clientX: number; clientY: number }) {
      const point = panelPointAt(clientX, clientY)

      if (point) {
        const state = useEditorStore.getState()
        state.setPaintPanel({ paintPanel: point.panel })
        state.addGraphic({ src, panel: point.panel, x: point.x, y: point.y })
        return
      }

      announce({ message: 'Drop it on a printable side of the garment.' })
    }

    function onDragOver(event: DragEvent) {
      if (carriesGraphic({ dataTransfer: event.dataTransfer })) {
        event.preventDefault()

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy'
        }
      }
    }

    function onDrop(event: DragEvent) {
      const src = droppedGraphic({ dataTransfer: event.dataTransfer })

      if (!src) {
        return
      }

      event.preventDefault()
      place({ src, clientX: event.clientX, clientY: event.clientY })
    }

    function onTouchDrop(event: Event) {
      const detail = (event as CustomEvent<GraphicDropDetail>).detail
      detail.handled = true
      place(detail)
    }

    element.flvPanelPointAt = panelPointAt
    element.addEventListener('dragover', onDragOver)
    element.addEventListener('drop', onDrop)
    element.addEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)

    return () => {
      delete element.flvPanelPointAt
      element.removeEventListener('dragover', onDragOver)
      element.removeEventListener('drop', onDrop)
      element.removeEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
    }
  }, [camera, gl, scene])

  return null
}
