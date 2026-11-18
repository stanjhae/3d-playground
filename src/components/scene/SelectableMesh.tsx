import { Html, Outlines, useCursor } from '@react-three/drei'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import { useEffect, useState, type ReactNode } from 'react'
import { type Mesh, Raycaster, Vector2 } from 'three'

import {
  clothDrag,
  clothPaintActive,
  crossClothDrag,
  endClothDrag,
  endClothPaint,
  moveClothDrag,
  startClothDrag,
  clothGestureActive,
  startClothPaint,
} from '../../lib/cloth-pointer'
import { anchorFromHit, clothDragStep } from '../../lib/cloth-drag-ray'
import { LOCKED_NOTICE, flashNotice } from '../../lib/studio-announcer'
import { useEditorStore } from '../../lib/editor-store'
import { surfaceGesture } from '../../lib/surface-gesture'
import { acceptsPointer } from '../../lib/palm-rejection'
import { claimDrawingPointer, isOtherPointer } from '../../lib/pointer-owner'
import { showsPaintPane } from '../../lib/create-steps'
import { garmentCanPaint, partLabel } from '../../lib/garment-parts'
import {
  applyLayerEdit,
  hitPlaceableLayer,
  placedType,
} from '../../lib/layer-hit'
import { DEFAULT_PANEL_UV, uvToPanelPoint } from '../../lib/panel-uv'
import { SELECTION_COLOR, isOpenClothMesh, meshOutlineVisible } from '../../lib/selection-chrome'

function pointerUv({
  event,
  printUv = false,
}: {
  event: ThreeEvent<PointerEvent>
  /** Template-built garments print through their own UV set (`uv1`). */
  printUv?: boolean
}) {
  const uv = printUv ? event.uv1 : event.uv

  if (!uv || uv.x < 0 || uv.y < 0) {
    return null
  }

  return { u: uv.x, v: uv.y }
}

/** The cloth a drag follows: every printable mesh in the scene now. */
const clothMeshes = new Set<Mesh>()

/**
 * Follows a graphic dragged on the cloth from window pointer moves, so it
 * keeps moving when the pointer leaves the cloth or crosses a strip that
 * doesn't print (`cloth-drag-ray.ts`), and goes to another panel when the
 * drag crosses a seam onto it. Ends with the drag; returns the stop.
 */
function followClothDrag({
  pointerId,
  element,
  camera,
  printUv,
  start,
}: {
  pointerId: number
  element: HTMLElement
  camera: () => Parameters<Raycaster['setFromCamera']>[1]
  printUv: boolean
  start: ThreeEvent<PointerEvent>
}) {
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let anchor = anchorFromHit({ hit: start, printUv })

  // Every move of this pointer comes to the canvas, on or off the garment.
  try {
    element.setPointerCapture(pointerId)
  } catch {
    // A pointer the browser no longer tracks; the window still hears it.
  }

  function onMove(event: PointerEvent) {
    const drag = clothDrag()

    if (event.pointerId !== pointerId) {
      return
    }

    const state = useEditorStore.getState()

    // An undo or redo mid-drag ended the edit: the drag ends with it.
    if (!drag || state.activeLayerEdit?.layerId !== drag.layerId) {
      endClothDrag()
      stop()
      return
    }

    const rect = element.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera())
    const step = clothDragStep({
      hits: raycaster.intersectObjects([...clothMeshes], false),
      ray: raycaster.ray,
      panel: drag.panel,
      anchor,
      printUv,
      rects: state.document.panelUv ?? DEFAULT_PANEL_UV,
    })

    if (step.kind === 'none') {
      return
    }

    anchor = step.anchor
    const edit = step.kind === 'cross' ? crossClothDrag(step) : moveClothDrag(step)

    if (edit) {
      event.preventDefault()
      state.moveLayerEdit({ edit })
    }
  }

  function onEnd(event: PointerEvent) {
    if (event.pointerId === pointerId) {
      stop()
    }
  }

  function stop() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onEnd)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd)
  window.addEventListener('pointercancel', onEnd)
  return stop
}

