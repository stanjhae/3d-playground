import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'

import {
  clothDrag,
  clothHeld,
  clothPaintActive,
  endClothDrag,
  endClothPaint,
  holdClothForGesture,
  moveClothDrag,
  startClothDrag,
  startClothPaint,
  type ClothDrag,
} from '../../lib/cloth-pointer'
import { LONG_PRESS_MS } from '../../lib/graphic-drag'
import { twoFingerChange, type Point } from '../../lib/two-finger'
import type { DesignDocument, PanelId } from '../../lib/design-document'
import { addLandingStroke, updateLandingGraphicTransform } from '../../lib/landing-demo'
import { useLandingDemoStore } from '../../lib/landing-demo-store'
import { LANDING_BRUSH_WIDTH, toSketchPoint } from '../../lib/landing-real-tee'
import { hitPlaceableLayer } from '../../lib/layer-hit'
import { uvOnPanel, uvToPanelPoint } from '../../lib/panel-uv'

export type LiveStroke = { panel: PanelId; points: { x: number; y: number }[]; color: string }

/** A tap moves the pointer no further than this (px) between press and release. */
export const TAP_SLOP = 5
/** A finger resting on a logo may wander this far (px) before the hold becomes a turn. */
const HOLD_SLOP = 10
const TURN_PER_PX = 0.008

type OrbitLike = {
  getAzimuthalAngle: () => number
  getPolarAngle: () => number
  setAzimuthalAngle: (angle: number) => void
  setPolarAngle: (angle: number) => void
  minPolarAngle: number
  maxPolarAngle: number
  update: () => void
}

/** A finger resting on a logo: a tap picks it, a long press lifts it to move. */
type PendingHold = { pointerId: number; x: number; y: number; layerId: string; drag: ClothDrag; timer: number }

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
  onTurn,
  children,
}: {
  /** Told of every press on the tee, so a tap off it can be told apart. */
  onPress: () => void
  /** Two fingers turned the tee by hand. */
  onTurn: () => void
  /** The render document the tee is drawn from (the hits' space). */
  document: DesignDocument
  onLiveStroke: (stroke: LiveStroke | null) => void
  children: ReactNode
}) {
  const live = useRef<LiveStroke | null>(null)
  // Pointer moves land once a frame: each redraws the tee's print.
  const pending = useRef<(() => void) | null>(null)
  const frame = useRef(0)
  const hold = useRef<PendingHold | null>(null)
  // Two fingers are down: no finger starts ink or a drag until all lift.
  const gesturing = useRef(false)
  const rects = document.panelUv
  const element = useThree((state) => state.events.connected as HTMLElement | null | undefined) ?? null
  const controls = useThree((state) => state.controls) as unknown as OrbitLike | null
  const invalidate = useThree((state) => state.invalidate)
  const onTurnRef = useRef(onTurn)
  onTurnRef.current = onTurn

  function dropHold() {
    if (hold.current) {
      window.clearTimeout(hold.current.timer)
      hold.current = null
    }
  }

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

  // Touch: a resting finger on a logo, and two fingers turning the tee.
  useEffect(() => {
    if (!element) return
    const target = element
    const touches = new Map<number, Point>()
    let start: { pair: [Point, Point]; azimuth: number; polar: number } | null = null
    const pair = (): [Point, Point] => {
      const [a, b] = [...touches.values()]
      return [a!, b!]
    }

    function onDown(event: PointerEvent) {
      if (event.pointerType !== 'touch') return
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (touches.size !== 2 || gesturing.current) return
      // Whatever the first finger started stops here: no stray line, no lift.
      gesturing.current = true
      dropHold()
      endClothDrag()

      if (endClothPaint()) {
        live.current = null
        pending.current = null
        onLiveStroke(null)
      }

      holdClothForGesture({ held: true })

      if (controls) {
        start = { pair: pair(), azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() }
        onTurnRef.current()
      }
    }

    function onMove(event: PointerEvent) {
      const pending = hold.current

      if (pending?.pointerId === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > HOLD_SLOP) {
        // It moved before the hold: a turn, left to the orbit.
        dropHold()
      }

      if (!touches.has(event.pointerId)) return
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (touches.size === 2 && start && controls) {
        const change = twoFingerChange({ start: start.pair, now: pair() })
        controls.setAzimuthalAngle(start.azimuth - change.pan.x * TURN_PER_PX)
        controls.setPolarAngle(
          Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, start.polar - change.pan.y * TURN_PER_PX)),
        )
        controls.update()
        invalidate()
      }
    }

    function onUp(event: PointerEvent) {
      const pending = hold.current

      if (pending?.pointerId === event.pointerId) {
        // Let go before the hold: a tap, which picks the logo.
        dropHold()

        if (event.type === 'pointerup' && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= HOLD_SLOP) {
          useLandingDemoStore.getState().selectLayer(pending.layerId)
        }
      }

      if (!touches.delete(event.pointerId)) return

      // The gesture holds the tee until every finger is off, so the one left never jumps the view.
      if (gesturing.current && touches.size === 0) {
        gesturing.current = false
        start = null
        holdClothForGesture({ held: false })
      }
    }

    // A finger moving a logo or drawing never scrolls the page under it
    // (Turn leaves vertical swipes to the page: `touch-action: pan-y`).
    function onTouchMove(event: TouchEvent) {
      if (clothHeld() && event.cancelable) event.preventDefault()
    }

    target.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointermove', onMove, { capture: true })
    window.addEventListener('pointerup', onUp, { capture: true })
    window.addEventListener('pointercancel', onUp, { capture: true })
    target.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      target.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove, { capture: true })
      window.removeEventListener('pointerup', onUp, { capture: true })
      window.removeEventListener('pointercancel', onUp, { capture: true })
      target.removeEventListener('touchmove', onTouchMove)
      dropHold()

      if (gesturing.current) {
        gesturing.current = false
        holdClothForGesture({ held: false })
      }
    }
  }, [controls, element, invalidate, onLiveStroke])

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

        if (event.nativeEvent.button !== 0 || gesturing.current) {
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
          const drag: ClothDrag = {
            layerId: logo.id,
            panel: logo.panel,
            originX: at.x,
            originY: at.y,
            startX: logo.x,
            startY: logo.y,
            startScale: logo.scale,
            startRotation: logo.rotation,
          }

          if (event.nativeEvent.pointerType === 'touch') {
            // A finger on a logo may be starting a turn: a tap picks it, and
            // only a long press lifts it to move (the orbit stands down then).
            dropHold()
            const { pointerId, clientX, clientY } = event.nativeEvent
            hold.current = {
              pointerId,
              x: clientX,
              y: clientY,
              layerId: logo.id,
              drag,
              timer: window.setTimeout(() => {
                const lifted = hold.current
                hold.current = null

                if (lifted && !gesturing.current) {
                  useLandingDemoStore.getState().selectLayer(lifted.layerId)
                  startClothDrag({ drag: lifted.drag })
                }
              }, LONG_PRESS_MS),
            }
            return
          }

          event.nativeEvent.preventDefault()
          state.selectLayer(logo.id)
          startClothDrag({ drag })
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
