import { ArrowRight, Box, Layers, Lock } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { buttonClass } from '../ui/Button'
import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import type { DesignDocument } from '../../lib/design-document'
import type { GarmentId } from '../../lib/design-schema'
import type { HemId, NeckId, SleeveId } from '../../lib/design-document'
import { FLV_COPY } from '../../lib/flv-copy'
import { GRAPHIC_ASSETS } from '../../lib/graphics-library'
import {
  addLandingStroke,
  LANDING_CAMERA_VIEWS,
  stampLandingGraphic,
  type LandingCameraView,
} from '../../lib/landing-demo'
import { writeLandingHandoff } from '../../lib/landing-handoff'
import { INK_COLORS } from '../../lib/paint-colors'

const SUGGESTION_ASSETS = GRAPHIC_ASSETS.filter(
  (asset) => asset.category === 'crosses',
).slice(0, 6)

export function LandingHero({
  stage,
  document,
  cameraView,
  garmentId,
  clothColor,
  neck,
  hem,
  sleeve,
  onDocumentChange,
  onCameraViewChange,
}: {
  stage: ReactNode
  document: DesignDocument
  cameraView: LandingCameraView | null
  garmentId: GarmentId
  clothColor: string
  neck: NeckId
  hem: HemId
  sleeve: SleeveId
  onDocumentChange: ({
    apply,
  }: {
    apply: (previous: DesignDocument) => DesignDocument
  }) => void
  onCameraViewChange: ({
    cameraView,
  }: {
    cameraView: LandingCameraView
  }) => void
}) {
  const [ink, setInk] = useState(INK_COLORS[0]!.value)
  const [brushSize, setBrushSize] = useState(18)
  const [selectedAssetId, setSelectedAssetId] = useState(
    SUGGESTION_ASSETS[0]?.id ?? '',
  )
  const strokePoints = useRef<{ x: number; y: number }[]>([])
  const drawing = useRef(false)

  function pointerToUv({
    event,
  }: {
    event: ReactPointerEvent<HTMLCanvasElement>
  }) {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)

    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / height)),
    }
  }

  function paintPreview({
    canvas,
    points,
    color,
    width,
  }: {
    canvas: HTMLCanvasElement
    points: { x: number; y: number }[]
    color: string
    width: number
  }) {
    const ctx = canvas.getContext('2d')
    if (!ctx || points.length === 0) {
      return
    }

    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, (width / 64) * canvas.width * 0.08)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    points.forEach((point, index) => {
      const px = point.x * canvas.width
      const py = point.y * canvas.height
      if (index === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    })
    ctx.stroke()
  }

  function clearPad({ canvas }: { canvas: HTMLCanvasElement }) {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function persistHandoff() {
    writeLandingHandoff({
      garmentId,
      document,
      color: clothColor,
      neck,
      hem,
      sleeve,
    })
  }

  return (
    <section
      id="product"
      className="relative flex min-h-[min(100dvh,64rem)] flex-col gap-8 px-4 pt-28 pb-10 sm:px-8 lg:px-10 lg:pt-32"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-center">
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-5xl leading-[0.95] text-flv-ink uppercase sm:text-6xl lg:text-[2.9rem]">
            {FLV_COPY.heroHeadline.split('. ').map((line) => (
              <span key={line} className="block">
                {line.endsWith('.') ? line : `${line}.`}
              </span>
            ))}
            <span className="flv-text-gradient block">{FLV_COPY.heroHeadlineAccent}</span>
          </h1>
          <p className="font-body text-base text-flv-muted sm:text-lg">
            Draw freely, refine digitally and see every change instantly on a
            realistic 3D garment.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/create"
              search={{
                garment: garmentId,
                step: 'design',
                color: clothColor,
                neck,
                hem,
                sleeve,
              }}
              onClick={() => {
                persistHandoff()
              }}
              className={cn(buttonClass(), 'min-h-12 px-6')}
            >
              {FLV_COPY.openStudio}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <a href="#waitlist" className={cn(buttonClass({ variant: 'secondary' }), 'min-h-12 px-6')}>
              {FLV_COPY.joinWaitlist}
            </a>
          </div>
        </div>

      <div className="relative grid w-full gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <aside className="flv-panel order-2 flex flex-col gap-3 p-4 lg:order-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.designLayerDraw}
            </p>
            <span className="flv-live-badge">⚡ {FLV_COPY.designLive}</span>
          </div>
          <canvas
            aria-label="Draw on garment"
            className="min-h-40 w-full touch-none rounded-xl bg-flv-soft"
            width={280}
            height={200}
            onPointerDown={(event) => {
              drawing.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              strokePoints.current = [pointerToUv({ event })]
              paintPreview({
                canvas: event.currentTarget,
                points: strokePoints.current,
                color: ink,
                width: brushSize,
              })
            }}
            onPointerMove={(event) => {
              if (!drawing.current) {
                return
              }

              strokePoints.current = [
                ...strokePoints.current,
                pointerToUv({ event }),
              ]
              paintPreview({
                canvas: event.currentTarget,
                points: strokePoints.current.slice(-2),
                color: ink,
                width: brushSize,
              })
            }}
            onPointerUp={(event) => {
              if (!drawing.current) {
                return
              }

              drawing.current = false
              const points = strokePoints.current
              strokePoints.current = []
              clearPad({ canvas: event.currentTarget })

              if (points.length === 0) {
                return
              }

              onDocumentChange({
                apply: (previous) =>
                  addLandingStroke({
                    document: previous,
                    points,
                    color: ink,
                    width: brushSize / 400,
                    tool: 'brush',
                    panel: 'front',
                  }),
              })
            }}
          />
          <div className="flex flex-wrap gap-2">
            {INK_COLORS.slice(0, 5).map((color) => (
              <button
                key={color.id}
                type="button"
                aria-label={color.name}
                aria-pressed={ink === color.value}
                onClick={() => {
                  setInk(color.value)
                }}
                className={cn('size-8 rounded-full border-2', {
                  'border-flv-accent': ink === color.value,
                  'border-flv-line': ink !== color.value,
                })}
                style={{ backgroundColor: color.value }}
              />
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="flex justify-between font-body text-xs text-flv-muted">
              <span>Size</span>
              <span>{brushSize}</span>
            </span>
            <input
              type="range"
              min={4}
              max={48}
              value={brushSize}
              onChange={(event) => {
                setBrushSize(Number(event.target.value))
              }}
              className="accent-[var(--color-flv-accent)]"
            />
          </label>
          <p className="font-body text-xs text-flv-muted">
            {FLV_COPY.designLiveSync}
          </p>
        </aside>

        <div className="relative order-1 min-h-96 overflow-hidden rounded-2xl bg-flv-line/40 lg:order-2 lg:min-h-[28rem]">
          {stage}
          <span className="flv-live-badge absolute top-4 left-1/2 z-10 -translate-x-1/2">
            ⚡ Live 3D Update
          </span>
        </div>

        <aside className="flv-panel order-3 flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.graphicsTitle}
            </p>
            <ConceptPreviewBadge />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SUGGESTION_ASSETS.map((asset) => (
              <button
                key={asset.id}
                type="button"
                aria-pressed={selectedAssetId === asset.id}
                onClick={() => {
                  setSelectedAssetId(asset.id)
                  onDocumentChange({
                    apply: (previous) =>
                      stampLandingGraphic({
                        document: previous,
                        src: asset.src,
                        panel: 'front',
                      }),
                  })
                }}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border bg-white p-2',
                  {
                    'border-flv-accent ring-2 ring-flv-accent/40':
                      selectedAssetId === asset.id,
                    'border-flv-line hover:border-flv-accent':
                      selectedAssetId !== asset.id,
                  },
                )}
              >
                <img
                  src={asset.src}
                  alt={asset.label}
                  className="max-h-full max-w-full object-contain"
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const asset =
                SUGGESTION_ASSETS.find((entry) => entry.id === selectedAssetId) ??
                SUGGESTION_ASSETS[0]
              if (!asset) {
                return
              }

              onDocumentChange({
                apply: (previous) =>
                  stampLandingGraphic({
                    document: previous,
                    src: asset.src,
                    panel: 'front',
                  }),
              })
            }}
            className="flv-cta inline-flex min-h-11 items-center justify-center px-4 font-body text-sm font-medium"
          >
            {FLV_COPY.suggestionsApply}
          </button>
          <div className="mt-auto flex flex-col gap-2 border-t border-flv-line pt-3">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.designLayerPreview}
            </p>
            <div className="grid grid-cols-4 gap-1">
              {LANDING_CAMERA_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={cameraView === view}
                  onClick={() => {
                    onCameraViewChange({ cameraView: view })
                  }}
                  className={cn(
                    'rounded-md border px-1 py-2 text-center font-body text-[0.55rem] tracking-[0.08em] uppercase',
                    {
                      'border-flv-accent text-flv-accent': cameraView === view,
                      'border-flv-line bg-flv-soft text-flv-muted hover:text-flv-accent':
                        cameraView !== view,
                    },
                  )}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-6 border-t border-flv-line pt-8 md:grid-cols-3">
        {[
          { number: '01', icon: Layers, title: 'Three ways to create', lead: 'Draw, add graphics and words, see it in 3D' },
          { number: '02', icon: Box, title: 'Four-sided design', lead: 'Front, back and both sleeves' },
          { number: '03', icon: Lock, title: 'Save and share', lead: 'Private by default. Share a saved version by link.' },
        ].map((item) => (
          <div key={item.title} className="flex items-start gap-4">
            <item.icon aria-hidden className="mt-1 size-8 shrink-0 stroke-[1.25] text-flv-ink" />
            <div className="flex flex-col gap-0.5">
              <p className="font-body text-xs font-medium text-flv-accent">{item.number}</p>
              <p className="font-body text-base font-medium text-flv-ink">{item.title}</p>
              <p className="font-body text-sm text-flv-muted">{item.lead}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
