import { isSafeLayerSrc } from './look-thumbnail'

/** The drag payload a graphic tile carries onto a panel or the cloth. */
export const GRAPHIC_DRAG_TYPE = 'application/x-flv-graphic'

export function startGraphicDrag({
  dataTransfer,
  src,
}: {
  dataTransfer: DataTransfer
  src: string
}) {
  dataTransfer.setData(GRAPHIC_DRAG_TYPE, src)
  dataTransfer.effectAllowed = 'copy'
}

export function carriesGraphic({ dataTransfer }: { dataTransfer: DataTransfer | null }) {
  return Boolean(dataTransfer?.types.includes(GRAPHIC_DRAG_TYPE))
}

/** The dropped graphic's src, or null for anything else or anything unsafe. */
export function droppedGraphic({ dataTransfer }: { dataTransfer: DataTransfer | null }) {
  const src = dataTransfer?.getData(GRAPHIC_DRAG_TYPE) ?? ''
  return src && isSafeLayerSrc({ src }) ? src : null
}

/**
 * A graphic let go by a finger (HTML5 drag never starts from touch): sent
 * to the element under the finger, which sets `handled` if it took it.
 * A 2D panel and the 3D cloth listen for it.
 */
export const GRAPHIC_DROP_EVENT = 'flv-graphic-drop'

export type GraphicDropDetail = { src: string; clientX: number; clientY: number; handled: boolean }

export function dropGraphicAt({ src, clientX, clientY }: { src: string; clientX: number; clientY: number }) {
  const target = document.elementFromPoint(clientX, clientY)

  if (!target || !isSafeLayerSrc({ src })) {
    return false
  }

  const detail: GraphicDropDetail = { src, clientX, clientY, handled: false }
  target.dispatchEvent(new CustomEvent(GRAPHIC_DROP_EVENT, { detail, bubbles: true }))
  return detail.handled
}

/** How long a finger rests on a tile before it lifts the graphic. */
export const LONG_PRESS_MS = 300
/** A finger that moves this far first is scrolling the library. */
const SCROLL_SLOP_PX = 10

let touchDragging = false

/** True while a finger carries a graphic, so the library doesn't scroll under it. */
export function touchGraphicDragActive() {
  return touchDragging
}

/**
 * Touch drag from the library: a finger held on a tile lifts the graphic,
 * a ghost follows the finger, and letting go over a panel or the cloth
 * drops it there (`dropGraphicAt`). Moving before the hold is a scroll.
 * Returns a cancel.
 */
export function armTouchGraphicDrag({
  pointerId,
  clientX,
  clientY,
  src,
  onEnd,
}: {
  pointerId: number
  clientX: number
  clientY: number
  src: string
  onEnd?: ({ dropped }: { dropped: boolean }) => void
}) {
  let ghost: HTMLImageElement | null = null
  const timer = window.setTimeout(lift, LONG_PRESS_MS)

  function place({ x, y }: { x: number; y: number }) {
    // Above the finger, so the finger doesn't hide where it will land.
    ghost?.style.setProperty('transform', `translate(${x - 36}px, ${y - 84}px)`)
  }

  function lift() {
    touchDragging = true
    ghost = document.createElement('img')
    ghost.src = src
    ghost.alt = ''
    ghost.dataset.graphicGhost = ''
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '72px',
      height: '72px',
      objectFit: 'contain',
      opacity: '0.85',
      pointerEvents: 'none',
      zIndex: '70',
      filter: 'drop-shadow(0 4px 8px rgb(0 0 0 / 0.25))',
    })
    document.body.append(ghost)
    place({ x: clientX, y: clientY })
  }

  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }

    if (!ghost) {
      if (Math.hypot(event.clientX - clientX, event.clientY - clientY) > SCROLL_SLOP_PX) {
        finish({ dropped: false })
      }

      return
    }

    event.preventDefault()
    place({ x: event.clientX, y: event.clientY })
  }

  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }

    const carried = ghost !== null
    // The ghost goes first, so the drop finds what is under the finger.
    cleanUp()
    const dropped = carried ? dropGraphicAt({ src, clientX: event.clientX, clientY: event.clientY }) : false
    onEnd?.({ dropped })
  }

  function onCancel(event: PointerEvent) {
    if (event.pointerId === pointerId) {
      finish({ dropped: false })
    }
  }

  function cleanUp() {
    window.clearTimeout(timer)
    ghost?.remove()
    ghost = null
    touchDragging = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
  }

  function finish({ dropped }: { dropped: boolean }) {
    cleanUp()
    onEnd?.({ dropped })
  }

  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  return () => finish({ dropped: false })
}
