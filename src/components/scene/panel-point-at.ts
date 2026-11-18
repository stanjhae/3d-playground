import { Raycaster, Vector2, type Camera, type Mesh, type Object3D } from 'three'

import type { PanelId } from '../../lib/design-document'
import { uvToPanelPoint, type UvRect } from '../../lib/panel-uv'

/** The canvas's probe: the printable panel point under a screen point, or null. */
export type PanelPointAt = (clientX: number, clientY: number) => ReturnType<typeof uvToPanelPoint>

/**
 * The printable panel point under a screen point on a garment canvas: the
 * nearest surface only, never something behind it or the stage's unseen
 * floor, and never trim such as the collar (`apply-ink.ts`). Template-built
 * garments print through their own UV set (`uv1`). Shared by the studio's
 * `ClothDropTarget` and the landing hero.
 */
export function createPanelPointAt({
  element,
  camera,
  scene,
  panelUv,
}: {
  element: HTMLElement
  camera: Camera
  scene: Object3D
  /** Read at each call: the document's panel rects, if it has its own. */
  panelUv: () => Record<PanelId, UvRect> | undefined
}): PanelPointAt {
  const raycaster = new Raycaster()
  const pointer = new Vector2()

  return (clientX, clientY) => {
    const rect = element.getBoundingClientRect()
    pointer.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const rects = panelUv()
    const hit = raycaster
      .intersectObjects(scene.children, true)
      .find((each) => (each.object as Mesh).isMesh && !each.object.userData.stageCatcher)
    const printable = hit && hit.object.userData.printable !== false
    const uv = printable ? (rects ? hit.uv1 : hit.uv) : undefined
    return uv && uv.x >= 0 && uv.y >= 0 ? uvToPanelPoint({ u: uv.x, v: uv.y, rects }) : null
  }
}
