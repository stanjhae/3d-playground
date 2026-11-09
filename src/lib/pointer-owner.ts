import { endClothPaint } from './cloth-pointer'
import { useEditorStore } from './editor-store'

/**
 * One pointer owns a drawing gesture, on the panels or on the tee. Without
 * this, a palm lifting while the pen draws ended the pen's stroke, and a
 * second finger started a stroke of its own.
 */
type Owner = { pointerId: number; pointerType: string }

let owner: Owner | null = null

// Listens on window, so the handlers on the panel, the tee and the studio see
// the lift while this pointer still owns the gesture.
function releaseOnLift(event: PointerEvent) {
  if (event.pointerId === owner?.pointerId) {
    resetPointerOwner()
  }
}

function take({ next }: { next: Owner }) {
  owner = next

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerup', releaseOnLift)
    window.addEventListener('pointercancel', releaseOnLift)
  }
}

/**
 * Asks to start a gesture; false means another pointer has it. A pen takes
 * over a finger's stroke, because on a tablet the palm often lands first, and
 * that stroke is dropped as the touch it was.
 */
export function claimDrawingPointer({
  pointerId,
  pointerType,
}: {
  pointerId: number
  pointerType: string
}) {
  if (!owner || owner.pointerId === pointerId) {
    take({ next: { pointerId, pointerType } })
    return true
  }

  const state = useEditorStore.getState()

  if (pointerType === 'pen' && owner.pointerType === 'touch' && state.activeStroke) {
    endClothPaint()
    state.cancelStroke({ pointerType: 'touch' })
    take({ next: { pointerId, pointerType } })
    return true
  }

  return false
}

/** True while a different pointer owns the gesture, so this one is ignored. */
export function isOtherPointer({ pointerId }: { pointerId: number }) {
  return owner !== null && owner.pointerId !== pointerId
}

export function resetPointerOwner() {
  owner = null

  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerup', releaseOnLift)
    window.removeEventListener('pointercancel', releaseOnLift)
  }
}
