import { useEffect, useRef } from 'react'

import {
  armTouchGraphicDrag,
  carriesGraphic,
  droppedGraphic,
  GRAPHIC_DROP_EVENT,
  startGraphicDrag,
  touchGraphicDragActive,
  type GraphicDropDetail,
} from '../../lib/graphic-drag'

import { cn } from '../../lib/cn'
import { LANDING_COPY } from '../../lib/landing-copy'
import {
  addLandingStroke,
  LANDING_CAMERA_VIEWS,
  LANDING_PANEL_ASPECT,
  LANDING_SCALE_STEP,
  LANDING_VIEW_LABEL,
  LANDING_VIEW_PANEL,
  latestLandingGraphicId,
  padToSketch,
  removeLandingGraphic,
  scaleLandingGraphic,
  stampLandingGraphic,
} from '../../lib/landing-demo'
import { useLandingDemoStore } from '../../lib/landing-demo-store'
import { INK_COLORS } from '../../lib/paint-colors'

const COPY = LANDING_COPY.hero

/**
 * Literal classes (no inline style, which the CSP blocks in static HTML):
 * Tailwind only generates what it can read here. Each must carry its ink's
 * INK_COLORS value; src/lib/landing.test.ts holds them together.
 */
export const INK_SWATCH_CLASS: Record<string, string> = {
  ink: 'bg-[#1a1c22]',
  oxblood: 'bg-[#6b1d2a]',
  brass: 'bg-[#c4a15a]',
  meadow: 'bg-[#6b7c4a]',
  blush: 'bg-[#e8c4b8]',
}

export const HERO_INKS = INK_COLORS.filter((color) => color.id in INK_SWATCH_CLASS)

/**
 * Three marks from the graphics library, named here rather than read from
 * the catalogue so the landing page's first load doesn't carry it.
 * src/lib/landing.test.ts checks they match the library.
 */
export const HERO_GRAPHICS = [
  { id: 'cross-gothic', label: 'Gothic Cross' },
  { id: 'flame-rise', label: 'Rising Flame' },
  { id: 'logo-crown', label: 'Crown' },
].map((graphic) => ({ ...graphic, src: `/graphics/${graphic.id}.svg` }))

const chip =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border font-body text-xs transition-colors'

const chipState = (on: boolean) =>
  on
    ? 'border-flv-accent bg-flv-accent text-white'
    : 'border-flv-line bg-white text-flv-muted hover:border-flv-ink hover:text-flv-ink'

/** Stamps a graphic and picks it, so it can be moved or resized straight away. */
export function addLandingGraphic(change: Parameters<ReturnType<typeof useLandingDemoStore.getState>['apply']>[0]) {
  const store = useLandingDemoStore.getState()
  const before = store.document ? latestLandingGraphicId({ document: store.document }) : null
  store.apply(change)
  const after = latestLandingGraphicId({ document: useLandingDemoStore.getState().document! })

  if (after && after !== before) {
    store.selectLayer(after)
  }
}

/** The picked logo goes. */
function removeSelectedLogo() {
  const { selectedLayerId, apply, selectLayer } = useLandingDemoStore.getState()

  if (selectedLayerId) {
    apply((previous) => removeLandingGraphic({ document: previous, layerId: selectedLayerId }))
    selectLayer(null)
  }
}

/**
 * The hero's floating tools: draw, pick an ink, drop a graphic, turn the
 * tee. `live` is false in the prerendered HTML, where it is a still picture
 * of the same controls until the app takes over.
 */
