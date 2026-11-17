import { create } from 'zustand'

import { createCrossFlameDemoDocument } from './cross-flame-demo'
import type { DesignDocument } from './design-document'
import type { LandingCameraView } from './landing-demo'
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
  selectedLayerId: null,
  surfaceMode: 'turn',
  wantsScene: false,
  apply: (change) =>
    set((state) => ({ document: change(state.document ?? landingDemoDocument()), touched: true, wantsScene: true })),
  setInk: (ink) => set({ ink, wantsScene: true }),
  setCameraView: (cameraView) => set({ cameraView, wantsScene: true }),
  releaseCameraView: () => set((state) => (state.cameraView ? { cameraView: null } : state)),
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
