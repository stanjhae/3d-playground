import { create } from 'zustand'

import { useEditorStore } from './editor-store'

/**
 * Guided or Pro (UI plan, Phase 3). Pro shows the expert controls; Guided
 * keeps them out of a first design's way. It changes only what the studio
 * shows, never the document, so a design made in Pro opens intact in
 * Guided. Kept per device: switching on one laptop doesn't follow you yet.
 */
export const PRO_TOOLS_KEY = 'flp-pro-tools'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readProTools({ storage = deviceStorage() }: { storage?: Storage | null } = {}) {
  try {
    return storage?.getItem(PRO_TOOLS_KEY) === 'on'
  } catch {
    return false
  }
}

export function writeProTools({ on, storage = deviceStorage() }: { on: boolean; storage?: Storage | null }) {
  try {
    storage?.setItem(PRO_TOOLS_KEY, on ? 'on' : 'off')
  } catch {
    // A blocked store still switches for this visit.
  }
}

/** The Design step's tools. Each shows its own panel; none changes the design. */
export const DESIGN_TOOLS = ['draw', 'text', 'graphics', 'upload'] as const

export type DesignTool = (typeof DESIGN_TOOLS)[number]

type StudioModeState = {
  pro: boolean
  designTool: DesignTool
  setPro: ({ pro }: { pro: boolean }) => void
  setDesignTool: ({ designTool }: { designTool: DesignTool }) => void
}

export const useStudioMode = create<StudioModeState>((set) => ({
  pro: readProTools(),
  designTool: 'draw',
  setPro: ({ pro }) => {
    writeProTools({ on: pro })
    set({ pro })
  },
  setDesignTool: ({ designTool }) => {
    // Words and pictures are placed and adjusted in the Tech view.
    useEditorStore
      .getState()
      .setDesignEditMode({ designEditMode: designTool === 'draw' ? 'draw' : 'tech' })
    set({ designTool })
  },
}))

/** Where a new design opens: Pro goes straight to drawing. */
export function firstCreateStep({ pro }: { pro: boolean }) {
  return pro ? ('design' as const) : ('select' as const)
}
