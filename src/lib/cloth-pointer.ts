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
const holdListeners = new Set<(held: boolean) => void>()

function notifyHold() {
  const held = drag !== null || painting
  for (const listener of holdListeners) {
    listener(held)
  }
}

/**
 * Called the moment the cloth takes a press for ink or a drag (and again when
 * it lets go), so the orbit can stand down in the same event rather than a
 * render later, when the garment has already turned a little.
 */
export function onClothHold(listener: (held: boolean) => void) {
  holdListeners.add(listener)
  return () => {
    holdListeners.delete(listener)
  }
}

export function clothHeld() {
  return drag !== null || painting
}

export function startClothDrag({
  drag: next,
}: {
  drag: ClothDrag
}) {
  painting = false
  drag = next
  notifyHold()
}

export function clothDrag() {
  return drag
}

export function moveClothDragOnUv({
  u,
  v,
  rects,
}: {
  u: number
  v: number
  /** The document's panel rectangles (absent: the tee's). */
  rects?: Parameters<typeof uvOnPanel>[0]['rects']
}): LayerEdit | null {
  if (!drag) {
    return null
  }

  const current = uvOnPanel({
    panel: drag.panel,
    u,
    v,
    rects,
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
  notifyHold()
  return had
}

export function startClothPaint() {
  drag = null
  painting = true
  notifyHold()
}

export function clothPaintActive() {
  return painting
}

export function endClothPaint() {
  const had = painting
  painting = false
  notifyHold()
  return had
}

export function resetClothPointer() {
  drag = null
  painting = false
  notifyHold()
}
