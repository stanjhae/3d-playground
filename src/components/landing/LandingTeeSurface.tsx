import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'

import {
  clothDrag,
  clothPaintActive,
  endClothDrag,
  endClothPaint,
  moveClothDrag,
  startClothDrag,
  startClothPaint,
} from '../../lib/cloth-pointer'
import type { DesignDocument, PanelId } from '../../lib/design-document'
import { addLandingStroke, updateLandingGraphicTransform } from '../../lib/landing-demo'
import { useLandingDemoStore } from '../../lib/landing-demo-store'
import { LANDING_BRUSH_WIDTH, toSketchPoint } from '../../lib/landing-real-tee'
import { hitPlaceableLayer } from '../../lib/layer-hit'
import { uvOnPanel, uvToPanelPoint } from '../../lib/panel-uv'

export type LiveStroke = { panel: PanelId; points: { x: number; y: number }[]; color: string }

/** A tap moves the pointer no further than this (px) between press and release. */
export const TAP_SLOP = 5

/**
 * The hero tee's own pointer handling, the studio's cloth logic in small:
 * in Turn mode a press on a logo picks it and a drag moves it, and a press
 * anywhere else is left to the orbit; in Draw mode a press anywhere on the
 * cloth draws where the pointer is. Both hold the orbit through `cloth-pointer`, in the same
 * event. Points are hit on the render document and written back to the
 * sketch through `toSketchPoint` (renamed and un-mirrored panels).
 */
export function LandingTeeSurface({
  document,
  onLiveStroke,
  onPress,
  children,
}: {
  /** Told of every press on the tee, so a tap off it can be told apart. */
  onPress: () => void
  /** The render document the tee is drawn from (the hits' space). */
  document: DesignDocument
  onLiveStroke: (stroke: LiveStroke | null) => void
  children: ReactNode
}) {
  const live = useRef<LiveStroke | null>(null)
  // Pointer moves land once a frame: each redraws the tee's print.
  const pending = useRef<(() => void) | null>(null)
  const frame = useRef(0)
  const rects = document.panelUv

  function later(run: () => void) {
    pending.current = run

    if (!frame.current) {
      frame.current = requestAnimationFrame(flush)
    }
  }

  function flush() {
    frame.current = 0
    const run = pending.current
    pending.current = null
    run?.()
  }

  useEffect(() => {
    function finish() {
      // Whatever move is still waiting lands first.
      cancelAnimationFrame(frame.current)
      flush()

      if (endClothDrag()) {
        return
      }

      if (!endClothPaint()) {
        return
      }

      const stroke = live.current
      live.current = null
      onLiveStroke(null)

      if (!stroke || stroke.points.length === 0) {
        return
      }

      const points = stroke.points.map((point) => toSketchPoint({ panel: stroke.panel, ...point }))
      const panel = points[0]!.panel
      useLandingDemoStore.getState().apply((previous) =>
        addLandingStroke({
          document: previous,
          points: points.map(({ x, y }) => ({ x, y })),
          color: stroke.color,
          width: LANDING_BRUSH_WIDTH,
          tool: 'brush',
          panel,
        }),
      )
    }

    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)

    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      endClothDrag()
      endClothPaint()
    }
  }, [onLiveStroke])

  function pointOf(event: ThreeEvent<PointerEvent | MouseEvent>) {
    const uv = event.uv1

    if (!uv || uv.x < 0 || uv.y < 0) {
      return null
    }

    return { uv: { u: uv.x, v: uv.y }, point: uvToPanelPoint({ u: uv.x, v: uv.y, rects }) }
  }

  function logoAt(point: { panel: PanelId; x: number; y: number }) {
    const hit = hitPlaceableLayer({ document, panel: point.panel, x: point.x, y: point.y })
    return hit?.kind === 'graphic' ? hit : null
  }

  return (
    <group
      onPointerDown={(event) => {
        // The nearest cloth only: never a logo on the far side through the tee.
        event.stopPropagation()
        onPress()

        if (event.nativeEvent.button !== 0) {
          return
        }

        const at = pointOf(event)?.point

        if (!at) {
          return
        }

        const state = useLandingDemoStore.getState()
        // Draw mode draws, over logos too; logos are picked in Turn mode.
        const logo = state.surfaceMode === 'draw' ? null : logoAt(at)

        if (logo) {
          event.nativeEvent.preventDefault()
          state.selectLayer(logo.id)
          startClothDrag({
            drag: {
              layerId: logo.id,
              panel: logo.panel,
              originX: at.x,
              originY: at.y,
              startX: logo.x,
              startY: logo.y,
              startScale: logo.scale,
              startRotation: logo.rotation,
            },
          })
          return
        }

        if (state.surfaceMode !== 'draw') {
          return
        }

        event.nativeEvent.preventDefault()
        state.selectLayer(null)
        startClothPaint()
        live.current = { panel: at.panel, points: [{ x: at.x, y: at.y }], color: state.ink }
        onLiveStroke(live.current)
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        const picked = pointOf(event)

        if (!picked) {
          return
        }

        const drag = clothDrag()

        if (drag) {
          const held = clothDrag()
          // The pointer on the dragged panel, as the studio's drag takes it.
          const edit = held ? moveClothDrag(uvOnPanel({ panel: held.panel, u: picked.uv.u, v: picked.uv.v, rects })) : null

          if (!edit) {
            return
          }

          // Written back in the sketch's space: same panel, x un-mirrored.
          const moved = toSketchPoint({ panel: drag.panel, x: edit.x, y: edit.y })
          later(() =>
            useLandingDemoStore.getState().apply((previous) =>
              updateLandingGraphicTransform({ document: previous, layerId: drag.layerId, x: moved.x, y: moved.y }),
            ),
          )
          return
        }

        const stroke = live.current

        // A stroke stays on the panel it started on, as on the pad.
        if (!clothPaintActive() || !stroke || !picked.point || picked.point.panel !== stroke.panel) {
          return
        }

        live.current = { ...stroke, points: [...stroke.points, { x: picked.point.x, y: picked.point.y }] }
        const shown = live.current
        later(() => onLiveStroke(shown))
      }}
      onClick={(event) => {
        event.stopPropagation()
        const at = pointOf(event)?.point

        // A tap on the cloth, off every logo, lets go of the picked one.
        if (event.delta <= TAP_SLOP && (!at || useLandingDemoStore.getState().surfaceMode === 'draw' || !logoAt(at))) {
          useLandingDemoStore.getState().selectLayer(null)
        }
      }}
    >
      {children}
    </group>
  )
}