export function HeroToolDock({ live }: { live: boolean }) {
  const ink = useLandingDemoStore((state) => state.ink)
  const cameraView = useLandingDemoStore((state) => state.cameraView)
  const side = useLandingDemoStore((state) => state.side)
  const draggingGraphic = useLandingDemoStore((state) => state.draggingGraphic)
  const setDraggingGraphic = useLandingDemoStore((state) => state.setDraggingGraphic)
  const apply = useLandingDemoStore((state) => state.apply)
  const setInk = useLandingDemoStore((state) => state.setInk)
  const setCameraView = useLandingDemoStore((state) => state.setCameraView)
  const requestScene = useLandingDemoStore((state) => state.requestScene)
  const surfaceMode = useLandingDemoStore((state) => state.surfaceMode)
  const setSurfaceMode = useLandingDemoStore((state) => state.setSurfaceMode)
  const selectedLayerId = useLandingDemoStore((state) => state.selectedLayerId)
  const selectedLogo = useLandingDemoStore((state) =>
    state.selectedLayerId && state.document?.layers.some((layer) => layer.id === state.selectedLayerId && layer.kind === 'graphic')
      ? state.selectedLayerId
      : null,
  )
  const points = useRef<{ x: number; y: number }[]>([])
  const drawing = useRef(false)
  const pad = useRef<HTMLCanvasElement | null>(null)
  const cancelTouchDrag = useRef<(() => void) | null>(null)
  // Ink and graphics land on the side being shown (the wearer's sides): the
  // one picked, or the one turned to by hand.
  const view = side
  const panel = LANDING_VIEW_PANEL[view]
  const panelAspect = LANDING_PANEL_ASPECT[panel] ?? 1

  // Delete or Backspace removes the picked logo; Escape lets go of it.
  useEffect(() => {
    if (!live || !selectedLayerId) return

    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null

      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removeSelectedLogo()
      } else if (event.key === 'Escape') {
        useLandingDemoStore.getState().selectLayer(null)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, selectedLayerId])

  // A finger's drop onto the pad (`armTouchGraphicDrag`).
  useEffect(() => {
    const element = pad.current

    if (!live || !element) return
    const target = element

    function onTouchDrop(event: Event) {
      const detail = (event as CustomEvent<GraphicDropDetail>).detail
      detail.handled = true
      dropOnPad(target, detail)
    }

    target.addEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
    return () => target.removeEventListener(GRAPHIC_DROP_EVENT, onTouchDrop)
  })

  useEffect(() => () => cancelTouchDrag.current?.(), [])

  function toUv(event: { currentTarget: HTMLCanvasElement; clientX: number; clientY: number }) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    }
  }

  function paint(canvas: HTMLCanvasElement, segment: { x: number; y: number }[]) {
    const ctx = canvas.getContext('2d')

    if (!ctx || segment.length === 0) {
      return
    }

    ctx.strokeStyle = ink
    // From the pad's height, so the line reads the same at any width or density.
    ctx.lineWidth = Math.max(3, canvas.height * 0.08)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    segment.forEach((point, index) => {
      const [px, py] = [point.x * canvas.width, point.y * canvas.height]
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  }

  /** The pad's pixels match its box at this screen's density, so ink isn't stretched or soft. */
  function fitToBox(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(rect.width * dpr))
    const height = Math.max(1, Math.round(rect.height * dpr))

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  function finishStroke(canvas: HTMLCanvasElement) {
    if (!drawing.current) return
    drawing.current = false
    const stroke = points.current
    points.current = []
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)

    if (stroke.length > 0) {
      const rect = canvas.getBoundingClientRect()
      const padAspect = rect.width / Math.max(1, rect.height)
      apply((previous) => {
        // The pad is the panel's shape, so this is (near enough) one to one.
        const placed = stroke.map((point) => padToSketch({ ...point, padAspect, panelAspect }))
        return addLandingStroke({ document: previous, points: placed, color: ink, width: 18 / 400, tool: 'brush', panel })
      })
    }
  }

  /** A graphic let go over the pad lands at that point of the side's panel. */
  function dropOnPad(canvas: HTMLCanvasElement, { src, clientX, clientY }: { src: string; clientX: number; clientY: number }) {
    const rect = canvas.getBoundingClientRect()
    dropGraphic(src, { ...toUv({ currentTarget: canvas, clientX, clientY }), padAspect: rect.width / Math.max(1, rect.height) })
  }

  function dropGraphic(src: string, at?: { x: number; y: number; padAspect: number }) {
    setDraggingGraphic(false)
    addLandingGraphic((previous) => {
      const point = at ? padToSketch({ x: at.x, y: at.y, padAspect: at.padAspect, panelAspect }) : null
      return stampLandingGraphic({ document: previous, src, panel, ...(point ? { x: point.x, y: point.y } : {}) })
    })
  }

  // The pad takes its panel's shape (`LANDING_PANEL_ASPECT`, from the tee
  // itself), so its ink covers the whole panel. The live pad sets it as a
  // style; the prerendered still can't carry one (the CSP refuses inline
  // styles in the static HTML), so it is drawn about the front's shape.
  const padClass = 'block h-full max-w-full touch-none rounded-xl border border-dashed border-flv-accent/40 bg-flv-soft'

  return (
    <div className="flv-dock flv-panel flex w-full flex-col gap-3 p-3 sm:p-4" data-hero-dock>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-sm text-flv-ink">{COPY.padLabel}</p>
        <p className="font-body text-xs text-flv-muted" aria-live="polite">
          {COPY.padHint[view]}
        </p>
      </div>
      <div className="flex h-36 items-center justify-center" data-pad-panel={panel}>
      {live ? (
        <canvas
          aria-label={`Sketch pad: ${COPY.padHint[view]}`}
          width={300}
          height={112}
          className={cn(padClass, 'cursor-crosshair', {
            'outline-2 outline-offset-2 outline-flv-accent outline-dashed': draggingGraphic,
          })}
          style={{ aspectRatio: String(panelAspect) }}
          ref={pad}
          data-drop-target={draggingGraphic ? '' : undefined}
          onDragOver={(event) => {
            if (carriesGraphic({ dataTransfer: event.dataTransfer })) event.preventDefault()
          }}
          onDrop={(event) => {
            const src = droppedGraphic({ dataTransfer: event.dataTransfer })

            if (!src) return
            event.preventDefault()
            dropOnPad(event.currentTarget, { src, clientX: event.clientX, clientY: event.clientY })
          }}
          onPointerDown={(event) => {
            drawing.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            fitToBox(event.currentTarget)
            points.current = [toUv(event)]
            requestScene()
            paint(event.currentTarget, points.current)
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return
            points.current.push(toUv(event))
            paint(event.currentTarget, points.current.slice(-2))
          }}
          // A cancelled pointer (palm rejection, a system gesture) still lands what was drawn.
          onPointerUp={(event) => finishStroke(event.currentTarget)}
          onPointerCancel={(event) => finishStroke(event.currentTarget)}
          onLostPointerCapture={(event) => finishStroke(event.currentTarget)}
        />
      ) : (
        <div aria-hidden className={cn(padClass, 'aspect-[4/5]')} />
      )}
      </div>

      {selectedLogo ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={COPY.logoSelected} data-logo-selected>
          <p className="mr-auto font-body text-xs text-flv-ink" title={COPY.logoHint}>
            {COPY.logoSelected}
            <span className="sr-only"> {COPY.logoHint}</span>
          </p>
          <button
            type="button"
            onClick={() => apply((previous) => scaleLandingGraphic({ document: previous, layerId: selectedLogo, factor: 1 / LANDING_SCALE_STEP }))}
            className={cn(chip, 'px-3', chipState(false))}
          >
            {COPY.logoSmaller}
          </button>
          <button
            type="button"
            onClick={() => apply((previous) => scaleLandingGraphic({ document: previous, layerId: selectedLogo, factor: LANDING_SCALE_STEP }))}
            className={cn(chip, 'px-3', chipState(false))}
          >
            {COPY.logoLarger}
          </button>
          <button type="button" onClick={removeSelectedLogo} className={cn(chip, 'px-3', chipState(false))}>
            {COPY.logoRemove}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">{COPY.inkLabel}</legend>
          {HERO_INKS.map((color) => (
            <button
              key={color.id}
              type="button"
              aria-label={`${color.name} ink`}
              aria-pressed={ink === color.value}
              onClick={() => setInk(color.value)}
              className="inline-flex size-11 items-center justify-center rounded-full"
            >
              <span
                className={cn('size-7 rounded-full border-2 transition-transform', INK_SWATCH_CLASS[color.id], {
                  'scale-110 border-flv-accent ring-2 ring-flv-accent/30': ink === color.value,
                  'border-white shadow-sm': ink !== color.value,
                })}
              />
            </button>
          ))}
        </fieldset>
        <div className="flex items-center gap-1" role="group" aria-label={COPY.viewsLabel}>
          {LANDING_CAMERA_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={cameraView === view}
              onClick={() => setCameraView(view)}
              className={cn(chip, 'px-2.5', chipState(cameraView === view))}
            >
              {LANDING_VIEW_LABEL[view]}
            </button>
          ))}
        </div>
        {live ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-1" role="group" aria-label={COPY.surfaceLabel}>
              <span aria-hidden className="mr-1 font-body text-xs text-flv-muted">
                {COPY.surfaceLabel}
              </span>
              {(['turn', 'draw'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={surfaceMode === mode}
                  onClick={() => setSurfaceMode(mode)}
                  className={cn(chip, 'px-2.5', chipState(surfaceMode === mode))}
                >
                  {mode === 'turn' ? COPY.surfaceTurn : COPY.surfaceDraw}
                </button>
              ))}
            </div>
            {/* What a finger does on the tee, said where it's chosen. */}
            <p className="hidden w-full font-body text-xs text-flv-muted [@media(pointer:coarse)]:block" aria-live="polite" data-touch-hint>
              {COPY.surfaceTouchHint[surfaceMode]}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-flv-line pt-3">
        <div className="flex flex-col">
          <p className="font-body text-xs text-flv-ink">{COPY.graphicsLabel}</p>
          <p className="font-body text-xs text-flv-muted" data-graphics-caption>
            {COPY.graphicsCaption}
          </p>
        </div>
        <div className="flex gap-1.5">
          {HERO_GRAPHICS.map((asset) => (
            <button
              key={asset.id}
              type="button"
              aria-label={`Add ${asset.label}`}
              title={COPY.graphicsHint}
              draggable
              onDragStart={(event) => {
                startGraphicDrag({ dataTransfer: event.dataTransfer, src: asset.src })
                requestScene()
                setDraggingGraphic(true)
              }}
              onDragEnd={() => setDraggingGraphic(false)}
              // HTML5 drag never starts from a finger: hold the tile, then
              // drag it onto the tee or the pad (`armTouchGraphicDrag`).
              onPointerDown={(event) => {
                if (event.pointerType !== 'touch' || !event.isPrimary) return
                const tile = event.currentTarget
                // The browser's own long-press drag would cancel this one.
                tile.draggable = false
                requestScene()
                cancelTouchDrag.current?.()
                cancelTouchDrag.current = armTouchGraphicDrag({
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  src: asset.src,
                  onLift: () => setDraggingGraphic(true),
                  onEnd: () => {
                    tile.draggable = true
                    cancelTouchDrag.current = null
                    setDraggingGraphic(false)
                  },
                })
              }}
              onContextMenu={(event) => {
                if (touchGraphicDragActive()) event.preventDefault()
              }}
              onClick={() => dropGraphic(asset.src)}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-flv-line bg-white p-1.5 hover:border-flv-accent"
            >
              <img src={asset.src} alt="" width={32} height={32} draggable={false} className="pointer-events-none size-8 object-contain" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
