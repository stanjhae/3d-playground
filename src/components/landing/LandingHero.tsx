import { Link } from '@tanstack/react-router'
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-xl flex-col gap-4">
          <div className="flex items-end gap-3">
            <p className="font-display text-5xl leading-none tracking-tight text-flv-accent sm:text-6xl">
              {FLV_COPY.brandMark}
            </p>
            <p className="pb-1 font-body text-[0.65rem] leading-tight tracking-[0.18em] text-flv-ink uppercase">
              Fashion
              <br />
              Leader Vote
            </p>
          </div>
          <h1 className="font-display text-4xl leading-tight text-flv-ink sm:text-5xl lg:text-6xl">
            {FLV_COPY.heroHeadline}{' '}
            <span className="flv-text-gradient">{FLV_COPY.heroHeadlineAccent}</span>
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
              className="flv-cta inline-flex min-h-12 items-center px-6 font-body text-xs tracking-[0.12em] uppercase"
            >
              {FLV_COPY.openStudio} →
            </Link>
            <a
              href="#waitlist"
              className="inline-flex min-h-12 items-center rounded-full border border-flv-ink px-6 font-body text-xs tracking-[0.12em] text-flv-ink uppercase hover:border-flv-accent hover:text-flv-accent"
            >
              {FLV_COPY.joinWaitlist}
            </a>
          </div>
        </div>
        <div className="hidden shrink-0 flex-col gap-2 lg:flex">
          <ConceptPreviewBadge />
          <p className="font-body text-xs tracking-[0.08em] text-flv-muted">
            {FLV_COPY.statWaitlist}
          </p>
        </div>
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
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

        <div className="relative order-1 min-h-96 overflow-hidden rounded-2xl bg-flv-ink lg:order-2 lg:min-h-[28rem]">
          {stage}
          <span className="flv-live-badge absolute top-4 left-1/2 z-10 -translate-x-1/2">
            ⚡ Live 3D Update
          </span>
        </div>

        <aside className="flv-panel order-3 flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-xs tracking-[0.16em] text-flv-accent uppercase">
              {FLV_COPY.suggestionsTitle}
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
            className="flv-cta inline-flex min-h-11 items-center justify-center px-4 font-body text-[0.65rem] tracking-[0.1em] uppercase"
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

      <div className="mx-auto grid w-full max-w-6xl gap-4 border-t border-flv-line pt-6 md:grid-cols-3">
        {[
          {
            title: '01 Three Creative Workflows',
            lead: 'Draw / Suggestions / 3D Preview',
          },
          {
            title: '02 Four-Sided Design',
            lead: 'Front / Back / Left / Right',
          },
          {
            title: '03 Try On. Create Content. Share.',
            lead: 'Your designs. Your community.',
          },
        ].map((item) => (
          <div key={item.title} className="flex flex-col gap-1">
            <p className="font-body text-xs tracking-[0.12em] text-flv-ink uppercase">
              {item.title}
            </p>
            <p className="font-body text-sm text-flv-muted">{item.lead}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
