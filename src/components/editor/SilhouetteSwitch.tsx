import { useState } from 'react'

import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import type { GarmentId } from '../../lib/design-schema'
import { resolveGarmentId } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { garmentCanPaint, garmentCredit } from '../../lib/garments'
import {
  GARMENT_CATEGORIES,
  garmentCategory,
  listGarmentsByCategory,
  type GarmentCategoryId,
} from '../../lib/landing-demo'
import { nextCreateStep } from '../../lib/create-steps'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const SAMPLE_COLORS = [
  '#ffffff',
  '#ff6a3d',
  '#2c2c2c',
  '#f5e6d3',
  '#5c6b4a',
  '#1e2a44',
] as const

const SAMPLE_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const

const FIT_LABEL: Partial<Record<GarmentId, string>> = {
  tee: FLV_COPY.selectFitOversized,
  slip: FLV_COPY.selectFitRelaxed,
  gown: FLV_COPY.selectFitClassic,
  mixed: FLV_COPY.selectFitClassic,
  coat: FLV_COPY.selectFitClassic,
  suit: FLV_COPY.selectFitClassic,
}

function FormGlyph({
  garmentId,
}: {
  garmentId: GarmentId
}) {
  if (garmentId === 'tee') {
    return (
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className="h-12 w-12 fill-current"
      >
        <path d="M16 10 L8 16 L12 20 L16 16 L16 38 L32 38 L32 16 L36 20 L40 16 L32 10 L28 14 L20 14 Z" />
      </svg>
    )
  }

  if (garmentId === 'gown' || garmentId === 'slip') {
    return (
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className="h-12 w-12 fill-current"
      >
        <path d="M20 8 L18 14 L12 40 L36 40 L30 14 L28 8 Z M22 8 L26 8 L26 12 L22 12 Z" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className="h-12 w-12 fill-current"
    >
      <path d="M14 12 L8 18 L12 22 L16 18 L16 40 L32 40 L32 18 L36 22 L40 18 L34 12 L28 16 L20 16 Z" />
    </svg>
  )
}

export function SilhouetteSwitch({
  garmentId,
}: {
  garmentId?: GarmentId
}) {
  const storeId = useEditorStore((state) => state.garmentId)
  const setGarmentId = useEditorStore((state) => state.setGarmentId)
  const applyBaseColor = useEditorStore((state) => state.applyBaseColor)
  const setCreateStep = useEditorStore((state) => state.setCreateStep)
  const createStep = useEditorStore((state) => state.createStep)
  const current = resolveGarmentId({ garmentId: garmentId ?? storeId })
  const credit = garmentCredit({ garmentId: current })
  const canPaint = garmentCanPaint({ garmentId: current })
  const [category, setCategory] = useState<GarmentCategoryId>(
    garmentCategory({ garmentId: current }),
  )
  const [sampleColor, setSampleColor] = useState<string>(SAMPLE_COLORS[0])
  const [sampleSize, setSampleSize] = useState<(typeof SAMPLE_SIZES)[number]>('L')
  const garments = listGarmentsByCategory({ category })
  const selected =
    garments.find((garment) => garment.id === current) ?? garments[0]

  return (
    <div className="flex w-full max-w-full flex-col gap-3 lg:max-w-[min(100%,52rem)]">
      <div className="flex flex-wrap gap-2">
        {GARMENT_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={category === entry.id}
            onClick={() => {
              setCategory(entry.id)
              const first = listGarmentsByCategory({ category: entry.id })[0]
              if (first) {
                setGarmentId({ garmentId: first.id })
              }
            }}
            className={cn(
              'min-h-9 rounded-full border px-3',
              chromeTextClass(),
              {
                'border-flv-accent text-flv-accent': category === entry.id,
                'border-flv-line text-flv-muted hover:text-flv-accent':
                  category !== entry.id,
              },
            )}
          >
            {FLV_COPY[entry.labelKey]}
          </button>
        ))}
      </div>
      {garments.length === 0 ? (
        <p className={chromeMutedClass()}>
          No house forms in this category yet.
        </p>
      ) : (
        <nav
          aria-label="Garment gallery"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {garments.map((garment) => {
            const isCurrent = current === garment.id

            return (
              <button
                key={garment.id}
                type="button"
                aria-pressed={isCurrent ? 'true' : 'false'}
                onClick={() => {
                  setGarmentId({ garmentId: garment.id })
                  setCategory(garmentCategory({ garmentId: garment.id }))
                }}
                className={cn(
                  'relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3',
                  chromeTextClass(),
                  {
                    'border-flv-accent text-flv-accent': isCurrent,
                    'border-flv-line text-flv-muted hover:text-flv-accent':
                      !isCurrent,
                  },
                )}
              >
                {isCurrent ? (
                  <span className="absolute top-2 right-2 text-flv-accent">
                    ✓
                  </span>
                ) : null}
                <FormGlyph garmentId={garment.id} />
                <span>{garment.label}</span>
                <span className="font-body text-[0.55rem] tracking-[0.08em] text-flv-muted normal-case">
                  {FIT_LABEL[garment.id] ?? FLV_COPY.selectFitClassic}
                </span>
              </button>
            )
          })}
        </nav>
      )}
      {selected ? (
        <aside className={railFrameClass()}>
          <p className={chromeKickerClass()}>{FLV_COPY.selectDetails}</p>
          <p className="font-display text-xl text-flv-ink">
            {selected.label} / {FIT_LABEL[selected.id] ?? FLV_COPY.selectFitClassic}
          </p>
          <p className={chromeMutedClass()}>
            {canPaint
              ? 'A modern oversized tee with dropped shoulders and four-sided print panels.'
              : 'Seated Style3D form for color, preview, and publish. Print studio is on the tee.'}
          </p>
          <div className="flex flex-col gap-2">
            <p className={chromeTextClass()}>{FLV_COPY.selectAvailableColors}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={FLV_COPY.selectAvailableColors}>
              {SAMPLE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={sampleColor === color}
                  aria-label={color}
                  onClick={() => {
                    setSampleColor(color)
                    applyBaseColor({ color })
                  }}
                  className={cn('size-9 rounded-full border-2', {
                    'border-flv-accent': sampleColor === color,
                    'border-flv-line': sampleColor !== color,
                  })}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className={chromeTextClass()}>{FLV_COPY.selectSampleSize}</p>
              <ConceptPreviewBadge />
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={FLV_COPY.selectSampleSize}>
              {SAMPLE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={sampleSize === size}
                  onClick={() => {
                    setSampleSize(size)
                  }}
                  className={cn(
                    'min-h-10 min-w-10 border px-2',
                    chromeTextClass(),
                    {
                      'border-flv-accent bg-flv-accent text-white':
                        sampleSize === size,
                      'border-flv-line text-flv-muted': sampleSize !== size,
                    },
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateStep({
                createStep: nextCreateStep({ step: createStep }),
              })
            }}
            className="flv-cta inline-flex min-h-12 items-center justify-center px-4 font-body text-xs tracking-[0.12em] uppercase"
          >
            {FLV_COPY.selectUse} →
          </button>
        </aside>
      ) : null}
      {credit && garments.some((garment) => garment.id === current) ? (
        <p className={cn(chromeMutedClass())}>
          <a
            href={credit.href}
            rel="noopener noreferrer"
            target="_blank"
            className="hover:text-flv-accent"
          >
            {credit.label}
          </a>
          {' · '}
          <a
            href={credit.licenseHref}
            rel="license noopener noreferrer"
            target="_blank"
            className="hover:text-flv-accent"
          >
            {credit.license}
          </a>
        </p>
      ) : null}
    </div>
  )
}
