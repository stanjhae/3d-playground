import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Raycaster, Vector2, type Mesh } from 'three'

import { useEditorStore } from '../../lib/editor-store'
import { carriesGraphic, droppedGraphic } from '../../lib/graphic-drag'
import { uvToPanelPoint } from '../../lib/panel-uv'
import { announce } from '../../lib/studio-announcer'

/**
 * A graphic dragged from the library onto the 3D cloth lands under the
 * pointer, on whichever printable side it was let go over. A drop on a seam
 * or the collar says so instead of doing nothing.
 */
export function ClothDropTarget() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const element = gl.domElement
    const raycaster = new Raycaster()
    const pointer = new Vector2()

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
      const rect = element.getBoundingClientRect()
      pointer.set(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const state = useEditorStore.getState()
      const panelUv = state.document.panelUv
      // Only the nearest surface under the pointer counts, never something
      // behind it, and never the stage's unseen floor.
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((each) => (each.object as Mesh).isMesh && !each.object.userData.stageCatcher)
      // Trim such as the collar never prints (`apply-ink.ts`).
      const printable = hit && hit.object.userData.printable !== false
      // Template-built garments print through their own UV set (`uv1`).
      const uv = printable ? (panelUv ? hit.uv1 : hit.uv) : undefined
      const point = uv ? uvToPanelPoint({ u: uv.x, v: uv.y, rects: panelUv }) : null

      if (point) {
        state.setPaintPanel({ paintPanel: point.panel })
        state.addGraphic({ src, panel: point.panel, x: point.x, y: point.y })
        return
      }

      announce({ message: 'Drop it on a printable side of the garment.' })
    }

    element.addEventListener('dragover', onDragOver)
    element.addEventListener('drop', onDrop)

    return () => {
      element.removeEventListener('dragover', onDragOver)
      element.removeEventListener('drop', onDrop)
    }
  }, [camera, gl, scene])

  return null
}
