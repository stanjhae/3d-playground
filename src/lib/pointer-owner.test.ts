import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clothPaintActive, resetClothPointer, startClothPaint } from './cloth-pointer'
import { useEditorStore } from './editor-store'
import { claimDrawingPointer, isOtherPointer, resetPointerOwner } from './pointer-owner'

const PEN = { pointerId: 2, pointerType: 'pen' }
const FINGER = { pointerId: 7, pointerType: 'touch' }
const SECOND_FINGER = { pointerId: 8, pointerType: 'touch' }

const store = () => useEditorStore.getState()

function startFingerStroke() {
  claimDrawingPointer(FINGER)
  store().startStroke({ panel: 'front', point: { x: 0.2, y: 0.2 } })
}

describe('pointer ownership', () => {
  beforeEach(() => {
    resetPointerOwner()
    resetClothPointer()
    useEditorStore.setState({ activeStroke: null })
  })

  afterEach(() => {
    useEditorStore.setState({ activeStroke: null })
  })

  it('ignores nothing until a pointer claims the gesture', () => {
    expect(isOtherPointer({ pointerId: 99 })).toBe(false)
  })

  it('ignores a palm while the pen owns the gesture', () => {
    expect(claimDrawingPointer(PEN)).toBe(true)
    expect(isOtherPointer({ pointerId: FINGER.pointerId })).toBe(true)
    expect(isOtherPointer({ pointerId: PEN.pointerId })).toBe(false)
  })

  it('refuses a second finger', () => {
    startFingerStroke()
    expect(claimDrawingPointer(SECOND_FINGER)).toBe(false)
    expect(store().activeStroke).not.toBeNull()
  })

  it('lets a pen take over a stroke a palm began, and drops that stroke', () => {
    startFingerStroke()
    startClothPaint()

    expect(claimDrawingPointer(PEN)).toBe(true)
    expect(store().activeStroke).toBeNull()
    expect(clothPaintActive()).toBe(false)
    expect(isOtherPointer({ pointerId: FINGER.pointerId })).toBe(true)
  })

  it('does not let a pen take over a finger that is moving a layer', () => {
    claimDrawingPointer(FINGER)
    expect(claimDrawingPointer(PEN)).toBe(false)
  })

  it('does not let a finger take over from a pen', () => {
    claimDrawingPointer(PEN)
    store().startStroke({ panel: 'front', point: { x: 0.2, y: 0.2 } })

    expect(claimDrawingPointer(FINGER)).toBe(false)
    expect(store().activeStroke).not.toBeNull()
  })
})

describe('a cancelled stroke', () => {
  beforeEach(() => {
    store().reset()
  })

  it('is dropped when it was a touch', () => {
    const before = store().document
    store().startStroke({ panel: 'front', point: { x: 0.2, y: 0.2 } })
    store().cancelStroke({ pointerType: 'touch' })

    expect(store().activeStroke).toBeNull()
    expect(store().document).toBe(before)
  })

  it('is kept when it was a pen, so an interruption loses no drawing', () => {
    const before = store().document
    store().startStroke({ panel: 'front', point: { x: 0.2, y: 0.2 } })
    store().appendStroke({ point: { x: 0.3, y: 0.3 } })
    store().cancelStroke({ pointerType: 'pen' })

    expect(store().activeStroke).toBeNull()
    expect(store().document).not.toBe(before)
  })
})
