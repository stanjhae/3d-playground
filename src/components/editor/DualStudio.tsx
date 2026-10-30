import { useEffect, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { showsDualStudio, showsPaintPane } from '../../lib/create-steps'
import { garmentCanPaint } from '../../lib/garments'
import { useEditorStore } from '../../lib/editor-store'
import { dualStudioGridClass } from '../../lib/studio-chrome'
import { useLgUp } from '../../lib/viewport'
import { PaintCanvas } from './PaintCanvas'

export function DualStudio({
  children,
}: {
  children: ReactNode
}) {
  const garmentId = useEditorStore((state) => state.garmentId)
  const createStep = useEditorStore((state) => state.createStep)
  const studioView = useEditorStore((state) => state.studioView)
  const undoLast = useEditorStore((state) => state.undoLast)
  const redoLast = useEditorStore((state) => state.redoLast)
  const lgUp = useLgUp()
  const canPaint = garmentCanPaint({ garmentId })
  const dual = canPaint && showsDualStudio({ step: createStep })
  const paintPane = canPaint && showsPaintPane({ step: createStep })

  useEffect(() => {
    function isTypingTarget({ target }: { target: EventTarget | null }) {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }

    function onKey(event: KeyboardEvent) {
      if (isTypingTarget({ target: event.target })) {
        return
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoLast()
        return
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redoLast()
      }
    }

    function endPaintStroke() {
      const state = useEditorStore.getState()
      state.endStroke()
      state.endLayerEdit()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerup', endPaintStroke)
    window.addEventListener('pointercancel', endPaintStroke)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerup', endPaintStroke)
      window.removeEventListener('pointercancel', endPaintStroke)
    }
  }, [redoLast, undoLast])

  if (!dual) {
    return <div className="relative h-full min-h-80 w-full">{children}</div>
  }

  // Below lg the create route draws the canvas in the page flow instead.
  return (
    <div className={dualStudioGridClass()}>
      {lgUp && paintPane ? (
        <div className="h-full min-h-0">
          <PaintCanvas layout="quad" />
        </div>
      ) : null}
      <div
        className={cn('relative h-full min-h-80', {
          hidden: studioView === 'draw',
          'lg:block': true,
        })}
      >
        {children}
      </div>
    </div>
  )
}