export function SelectableMesh({
  name,
  mesh,
  children,
  picking = true,
}: {
  name: string
  mesh: Mesh
  children?: ReactNode
  picking?: boolean
}) {
  const mode = useEditorStore((state) => state.mode)
  const selectedMeshName = useEditorStore((state) => state.selectedMeshName)
  const garmentId = useEditorStore((state) => state.garmentId)
  const createStep = useEditorStore((state) => state.createStep)
  const documentState = useEditorStore((state) => state.document)
  const activeLayerEdit = useEditorStore((state) => state.activeLayerEdit)
  const paintTool = useEditorStore((state) => state.paintTool)
  const designTool = useEditorStore((state) => state.designTool)
  const rotateView = useEditorStore((state) => state.rotateView)
  const typeDraft = useEditorStore((state) => state.typeDraft)
  const textFace = useEditorStore((state) => state.textFace)
  const textScale = useEditorStore((state) => state.textScale)
  // Template-built garments carry their own panel rectangles (absent: the tee's).
  const panelUv = useEditorStore((state) => state.document.panelUv)
  const startStroke = useEditorStore((state) => state.startStroke)
  const appendStroke = useEditorStore((state) => state.appendStroke)
  const endStroke = useEditorStore((state) => state.endStroke)
  const cancelStroke = useEditorStore((state) => state.cancelStroke)
  const addText = useEditorStore((state) => state.addText)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const startLayerEdit = useEditorStore((state) => state.startLayerEdit)
  const endLayerEdit = useEditorStore((state) => state.endLayerEdit)
  const setPaintPanel = useEditorStore((state) => state.setPaintPanel)
  const getThree = useThree((state) => state.get)
  const isSelected = Boolean(
    selectedMeshName &&
      (selectedMeshName === name || name.startsWith(`${selectedMeshName}-`)),
  )
  const selectMesh = useEditorStore((state) => state.selectMesh)
  const capturingAngles = useEditorStore((state) => state.capturingAngles)
  const [hovered, setHovered] = useState(false)
  const paintable = garmentCanPaint({ garmentId })
  // A paintable garment is edited only on the Design step; on the others a
  // drag on it turns the view instead of adding ink.
  const canPick = picking && mode === 'design' && (!paintable || showsPaintPane({ step: createStep }))
  const canPaint = canPick && paintable
  const showCaption = canPick && hovered && !name.includes('-') && !canPaint
  const liveDocument = applyLayerEdit({
    document: documentState,
    edit: activeLayerEdit,
  })

  useCursor(canPick && hovered)

  useEffect(() => {
    if (!canPaint) {
      return
    }

    clothMeshes.add(mesh)

    return () => {
      clothMeshes.delete(mesh)
    }
  }, [canPaint, mesh])

  useEffect(() => {
    if (!canPaint) {
      return
    }

    function finishClothPointer(event: PointerEvent) {
      if (isOtherPointer({ pointerId: event.pointerId })) {
        return
      }

      if (endClothDrag()) {
        endLayerEdit()
      }

      if (endClothPaint()) {
        if (event.type === 'pointercancel') {
          cancelStroke({ pointerType: event.pointerType })
        } else {
          endStroke()
        }
      }
    }

    // Losing capture ends the drag as a lift does (the canvas went away).
    const ends = ['pointerup', 'pointercancel', 'lostpointercapture'] as const

    for (const type of ends) {
      window.addEventListener(type, finishClothPointer)
    }

    return () => {
      for (const type of ends) {
        window.removeEventListener(type, finishClothPointer)
      }
    }
  }, [canPaint, cancelStroke, endLayerEdit, endStroke])

  return (
    <primitive
      object={mesh}
      name={name}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!canPick || canPaint) {
          return
        }

        event.stopPropagation()
        selectMesh({ selectedMeshName: name.split('-')[0] ?? name })
      }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        // A resting palm never paints the cloth once a pen has drawn.
        if (!canPaint || !acceptsPointer({ pointerType: event.nativeEvent.pointerType })) {
          return
        }

        const uv = pointerUv({ event, printUv: Boolean(panelUv) })

        if (!uv) {
          return
        }

        const point = uvToPanelPoint({ u: uv.u, v: uv.v, rects: panelUv })

        if (!point) {
          return
        }

        const word = paintTool === 'type' && designTool === 'text' ? placedType({ typeDraft }) : null
        const top = hitPlaceableLayer({
          document: liveDocument,
          panel: point.panel,
          x: point.x,
          y: point.y,
          withLocked: true,
        })
        const locked = top && top.kind !== 'pattern' && top.locked ? top : null
        const hit = locked ? null : top
        const gesture = surfaceGesture({
          designTool,
          wordArmed: Boolean(word),
          hitsLayer: Boolean(top),
          rotatingView: rotateView,
        })

        // Not inking, placing or dragging: leave the press to the orbit so
        // the garment turns instead of collecting stray ink.
        if (gesture === 'none') {
          return
        }

        // The second finger of a pinch or two-finger turn lands here too:
        // the gesture already dropped the first finger's line, so this press
        // must not start another one (a turn left a stroke behind on phones).
        if (clothGestureActive()) {
          return
        }

        // A locked item is selected, says why it stays put, and never takes
        // ink; the press is left to the orbit (W3).
        if (locked) {
          selectLayer({ selectedLayerId: locked.id })
          flashNotice({ message: LOCKED_NOTICE })
          return
        }

        event.stopPropagation()
        event.nativeEvent.preventDefault()

        if (
          !claimDrawingPointer({
            pointerId: event.nativeEvent.pointerId,
            pointerType: event.nativeEvent.pointerType,
          })
        ) {
          return
        }

        setPaintPanel({ paintPanel: point.panel })

        if (gesture === 'place-text' && word) {
          addText({
            content: word,
            panel: point.panel,
            x: point.x,
            y: point.y,
            face: textFace,
            scale: textScale,
          })
          return
        }

        if (gesture === 'drag-layer' && hit) {
          selectLayer({ selectedLayerId: hit.id })
          startClothDrag({
            drag: {
              layerId: hit.id,
              panel: hit.panel,
              originX: point.x,
              originY: point.y,
              startX: hit.x,
              startY: hit.y,
              startScale: hit.scale,
              startRotation: hit.rotation,
            },
          })
          startLayerEdit({
            edit: {
              layerId: hit.id,
              x: hit.x,
              y: hit.y,
              scale: hit.scale,
              rotation: hit.rotation,
            },
          })
          followClothDrag({
            pointerId: event.nativeEvent.pointerId,
            element: getThree().gl.domElement,
            camera: () => getThree().camera,
            printUv: Boolean(panelUv),
            start: event,
          })
          return
        }

        startClothPaint()
        startStroke({
          panel: point.panel,
          point: { x: point.x, y: point.y },
          pressure:
            event.nativeEvent.pressure > 0 &&
            event.nativeEvent.pointerType !== 'mouse'
              ? event.nativeEvent.pressure
              : undefined,
        })
      }}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (
          !canPaint ||
          !acceptsPointer({ pointerType: event.nativeEvent.pointerType }) ||
          isOtherPointer({ pointerId: event.nativeEvent.pointerId })
        ) {
          return
        }

        // A drag is followed from the window (`followClothDrag`), on the cloth or off it.
        if (clothDrag()) {
          event.stopPropagation()
          return
        }

        const uv = pointerUv({ event, printUv: Boolean(panelUv) })

        if (!uv) {
          return
        }

        if (!clothPaintActive() || event.buttons === 0) {
          return
        }

        const point = uvToPanelPoint({ u: uv.u, v: uv.v, rects: panelUv })

        if (!point) {
          return
        }

        event.stopPropagation()
        event.nativeEvent.preventDefault()
        appendStroke({
          point: { x: point.x, y: point.y },
          pressure:
            event.nativeEvent.pressure > 0 &&
            event.nativeEvent.pointerType !== 'mouse'
              ? event.nativeEvent.pressure
              : undefined,
        })
      }}
      onPointerUp={(event: ThreeEvent<PointerEvent>) => {
        if (!canPaint || isOtherPointer({ pointerId: event.nativeEvent.pointerId })) {
          return
        }

        if (endClothDrag()) {
          endLayerEdit()
          return
        }

        if (endClothPaint()) {
          endStroke()
        }
      }}
      onPointerCancel={(event: ThreeEvent<PointerEvent>) => {
        if (!canPaint || isOtherPointer({ pointerId: event.nativeEvent.pointerId })) {
          return
        }

        if (endClothDrag()) {
          endLayerEdit()
        }

        if (endClothPaint()) {
          cancelStroke({ pointerType: event.nativeEvent.pointerType })
        }
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        if (!canPick) {
          return
        }

        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => {
        setHovered(false)
      }}
    >
      {meshOutlineVisible({ canPick, isSelected, hovered, capturingAngles, openCloth: isOpenClothMesh({ name }) }) ? (
        <Outlines color={SELECTION_COLOR} thickness={isSelected ? 0.006 : 0.003} />
      ) : null}
      {showCaption ? (
        <Html center distanceFactor={4} style={{ pointerEvents: 'none' }}>
          <p className="-translate-y-10 font-body text-xs tracking-[0.08em] text-brass uppercase">
            {partLabel({ meshName: name })}
          </p>
        </Html>
      ) : null}
      {children}
    </primitive>
  )
}
