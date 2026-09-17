import { useEffect, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { garmentCanPaint } from '../../lib/garments'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { PaintCanvas } from './PaintCanvas'

export function DualStudio({
  children,
}: {
  children: ReactNode
}) {
  const garmentId = useEditorStore((state) => state.garmentId)
  const studioView = useEditorStore((state) => state.studioView)
  const setStudioView = useEditorStore((state) => state.setStudioView)
  const undoLast = useEditorStore((state) => state.undoLast)
  const redoLast = useEditorStore((state) => state.redoLast)
  const canPaint = garmentCanPaint({ garmentId })

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

  if (!canPaint) {
    return <div className="relative h-full min-h-80 w-full">{children}</div>
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(20rem,1fr)] lg:grid-cols-2">
      <div
        className={cn('min-h-80 h-full', {
          hidden: studioView === 'cloth',
          'lg:block': true,
        })}
      >
        <PaintCanvas />
      </div>
      <div
        className={cn('relative h-full min-h-80', {
          hidden: studioView === 'draw',
          'lg:block': true,
        })}
      >
        {children}
      </div>
      <div className="flex gap-3 px-3 lg:hidden">
        <button
          type="button"
          onClick={() => {
            setStudioView({ studioView: 'draw' })
          }}
          className={cn(
            'min-h-11 flex-1 font-display text-xs tracking-[0.16em] uppercase',
            {
              'text-brass': studioView === 'draw',
              'text-ivory-muted': studioView !== 'draw',
            },
          )}
        >
          {HOUSE_COPY.draw}
        </button>
        <button
          type="button"
          onClick={() => {
            setStudioView({ studioView: 'cloth' })
          }}
          className={cn(
            'min-h-11 flex-1 font-display text-xs tracking-[0.16em] uppercase',
            {
              'text-brass': studioView === 'cloth',
              'text-ivory-muted': studioView !== 'cloth',
            },
          )}
        >
          {HOUSE_COPY.cloth}
        </button>
      </div>
    </div>
  )
}
