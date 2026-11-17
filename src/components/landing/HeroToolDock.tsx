import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '../../lib/cn'
import { LANDING_COPY } from '../../lib/landing-copy'
import {
  addLandingStroke,
  LANDING_CAMERA_VIEWS,
  LANDING_PANEL_ASPECT,
  LANDING_SCALE_STEP,
  LANDING_VIEW_PANEL,
  latestLandingGraphicId,
  padToSketch,
  removeLandingGraphic,
  scaleLandingGraphic,
  stampLandingGraphic,
} from '../../lib/landing-demo'
import { useLandingDemoStore } from '../../lib/landing-demo-store'
import { INK_COLORS } from '../../lib/paint-colors'
import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'

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

const VIEW_LABEL: Record<(typeof LANDING_CAMERA_VIEWS)[number], string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
}

/**
 * The pad takes its panel's shape (`LANDING_PANEL_ASPECT`), so its ink covers
 * the whole panel. Literal classes for Tailwind; landing-demo.test.ts holds
 * them to the aspects.
 */
export const PAD_ASPECT_CLASS: Record<string, string> = {
  front: 'aspect-[0.628]',
  back: 'aspect-[0.629]',
  left: 'aspect-[1.204]',
  right: 'aspect-[1.398]',
}

/** What a dragged graphic carries: its library path. */
export const GRAPHIC_DRAG_TYPE = 'application/x-flv-graphic'

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
  // Ink and graphics land on the side being shown (the wearer's sides).
  const view = cameraView ?? 'front'
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

  function toUv(event: ReactPointerEvent<HTMLCanvasElement>) {
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

  function dropGraphic(src: string, at?: { x: number; y: number; padAspect: number }) {
    addLandingGraphic((previous) => {
      const point = at ? padToSketch({ x: at.x, y: at.y, padAspect: at.padAspect, panelAspect }) : null
      return stampLandingGraphic({ document: previous, src, panel, ...(point ? { x: point.x, y: point.y } : {}) })
    })
  }

  const padClass = cn(
    'block h-full max-w-full touch-none rounded-xl border border-dashed border-flv-accent/40 bg-flv-soft',
    PAD_ASPECT_CLASS[panel],
  )

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
          className={cn(padClass, 'cursor-crosshair')}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(GRAPHIC_DRAG_TYPE)) event.preventDefault()
          }}
          onDrop={(event) => {
            const src = event.dataTransfer.getData(GRAPHIC_DRAG_TYPE)

            if (!src) return
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            dropGraphic(src, { ...toUv(event as unknown as ReactPointerEvent<HTMLCanvasElement>), padAspect: rect.width / Math.max(1, rect.height) })
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
        <div aria-hidden className={padClass} />
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
              {VIEW_LABEL[view]}
            </button>
          ))}
        </div>
        {/* Touch scrolls the page over the tee and draws on the pad, so only a mouse or pen gets this. */}
        {live ? (
          <div className="hidden items-center gap-1 [@media(pointer:fine)]:flex" role="group" aria-label={COPY.surfaceLabel}>
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
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-flv-line pt-3" data-claim="concept">
        <p className="font-body text-xs text-flv-muted" title={COPY.graphicsHint}>
          {COPY.graphicsLabel}
          <span className="sr-only"> {COPY.graphicsHint}</span>
        </p>
        <div className="flex gap-1.5">
          {HERO_GRAPHICS.map((asset) => (
            <button
              key={asset.id}
              type="button"
              aria-label={`Add ${asset.label}`}
              title={COPY.graphicsHint}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(GRAPHIC_DRAG_TYPE, asset.src)
                event.dataTransfer.effectAllowed = 'copy'
                requestScene()
              }}
              onClick={() => dropGraphic(asset.src)}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-flv-line bg-white p-1.5 hover:border-flv-accent"
            >
              <img src={asset.src} alt="" width={32} height={32} draggable={false} className="pointer-events-none size-8 object-contain" />
            </button>
          ))}
        </div>
        <ConceptPreviewBadge className="ml-auto" />
      </div>
    </div>
  )
}
