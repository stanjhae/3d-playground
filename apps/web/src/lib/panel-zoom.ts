import { create } from 'zustand'

import type { PanelId } from './design-document'

/**
 * Zoom and pan on the flat panels (UX review, 26 Nov: "no zoom on the 2D
 * panels"). A panel's view scales and shifts its canvas inside a fixed
 * frame; the canvas's own box moves with it, so every pointer still maps to
 * panel coordinates the way it always has (`panelFromEvent` reads the
 * canvas's on-screen rect). These are the view's maths, kept DOM-free.
 *
 * Offsets are shares of the frame (the panel's unzoomed box), so a view
 * survives the frame resizing. The canvas's top-left sits at
 * `(x, y) * frame`, and it is `zoom` frames wide and tall.
 */
export type PanelView = { zoom: number; x: number; y: number }

export const FIT_VIEW: PanelView = { zoom: 1, x: 0, y: 0 }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8

/** What − and + step through. */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8] as const

/** A screen point, as a share of the frame from its top-left (0–1 inside it). */
export type FramePoint = { x: number; y: number }

export function clampZoom({ zoom }: { zoom: number }) {
  if (!Number.isFinite(zoom)) {
    return MIN_ZOOM
  }

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** The canvas always covers the frame: no empty margin to pan into. */
export function clampView({ view }: { view: PanelView }): PanelView {
  const zoom = clampZoom({ zoom: view.zoom })
  const least = 1 - zoom
  const fit = (value: number) => (Number.isFinite(value) ? Math.min(0, Math.max(least, value)) : 0) + 0

  return { zoom, x: fit(view.x), y: fit(view.y) }
}

/** Zoom to `zoom`, keeping the panel point under `at` where it is on screen. */
export function zoomAt({ view, zoom, at }: { view: PanelView; zoom: number; at: FramePoint }): PanelView {
  const next = clampZoom({ zoom })
  // The point under `at`, as a share of the canvas.
  const localX = (at.x - view.x) / view.zoom
  const localY = (at.y - view.y) / view.zoom

  return clampView({ view: { zoom: next, x: at.x - localX * next, y: at.y - localY * next } })
}

/** Shift the view by a drag of `dx, dy` (shares of the frame). */
export function panBy({ view, dx, dy }: { view: PanelView; dx: number; dy: number }): PanelView {
  return clampView({ view: { zoom: view.zoom, x: view.x + dx, y: view.y + dy } })
}

/** The next step in or out from the current zoom, about the frame's centre. */
export function stepZoom({ view, direction }: { view: PanelView; direction: 'in' | 'out' }): PanelView {
  const epsilon = 1e-6
  const zoom =
    direction === 'in'
      ? (ZOOM_STEPS.find((step) => step > view.zoom + epsilon) ?? MAX_ZOOM)
      : ([...ZOOM_STEPS].reverse().find((step) => step < view.zoom - epsilon) ?? MIN_ZOOM)

  return zoomAt({ view, zoom, at: { x: 0.5, y: 0.5 } })
}

/**
 * A wheel's zoom: Ctrl/⌘+wheel on a mouse, or a trackpad pinch (which the
 * browser sends as a wheel with Ctrl held). Small trackpad deltas zoom a
 * little, a mouse notch about 10%.
 */
export function wheelZoom({ zoom, deltaY, deltaMode = 0 }: { zoom: number; deltaY: number; deltaMode?: number }) {
  // Lines and pages, as some mice report, in rough pixels.
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  const step = Math.max(-100, Math.min(100, pixels))

  return clampZoom({ zoom: zoom * Math.exp(-step * 0.01) })
}

/**
 * Two fingers zooming and panning together: the panel point under the
 * fingers' first midpoint follows their midpoint, at the spread's zoom.
 * `start` and `now` are the midpoints, as shares of the frame.
 */
export function pinchView({
  view,
  start,
  now,
  scale,
}: {
  view: PanelView
  start: FramePoint
  now: FramePoint
  scale: number
}): PanelView {
  const zoom = clampZoom({ zoom: view.zoom * (Number.isFinite(scale) && scale > 0 ? scale : 1) })
  const localX = (start.x - view.x) / view.zoom
  const localY = (start.y - view.y) / view.zoom

  return clampView({ view: { zoom, x: now.x - localX * zoom, y: now.y - localY * zoom } })
}

/**
 * The panel point under a frame point, in panel space (y up, 0–1), or null
 * off the canvas. The same answer `panelFromEvent` reads off the zoomed
 * canvas's rect: this is its maths, for tests and for the frame's own listeners.
 */
export function panelPointAt({ view, at }: { view: PanelView; at: FramePoint }) {
  const x = (at.x - view.x) / view.zoom
  const y = 1 - (at.y - view.y) / view.zoom

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null
  }

  return { x, y }
}

/** Where a panel point (y up) shows in the frame. */
export function framePointOf({ view, point }: { view: PanelView; point: { x: number; y: number } }): FramePoint {
  return { x: view.x + point.x * view.zoom, y: view.y + (1 - point.y) * view.zoom }
}

/**
 * The canvas's drawing resolution for a zoom: sharper outline and handles up
 * close, in a few steps so a pinch doesn't repaint the shape at every frame.
 */
export function canvasResolution({ zoom }: { zoom: number }) {
  if (zoom >= 2.5) {
    return 3
  }

  return zoom >= 1.5 ? 2 : 1
}

/** The zoom readout: "100%", "150%". */
export function zoomLabel({ zoom }: { zoom: number }) {
  return `${Math.round(zoom * 100)}%`
}

type PanelViewState = {
  views: Partial<Record<PanelId, PanelView>>
  /** Space is held: a press on a panel pans it instead of drawing. */
  spaceHeld: boolean
  setSpaceHeld: (input: { spaceHeld: boolean }) => void
  setView: (input: { panel: PanelId; view: PanelView }) => void
  fit: (input: { panel: PanelId }) => void
  fitAll: () => void
}

/** Each panel keeps its own view while the studio is open; nothing is saved. */
export const usePanelViews = create<PanelViewState>((set) => ({
  views: {},
  spaceHeld: false,
  setSpaceHeld: ({ spaceHeld }) => {
    set({ spaceHeld })
  },
  setView: ({ panel, view }) => {
    set((state) => ({ views: { ...state.views, [panel]: clampView({ view }) } }))
  },
  fit: ({ panel }) => {
    set((state) => ({ views: { ...state.views, [panel]: FIT_VIEW } }))
  },
  fitAll: () => {
    set({ views: {}, spaceHeld: false })
  },
}))

export function panelViewOf({ views, panel }: { views: PanelViewState['views']; panel: PanelId }) {
  return views[panel] ?? FIT_VIEW
}

/**
 * Whether a Space press should hold the pan hand: not while typing, and not
 * on a control Space presses (a button, a link, a checkbox).
 */
export function spaceStartsPan({ target }: { target: unknown }) {
  if (!target || typeof target !== 'object') {
    return true
  }

  const node = target as { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null }
  const tag = node.tagName?.toUpperCase()

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') {
    return false
  }

  if (node.isContentEditable === true) {
    return false
  }

  const role = node.getAttribute?.('role')
  return !role || role === 'img' || role === 'presentation' || role === 'main' || role === 'region' || role === 'application'
}
