import { beforeEach, describe, expect, test } from 'vitest'

import {
  FIT_VIEW,
  MAX_ZOOM,
  canvasResolution,
  clampView,
  framePointOf,
  panBy,
  panelPointAt,
  panelViewOf,
  spaceStartsPan,
  pinchView,
  stepZoom,
  usePanelViews,
  wheelZoom,
  zoomAt,
  zoomLabel,
  type PanelView,
} from './panel-zoom'

/** What `panelFromEvent` does: the canvas's on-screen rect, y flipped up. */
function fromZoomedRect({
  frame,
  view,
  clientX,
  clientY,
}: {
  frame: { left: number; top: number; width: number; height: number }
  view: PanelView
  clientX: number
  clientY: number
}) {
  // A CSS `translate(x·100%, y·100%) scale(zoom)` from the top-left corner.
  const rect = {
    left: frame.left + view.x * frame.width,
    top: frame.top + view.y * frame.height,
    width: frame.width * view.zoom,
    height: frame.height * view.zoom,
  }

  return { x: (clientX - rect.left) / rect.width, y: 1 - (clientY - rect.top) / rect.height }
}

describe('clampView', () => {
  test('fit stays put; zoom is held between 1× and 8×', () => {
    expect(clampView({ view: FIT_VIEW })).toEqual(FIT_VIEW)
    expect(clampView({ view: { zoom: 0.2, x: 0.3, y: -0.4 } })).toEqual(FIT_VIEW)
    expect(clampView({ view: { zoom: 40, x: 0, y: 0 } }).zoom).toBe(MAX_ZOOM)
    expect(clampView({ view: { zoom: Number.NaN, x: Number.NaN, y: 0 } })).toEqual(FIT_VIEW)
  })

  test('the canvas always covers the frame', () => {
    expect(clampView({ view: { zoom: 2, x: 0.5, y: -3 } })).toEqual({ zoom: 2, x: 0, y: -1 })
    expect(clampView({ view: { zoom: 4, x: -1.5, y: -2.5 } })).toEqual({ zoom: 4, x: -1.5, y: -2.5 })
  })
})

describe('zoomAt', () => {
  test('the panel point under the cursor stays under it', () => {
    const view = { zoom: 1.5, x: -0.2, y: -0.1 }
    const at = { x: 0.3, y: 0.7 }
    const before = panelPointAt({ view, at })!
    const after = zoomAt({ view, zoom: 3, at })

    expect(after.zoom).toBe(3)
    const moved = panelPointAt({ view: after, at })!
    expect(moved.x).toBeCloseTo(before.x, 10)
    expect(moved.y).toBeCloseTo(before.y, 10)
  })

  test('zooming out to fit near an edge clamps instead of leaving a margin', () => {
    expect(zoomAt({ view: { zoom: 4, x: -3, y: -3 }, zoom: 1, at: { x: 0.9, y: 0.9 } })).toEqual(FIT_VIEW)
  })
})

describe('stepZoom', () => {
  test('steps through 100, 150, 200 … 800% about the centre', () => {
    let view = FIT_VIEW
    const seen: number[] = []

    for (let step = 0; step < 8; step += 1) {
      view = stepZoom({ view, direction: 'in' })
      seen.push(view.zoom)
    }

    expect(seen).toEqual([1.5, 2, 3, 4, 6, 8, 8, 8])
    // The centre stays the centre.
    expect(panelPointAt({ view, at: { x: 0.5, y: 0.5 } })).toEqual({ x: 0.5, y: 0.5 })
    expect(stepZoom({ view: { zoom: 2.4, x: -0.7, y: -0.7 }, direction: 'out' }).zoom).toBe(2)
    expect(stepZoom({ view: FIT_VIEW, direction: 'out' })).toEqual(FIT_VIEW)
  })
})

describe('wheelZoom', () => {
  test('a wheel up zooms in, down zooms out, and lines count as pixels', () => {
    expect(wheelZoom({ zoom: 2, deltaY: -100 })).toBeCloseTo(2 * Math.E, 5)
    expect(wheelZoom({ zoom: 2, deltaY: 10 })).toBeLessThan(2)
    expect(wheelZoom({ zoom: 2, deltaY: -3, deltaMode: 1 })).toBeCloseTo(wheelZoom({ zoom: 2, deltaY: -48 }), 10)
    // A wild delta is one big step, never a jump to the limit's far side.
    expect(wheelZoom({ zoom: 1, deltaY: 10_000 })).toBe(1)
  })
})

