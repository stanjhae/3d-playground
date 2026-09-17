import type { PanelId } from './design-document'
import type { LayerEdit } from './layer-hit'
import { clamp01, uvOnPanel } from './panel-uv'

export type ClothDrag = {
  layerId: string
  panel: PanelId
  originX: number
  originY: number
  startX: number
  startY: number
  startScale: number
  startRotation: number
}

let drag: ClothDrag | null = null
let painting = false

export function startClothDrag({
  drag: next,
}: {
  drag: ClothDrag
}) {
  painting = false
  drag = next
}

export function clothDrag() {
  return drag
}

export function moveClothDragOnUv({
  u,
  v,
}: {
  u: number
  v: number
}): LayerEdit | null {
  if (!drag) {
    return null
  }

  const current = uvOnPanel({
    panel: drag.panel,
    u,
    v,
  })

  return {
    layerId: drag.layerId,
    x: clamp01({ value: drag.startX + current.x - drag.originX }),
    y: clamp01({ value: drag.startY + current.y - drag.originY }),
    scale: drag.startScale,
    rotation: drag.startRotation,
  }
}

export function endClothDrag() {
  const had = drag !== null
  drag = null
  return had
}

export function startClothPaint() {
  drag = null
  painting = true
}

export function clothPaintActive() {
  return painting
}

export function endClothPaint() {
  const had = painting
  painting = false
  return had
}

export function resetClothPointer() {
  drag = null
  painting = false
}
