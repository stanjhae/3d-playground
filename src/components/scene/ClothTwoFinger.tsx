import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { endClothDrag, endClothPaint, holdClothForGesture } from '../../lib/cloth-pointer'
import { useEditorStore } from '../../lib/editor-store'
import { type Point, pinchedPlacement, twoFingerChange } from '../../lib/two-finger'

type OrbitLike = {
  enabled: boolean
  getAzimuthalAngle: () => number
  getPolarAngle: () => number
  setAzimuthalAngle: (angle: number) => void
  setPolarAngle: (angle: number) => void
  minPolarAngle: number
  maxPolarAngle: number
  update: () => void
}

type Gesture =
  | { kind: 'layer'; start: [Point, Point]; layerId: string; x: number; y: number; scale: number; rotation: number }
  | { kind: 'turn'; start: [Point, Point]; azimuth: number; polar: number }

/** The selected mark the fingers or wheel can resize, if it can be moved. */
function movableSelection() {
  const state = useEditorStore.getState()
  const layer = state.document.layers.find((entry) => entry.id === state.selectedLayerId)

  if (!layer || (layer.kind !== 'graphic' && layer.kind !== 'text' && layer.kind !== 'pattern')) {
    return null
  }

  if (layer.kind !== 'pattern' && layer.locked) {
    return null
  }

  return layer
}

const TURN_PER_PX = 0.008
const WHEEL_SETTLE_MS = 300

/**
 * Two fingers on the 3D garment, on the Design step:
 * - with a mark selected, pinch resizes it and twisting turns it;
 * - otherwise (say, mid-drawing), two fingers turn the garment.
 * Either way the first finger's ink or drag is dropped, so a gesture never
 * leaves a stray line. On a desktop, Ctrl/⌘ + wheel (a trackpad pinch)
 * resizes the selected mark and Alt + wheel turns it.
 */
export function ClothTwoFinger() {
  const gl = useThree((state) => state.gl)
  const controls = useThree((state) => state.controls) as unknown as OrbitLike | null
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const element = gl.domElement
    const touches = new Map<number, Point>()
    let gesture: Gesture | null = null
    let wheelTimer: number | null = null

    const designing = () => {
      const state = useEditorStore.getState()
      return state.mode === 'design' && state.createStep === 'design'
    }

    const pair = (): [Point, Point] => {
      const [a, b] = [...touches.values()]
      return [a!, b!]
    }

    function begin() {
      const state = useEditorStore.getState()
      const start = pair()

      // Whatever the first finger started stops here, unrecorded.
      if (endClothPaint()) {
        state.discardStroke()
      }

      endClothDrag()
      const layer = movableSelection()

      if (layer) {
        // Back from wherever a one-finger drag had moved it.
        state.moveLayerEdit({ edit: { layerId: layer.id, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation } })
        state.startLayerEdit({ edit: { layerId: layer.id, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation } })
        gesture = { kind: 'layer', start, layerId: layer.id, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation }
      } else if (controls && state.designTool === 'draw') {
        // Only Draw holds the view still; with any other tool the orbit's own
        // two-finger zoom is left alone.
        if (state.activeLayerEdit) {
          state.endLayerEdit()
        }

        gesture = { kind: 'turn', start, azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() }
      }

      if (gesture) {
        holdClothForGesture({ held: true })
      }
    }

    function move() {
      if (!gesture) {
        return
      }

      const change = twoFingerChange({ start: gesture.start, now: pair() })

      if (gesture.kind === 'layer') {
        const placed = pinchedPlacement({ scale: gesture.scale, rotation: gesture.rotation, change })
        useEditorStore.getState().moveLayerEdit({ edit: { layerId: gesture.layerId, x: gesture.x, y: gesture.y, ...placed } })
      } else if (controls) {
        controls.setAzimuthalAngle(gesture.azimuth - change.pan.x * TURN_PER_PX)
        controls.setPolarAngle(
          Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, gesture.polar - change.pan.y * TURN_PER_PX)),
        )
        controls.update()
      }

      invalidate()
    }

    function finish() {
      if (gesture?.kind === 'layer') {
        useEditorStore.getState().endLayerEdit()
      }

      gesture = null
      holdClothForGesture({ held: false })
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== 'touch' || !designing()) {
        return
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (touches.size === 2 && !gesture) {
        begin()
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!touches.has(event.pointerId)) {
        return
      }

      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (touches.size === 2) {
        move()
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (!touches.delete(event.pointerId)) {
        return
      }

      if (gesture && touches.size < 2) {
        finish()
      }
    }

    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey || event.altKey) || !designing()) {
        return
      }

      const layer = movableSelection()

      if (!layer) {
        return
      }

      // The wheel resizes or turns the mark instead of zooming the view.
      event.preventDefault()
      event.stopImmediatePropagation()
      const state = useEditorStore.getState()
      const current = state.activeLayerEdit?.layerId === layer.id ? state.activeLayerEdit : null

      if (!current) {
        state.startLayerEdit({ edit: { layerId: layer.id, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation } })
      }

      const base = current ?? { layerId: layer.id, x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation }
      const placed = event.altKey
        ? { scale: base.scale, rotation: base.rotation - event.deltaY * 0.003 }
        : pinchedPlacement({ scale: base.scale, rotation: base.rotation, change: { scale: Math.exp(-event.deltaY * 0.003), turn: 0 } })
      useEditorStore.getState().moveLayerEdit({ edit: { ...base, ...placed } })
      invalidate()

      // One undo step per gesture: commit once the wheel settles.
      if (wheelTimer !== null) {
        window.clearTimeout(wheelTimer)
      }

      wheelTimer = window.setTimeout(() => {
        wheelTimer = null
        useEditorStore.getState().endLayerEdit()
      }, WHEEL_SETTLE_MS)
    }

    element.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('pointermove', onPointerMove, { capture: true })
    window.addEventListener('pointerup', onPointerUp, { capture: true })
    window.addEventListener('pointercancel', onPointerUp, { capture: true })
    element.addEventListener('wheel', onWheel, { capture: true, passive: false })

    return () => {
      element.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onPointerMove, { capture: true })
      window.removeEventListener('pointerup', onPointerUp, { capture: true })
      window.removeEventListener('pointercancel', onPointerUp, { capture: true })
      element.removeEventListener('wheel', onWheel, { capture: true })

      if (wheelTimer !== null) {
        window.clearTimeout(wheelTimer)
        useEditorStore.getState().endLayerEdit()
      }

      if (gesture) {
        holdClothForGesture({ held: false })
      }
    }
  }, [controls, gl, invalidate])

  return null
}
