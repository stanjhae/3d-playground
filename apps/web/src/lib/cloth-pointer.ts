import type { PanelId } from './design-document'
import type { LayerEdit } from './layer-hit'
import { clamp01 } from './panel-uv'

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
// Two fingers on the cloth (a pinch or a two-finger turn) hold it too.
let gesturing = false
const holdListeners = new Set<(held: boolean) => void>()

function notifyHold() {
  const held = drag !== null || painting || gesturing
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
  return drag !== null || painting || gesturing
}

/** Whether two fingers hold the cloth (a pinch or a two-finger turn). */
export function clothGestureActive() {
  return gesturing
}

/** A two-finger gesture takes or lets go of the cloth. */
export function holdClothForGesture({ held }: { held: boolean }) {
  gesturing = held
  notifyHold()
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

/**
 * The edit for the pointer at `x`/`y` on the dragged panel (not clamped:
 * off the panel it may run past 0–1), the layer keeping its grab offset and
 * pinned to the panel's edge.
 */
export function moveClothDrag({ x, y }: { x: number; y: number }): LayerEdit | null {
  if (!drag) {
    return null
  }

  return {
    layerId: drag.layerId,
    x: clamp01({ value: drag.startX + x - drag.originX }),
    y: clamp01({ value: drag.startY + y - drag.originY }),
    scale: drag.startScale,
    rotation: drag.startRotation,
    panel: drag.panel,
  }
}

/**
 * The drag crossed a seam onto `panel` at `x`/`y`: the layer goes there,
 * centred under the pointer (panels can face different ways at a seam, so
 * the old grab offset would point the wrong way), and follows from there.
 */
export function crossClothDrag({ panel, x, y }: { panel: PanelId; x: number; y: number }): LayerEdit | null {
  if (!drag) {
    return null
  }

  drag = { ...drag, panel, originX: x, originY: y, startX: clamp01({ value: x }), startY: clamp01({ value: y }) }
  return moveClothDrag({ x, y })
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
  gesturing = false
  notifyHold()
}
