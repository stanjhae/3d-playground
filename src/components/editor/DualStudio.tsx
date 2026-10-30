import { useEffect, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import {
  showsDesignRails,
  showsDualStudio,
  showsPaintPane,
} from '../../lib/create-steps'
import { garmentCanPaint } from '../../lib/garments'
import { useEditorStore } from '../../lib/editor-store'
import { layerVoice } from '../../lib/layer-hit'
import { layerDeletedMessage } from '../../lib/layer-list'
import { announce } from '../../lib/studio-announcer'
import { studioKeyAction } from '../../lib/studio-keys'
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
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) {
        return
      }

      const state = useEditorStore.getState()
      const layer = state.selectedLayerId
        ? state.document.layers.find((entry) => entry.id === state.selectedLayerId)
        : undefined
      const placeable =
        showsDesignRails({ step: state.createStep }) &&
        (layer?.kind === 'graphic' || layer?.kind === 'text' || layer?.kind === 'pattern')
          ? layer
          : null
      const action = studioKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        target: event.target,
        hasSelection: placeable !== null,
      })

      if (!action) {
        return
      }

      event.preventDefault()

      if (action.type === 'undo') {
        undoLast()
        return
      }

      if (action.type === 'redo') {
        redoLast()
        return
      }

      if (!placeable) {
        return
      }

      if (action.type === 'nudge') {
        state.nudgeLayer({ layerId: placeable.id, dx: action.dx, dy: action.dy })
        return
      }

      if (action.type === 'delete') {
        state.removeLayer({ layerId: placeable.id })
        announce({ message: layerDeletedMessage({ name: layerVoice({ layer: placeable }) }) })
        // Focus was on the deleted row's controls: keep it in the list.
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) {
            document.querySelector<HTMLElement>('[data-layer-control="select"]')?.focus()
          }
        })
        return
      }

      state.selectLayer({ selectedLayerId: null })
      announce({ message: `${layerVoice({ layer: placeable })} deselected.` })
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
