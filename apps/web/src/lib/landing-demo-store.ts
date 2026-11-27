import { create } from 'zustand'

import { createCrossFlameDemoDocument } from './cross-flame-demo'
import type { DesignDocument } from './design-document'
import { sideAtAzimuth, type LandingCameraView } from './landing-demo'
import { writeLandingHandoff } from './landing-handoff'
import { INK_COLORS } from './paint-colors'

/** The colour the landing's demo tee is shown in, and handed over in. */
export const LANDING_TEE_COLOR = '#f7f7f7'

let demoDocument: DesignDocument | null = null

/**
 * The untouched demo design, built on first use: every page loads this
 * store (through the landing header), but only the landing's hero needs it.
 */
export function landingDemoDocument() {
  demoDocument ??= createCrossFlameDemoDocument()
  return demoDocument
}

export type LandingSurfaceMode = 'turn' | 'draw'

type LandingDemoState = {
  /** The visitor's design; null until they change the demo. */
  document: DesignDocument | null
  /** The visitor drew or dropped something: only then is it handed over. */
  touched: boolean
  ink: string
  /** A side picked with the view buttons; cleared when the visitor drags the tee round. */
  cameraView: LandingCameraView | null
  /**
   * The side the pad and a dropped graphic land on: the held view, or after
   * a turn by hand the side the camera actually faces (`syncSide`).
   */
  side: LandingCameraView
  /** The visitor turned the tee by hand: the turntable stops for good. */
  handTurned: boolean
  /** A graphic is being dragged from the dock: the drop targets show it. */
  draggingGraphic: boolean
  /** The logo picked on the tee (a layer id of `document`), or none. */
  selectedLayerId: string | null
  /** What a drag on the 3D tee does: turn it, or draw on it. */
  surfaceMode: LandingSurfaceMode
  /** The hero asked for the 3D scene (a touch, a tool, or idle time). */
  wantsScene: boolean
  apply: (change: (previous: DesignDocument) => DesignDocument) => void
  setInk: (ink: string) => void
  setCameraView: (view: LandingCameraView) => void
  /** The visitor turned the tee by hand: no side is held any more. */
  releaseCameraView: () => void
  /** The camera's azimuth after a hand turn (0 = the front), read once a frame. */
  syncSide: (azimuth: number) => void
  setDraggingGraphic: (dragging: boolean) => void
  selectLayer: (layerId: string | null) => void
  setSurfaceMode: (mode: LandingSurfaceMode) => void
  requestScene: () => void
}

/**
 * The landing's one demo design, shared by the hero, the header and the
 * final call to action, so every Start creating hands over the same sketch.
 */
export const useLandingDemoStore = create<LandingDemoState>((set) => ({
  document: null,
  touched: false,
  ink: INK_COLORS[0]!.value,
  cameraView: null,
  side: 'front',
  handTurned: false,
  draggingGraphic: false,
  selectedLayerId: null,
  surfaceMode: 'turn',
  wantsScene: false,
  apply: (change) =>
    set((state) => ({ document: change(state.document ?? landingDemoDocument()), touched: true, wantsScene: true })),
  setInk: (ink) => set({ ink, wantsScene: true }),
  setCameraView: (cameraView) => set({ cameraView, side: cameraView, wantsScene: true }),
  releaseCameraView: () =>
    set((state) => (state.cameraView || !state.handTurned ? { cameraView: null, handTurned: true } : state)),
  syncSide: (azimuth) =>
    set((state) => {
      // A held view says the side itself; before any hand turn, the pad stays on its side.
      if (state.cameraView || !state.handTurned) return state
      const side = sideAtAzimuth({ azimuth, previous: state.side })
      return side === state.side ? state : { side }
    }),
  setDraggingGraphic: (draggingGraphic) =>
    set((state) => (state.draggingGraphic === draggingGraphic ? state : { draggingGraphic })),
  selectLayer: (selectedLayerId) =>
    set((state) => (state.selectedLayerId === selectedLayerId ? state : { selectedLayerId })),
  setSurfaceMode: (surfaceMode) => set({ surfaceMode, wantsScene: true }),
  requestScene: () => set({ wantsScene: true }),
}))

/**
 * Called by every Start creating link: a visitor who sketched takes the
 * sketch into the studio (sign-in keeps the same tab, so it survives).
 */
export function handOffLandingDesign() {
  const { touched, document } = useLandingDemoStore.getState()

  if (!touched || !document) {
    return false
  }

  return writeLandingHandoff({ garmentId: 'tee', document, color: LANDING_TEE_COLOR })
}
