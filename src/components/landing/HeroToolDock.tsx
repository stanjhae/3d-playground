import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '../../lib/cn'
import { GRAPHIC_ASSETS } from '../../lib/graphics-library'
import { LANDING_COPY } from '../../lib/landing-copy'
import { addLandingStroke, LANDING_CAMERA_VIEWS, stampLandingGraphic } from '../../lib/landing-demo'
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

export const HERO_GRAPHICS = ['cross-gothic', 'flame-rise', 'logo-crown'].flatMap((id) => {
  const asset = GRAPHIC_ASSETS.find((entry) => entry.id === id)
  return asset ? [asset] : []
})

const VIEW_LABEL: Record<(typeof LANDING_CAMERA_VIEWS)[number], string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
}

const chip =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border font-body text-xs transition-colors'

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
  const points = useRef<{ x: number; y: number }[]>([])
  const drawing = useRef(false)

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
      apply((previous) =>
        addLandingStroke({ document: previous, points: stroke, color: ink, width: 18 / 400, tool: 'brush', panel: 'front' }),
      )
    }
  }

  const padClass =
    'block h-28 w-full touch-none rounded-xl border border-dashed border-flv-accent/40 bg-flv-soft'

  return (
    <div className="flv-dock flv-panel flex w-full flex-col gap-3 p-3 sm:p-4" data-hero-dock>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-sm text-flv-ink">{COPY.padLabel}</p>
        <p className="font-body text-xs text-flv-muted">{COPY.padHint}</p>
      </div>
      {live ? (
        <canvas
          aria-label="Sketch pad: draw on the front of the tee"
          width={300}
          height={112}
          className={cn(padClass, 'cursor-crosshair')}
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
              className={cn(chip, 'px-2.5', {
                'border-flv-accent bg-flv-accent text-white': cameraView === view,
                'border-flv-line bg-white text-flv-muted hover:border-flv-ink hover:text-flv-ink': cameraView !== view,
              })}
            >
              {VIEW_LABEL[view]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-flv-line pt-3" data-claim="concept">
        <p className="font-body text-xs text-flv-muted">{COPY.graphicsLabel}</p>
        <div className="flex gap-1.5">
          {HERO_GRAPHICS.map((asset) => (
            <button
              key={asset.id}
              type="button"
              aria-label={`Add ${asset.label}`}
              onClick={() => apply((previous) => stampLandingGraphic({ document: previous, src: asset.src, panel: 'front' }))}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-flv-line bg-white p-1.5 hover:border-flv-accent"
            >
              <img src={asset.src} alt="" width={32} height={32} className="size-8 object-contain" />
            </button>
          ))}
        </div>
        <ConceptPreviewBadge className="ml-auto" />
      </div>
    </div>
  )
}
