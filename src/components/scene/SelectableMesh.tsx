import { Html, Outlines, useCursor } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import { useEffect, useState, type ReactNode } from 'react'
import { type Mesh } from 'three'

import {
  clothDrag,
  clothPaintActive,
  endClothDrag,
  endClothPaint,
  moveClothDragOnUv,
  startClothDrag,
  startClothPaint,
} from '../../lib/cloth-pointer'
import { useEditorStore } from '../../lib/editor-store'
import { acceptsPointer } from '../../lib/palm-rejection'
import { claimDrawingPointer, isOtherPointer } from '../../lib/pointer-owner'
import { showsPaintPane } from '../../lib/create-steps'
import { garmentCanPaint, partLabel } from '../../lib/garment-parts'
import {
  applyLayerEdit,
  hitPlaceableLayer,
  placedType,
} from '../../lib/layer-hit'
import { uvToPanelPoint } from '../../lib/panel-uv'
import { SELECTION_COLOR, meshOutlineVisible } from '../../lib/selection-chrome'

function pointerUv({
  event,
}: {
  event: ThreeEvent<PointerEvent>
}) {
  if (!event.uv) {
    return null
  }

  return { u: event.uv.x, v: event.uv.y }
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
  const moveLayerEdit = useEditorStore((state) => state.moveLayerEdit)
  const endLayerEdit = useEditorStore((state) => state.endLayerEdit)
  const setPaintPanel = useEditorStore((state) => state.setPaintPanel)
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

    window.addEventListener('pointerup', finishClothPointer)
    window.addEventListener('pointercancel', finishClothPointer)

    return () => {
      window.removeEventListener('pointerup', finishClothPointer)
      window.removeEventListener('pointercancel', finishClothPointer)
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

        const uv = pointerUv({ event })

        if (!uv) {
          return
        }

        const point = uvToPanelPoint({ u: uv.u, v: uv.v, rects: panelUv })

        if (!point) {
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

        if (paintTool === 'type') {
          const word = placedType({ typeDraft })

          if (word) {
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
        }

        const hit = hitPlaceableLayer({
          document: liveDocument,
          panel: point.panel,
          x: point.x,
          y: point.y,
        })

        if (hit) {
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

        const uv = pointerUv({ event })

        if (!uv) {
          return
        }

        if (clothDrag()) {
          const edit = moveClothDragOnUv({ u: uv.u, v: uv.v })

          if (!edit) {
            return
          }

          event.stopPropagation()
          event.nativeEvent.preventDefault()
          moveLayerEdit({ edit })
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
      {meshOutlineVisible({ canPick, isSelected, hovered, capturingAngles }) ? (
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
