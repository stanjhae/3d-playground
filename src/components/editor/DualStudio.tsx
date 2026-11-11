import { useEffect, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import {
  showsDesignRails,
  showsDualStudio,
  showsPaintPane,
} from '../../lib/create-steps'
import { garmentCanPaint, garmentPanels } from '../../lib/garments'
import { hasCopiedLayer, layerPlacement, useEditorStore } from '../../lib/editor-store'
import { layerVoice } from '../../lib/layer-hit'
import { isLockableLayer, isLockedLayer } from '../../lib/design-document'
import {
  layerDeletedMessage,
  layerEdgeMessage,
  layerLockedMessage,
  layerLockMessage,
  layerMovedMessage,
} from '../../lib/layer-list'
import { isOtherPointer } from '../../lib/pointer-owner'
import { announce } from '../../lib/studio-announcer'
import { studioKeyAction } from '../../lib/studio-keys'
import { dualStudioGridClass, studioSceneClass } from '../../lib/studio-chrome'
import { useLgUp } from '../../lib/viewport'
import { CameraPresetBar } from './CameraPresetBar'
import { PaintCanvas } from './PaintCanvas'

const TOOL_NAMES = { brush: 'Brush', eraser: 'Eraser', text: 'Text', graphics: 'Graphics' } as const

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
      const lockable = showsDesignRails({ step: state.createStep }) && isLockableLayer({ layer }) ? layer : null
      const action = studioKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        target: event.target,
        hasSelection: placeable !== null,
        drawing: state.activeStroke !== null,
        canPaste: hasCopiedLayer(),
        inDesign: showsDesignRails({ step: state.createStep }),
        canLock: lockable !== null,
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

      if (action.type === 'cancelStroke') {
        state.discardStroke()
        announce({ message: 'Stroke cancelled.' })
        return
      }

      if (action.type === 'tool') {
        state.setDesignTool({ designTool: action.tool === 'brush' || action.tool === 'eraser' ? 'draw' : action.tool })

        if (action.tool === 'brush' || action.tool === 'eraser') {
          state.setPaintTool({ paintTool: action.tool })
        }

        announce({ message: `${TOOL_NAMES[action.tool]} selected.` })
        return
      }

      if (action.type === 'paste') {
        const before = state.selectedLayerId
        state.pasteLayer()
        const after = useEditorStore.getState()

        if (after.selectedLayerId !== before) {
          const pasted = after.document.layers.find((entry) => entry.id === after.selectedLayerId)
          announce({ message: pasted ? `${layerVoice({ layer: pasted })} pasted.` : 'Pasted.' })
        }
        return
      }

      if (action.type === 'lock') {
        if (lockable) {
          const locked = !isLockedLayer({ layer: lockable })
          state.updateLayer({ layerId: lockable.id, patch: { locked } })
          announce({ message: layerLockMessage({ name: layerVoice({ layer: lockable }), locked }) })
        }
        return
      }

      if (!placeable) {
        return
      }

      // A locked item stays put until it is unlocked (W3); the store refuses
      // these too, so this only says why nothing happened.
      if (
        isLockedLayer({ layer: placeable }) &&
        (action.type === 'nudge' || action.type === 'delete' || action.type === 'arrange')
      ) {
        announce({ message: layerLockedMessage({ name: layerVoice({ layer: placeable }) }) })
        return
      }

      if (action.type === 'duplicate') {
        state.duplicateLayer({ layerId: placeable.id })

        if (useEditorStore.getState().selectedLayerId !== placeable.id) {
          announce({ message: `${layerVoice({ layer: placeable })} duplicated.` })
        }
        return
      }

      if (action.type === 'arrange') {
        const before = layerPlacement({ layerId: placeable.id })
        state.moveLayer({ layerId: placeable.id, direction: action.direction })
        const after = layerPlacement({ layerId: placeable.id })
        const name = layerVoice({ layer: placeable })
        announce({
          message:
            !after || after.index === before?.index
              ? layerEdgeMessage({ name, direction: action.direction })
              : layerMovedMessage({ name, direction: action.direction, placement: after, panelLabel: garmentPanels({ garmentId: state.garmentId }).find((entry) => entry.id === after.panel)?.label ?? after.panel }),
        })
        return
      }

      if (action.type === 'copy') {
        state.copyLayer({ layerId: placeable.id })
        announce({ message: `${layerVoice({ layer: placeable })} copied.` })
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

    function endPaintStroke(event: PointerEvent) {
      if (isOtherPointer({ pointerId: event.pointerId })) {
        return
      }

      const state = useEditorStore.getState()

      if (event.type === 'pointercancel') {
        state.cancelStroke({ pointerType: event.pointerType })
      } else {
        state.endStroke()
      }

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

  // One tree for every step: a different one remounts the 3D canvas and it
  // has to start again. Lay steps out by changing these classes and slots.
  // Below lg the create route draws the canvas in the page flow instead.
  return (
    <div className={dual ? dualStudioGridClass() : studioSceneClass()}>
      {lgUp && paintPane ? (
        <div className="h-full min-h-0" data-hint-anchor="panels">
          <PaintCanvas layout="quad" />
        </div>
      ) : null}
      <div
        className={cn('relative h-full min-h-48 lg:min-h-80', {
          hidden: dual && studioView === 'draw',
          'lg:block': true,
        })}
      >
        {children}
        {/* Turn the tee to check a side while designing, as on the publish step. */}
        {dual && lgUp ? (
          <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-10 flex justify-center">
            <CameraPresetBar />
          </div>
        ) : null}
      </div>
    </div>
  )
}