describe('panBy and pinchView', () => {
  test('a pan moves the view, within the canvas', () => {
    expect(panBy({ view: { zoom: 2, x: -0.5, y: -0.5 }, dx: 0.2, dy: -0.1 })).toEqual({ zoom: 2, x: -0.3, y: -0.6 })
    expect(panBy({ view: FIT_VIEW, dx: 0.4, dy: 0.4 })).toEqual(FIT_VIEW)
  })

  test('two fingers: the point under their first midpoint follows the midpoint', () => {
    const view = { zoom: 2, x: -0.5, y: -0.5 }
    const start = { x: 0.4, y: 0.5 }
    const now = { x: 0.45, y: 0.52 }
    const under = panelPointAt({ view, at: start })!
    const next = pinchView({ view, start, now, scale: 1.5 })

    expect(next.zoom).toBe(3)
    const followed = panelPointAt({ view: next, at: now })!
    expect(followed.x).toBeCloseTo(under.x, 10)
    expect(followed.y).toBeCloseTo(under.y, 10)
    expect(pinchView({ view, start, now: start, scale: 0 })).toEqual(view)
  })
})

describe('panel coordinates at any zoom', () => {
  const frame = { left: 100, top: 40, width: 360, height: 420 }

  test('the zoomed canvas rect and the view maths agree on the panel point', () => {
    for (const view of [FIT_VIEW, { zoom: 2, x: -0.25, y: -0.75 }, { zoom: 8, x: -3.3, y: -6.1 }]) {
      for (const at of [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.93, y: 0.61 }]) {
        const viaRect = fromZoomedRect({
          frame,
          view,
          clientX: frame.left + at.x * frame.width,
          clientY: frame.top + at.y * frame.height,
        })
        const viaView = panelPointAt({ view, at })!

        expect(viaView.x).toBeCloseTo(viaRect.x, 10)
        expect(viaView.y).toBeCloseTo(viaRect.y, 10)
      }
    }
  })

  test('framePointOf undoes panelPointAt', () => {
    const view = { zoom: 3, x: -1.2, y: -0.4 }
    const point = { x: 0.55, y: 0.7 }
    const shown = framePointOf({ view, point })

    expect(panelPointAt({ view, at: shown })!.x).toBeCloseTo(point.x, 10)
    expect(panelPointAt({ view, at: shown })!.y).toBeCloseTo(point.y, 10)
  })

  test('a 10 px drag covers a tenth as much panel at 10× as at 1×, so snapping stays in screen pixels', () => {
    const at1 = fromZoomedRect({ frame, view: FIT_VIEW, clientX: 300, clientY: 200 })
    const at1b = fromZoomedRect({ frame, view: FIT_VIEW, clientX: 310, clientY: 200 })
    const zoomed = { zoom: 8, x: -3, y: -3 }
    const at8 = fromZoomedRect({ frame, view: zoomed, clientX: 300, clientY: 200 })
    const at8b = fromZoomedRect({ frame, view: zoomed, clientX: 310, clientY: 200 })

    expect((at8b.x - at8.x) * 8).toBeCloseTo(at1b.x - at1.x, 10)
  })

  test('off the canvas is no panel point', () => {
    expect(panelPointAt({ view: FIT_VIEW, at: { x: 1.2, y: 0.5 } })).toBeNull()
  })
})

describe('labels and resolution', () => {
  test('readout and drawing resolution', () => {
    expect(zoomLabel({ zoom: 1 })).toBe('100%')
    expect(zoomLabel({ zoom: 1.4999 })).toBe('150%')
    expect([1, 1.4, 1.5, 2.4, 2.5, 8].map((zoom) => canvasResolution({ zoom }))).toEqual([1, 1, 2, 2, 3, 3])
  })
})

describe('usePanelViews', () => {
  beforeEach(() => {
    usePanelViews.getState().fitAll()
  })

  test('each panel keeps its own clamped view; Fit resets one', () => {
    usePanelViews.getState().setView({ panel: 'left', view: { zoom: 3, x: 1, y: -9 } })
    usePanelViews.getState().setView({ panel: 'front', view: { zoom: 2, x: -0.5, y: -0.5 } })

    expect(panelViewOf({ views: usePanelViews.getState().views, panel: 'left' })).toEqual({ zoom: 3, x: 0, y: -2 })
    usePanelViews.getState().fit({ panel: 'left' })
    expect(panelViewOf({ views: usePanelViews.getState().views, panel: 'left' })).toEqual(FIT_VIEW)
    expect(panelViewOf({ views: usePanelViews.getState().views, panel: 'front' }).zoom).toBe(2)
    expect(panelViewOf({ views: usePanelViews.getState().views, panel: 'back' })).toEqual(FIT_VIEW)
  })
})

describe('spaceStartsPan', () => {
  const el = (tagName: string, role: string | null = null) => ({ tagName, getAttribute: () => role })

  test('Space on the page or a panel pans; on a control or in a field it keeps its own meaning', () => {
    expect(spaceStartsPan({ target: null })).toBe(true)
    expect(spaceStartsPan({ target: el('BODY') })).toBe(true)
    expect(spaceStartsPan({ target: el('CANVAS', 'img') })).toBe(true)
    expect(spaceStartsPan({ target: el('BUTTON') })).toBe(false)
    expect(spaceStartsPan({ target: el('INPUT') })).toBe(false)
    expect(spaceStartsPan({ target: el('DIV', 'checkbox') })).toBe(false)
    expect(spaceStartsPan({ target: { tagName: 'DIV', isContentEditable: true } })).toBe(false)
  })
})
