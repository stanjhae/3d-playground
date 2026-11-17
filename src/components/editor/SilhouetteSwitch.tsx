import { useEffect, useId, useState } from 'react'

import { Link } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

import { ComingSoonBadge } from '../ui/ComingSoonBadge'
import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import type { GarmentId } from '../../lib/design-schema'
import { resolveGarmentId } from '../../lib/design-schema'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { CONCEPT_FEATURES } from '../../lib/concept-flags'
import { garmentCanPaint, garmentCredit, garmentPanels, getGarment, printAreas } from '../../lib/garments'
import {
  garmentCategory,
  listGarmentsByCategory,
  listPlannedGarments,
  LOCKED_GARMENT_NOTE,
  pickerCategories,
  sampleSizeMeasurements,
  SAMPLE_SIZE_IDS,
  type GarmentCategoryId,
  type SampleSizeId,
} from '../../lib/landing-demo'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import { RadioGroup } from '../ui/RadioGroup'

const SAMPLE_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Coral', value: '#ff6a3d' },
  { name: 'Charcoal', value: '#2c2c2c' },
  { name: 'Sand', value: '#f5e6d3' },
  { name: 'Olive', value: '#5c6b4a' },
  { name: 'Navy', value: '#1e2a44' },
] as const

const FIT_LABEL: Partial<Record<GarmentId, string>> = {
  tee: FLV_COPY.selectFitClassic,
  slip: FLV_COPY.selectFitRelaxed,
  gown: FLV_COPY.selectFitClassic,
  mixed: FLV_COPY.selectFitClassic,
  coat: FLV_COPY.selectFitClassic,
  suit: FLV_COPY.selectFitClassic,
  hoodie: FLV_COPY.selectFitRelaxed,
  overall: FLV_COPY.selectFitRelaxed,
  tailored: FLV_COPY.selectFitClassic,
  vest: FLV_COPY.selectFitClassic,
  crop: FLV_COPY.selectFitRelaxed,
  dress: FLV_COPY.selectFitClassic,
  trousers: FLV_COPY.selectFitClassic,
}

/** Every fit we mean to offer; each garment has one built so far. */
const FITS = [FLV_COPY.selectFitClassic, FLV_COPY.selectFitRelaxed, 'Slim Fit'] as const

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

  if (garmentId === 'crop') {
    // The tee, cut short.
    return (
      <svg viewBox="0 0 48 48" aria-hidden className="h-12 w-12 fill-current">
        <path d="M16 12 L8 18 L12 22 L16 18 L16 30 L32 30 L32 18 L36 22 L40 18 L32 12 L28 16 L20 16 Z" />
      </svg>
    )
  }

  if (garmentId === 'vest') {
    // Sleeveless, deep armholes, a V front.
    return (
      <svg viewBox="0 0 48 48" aria-hidden className="h-12 w-12 fill-current">
        <path d="M17 8 L24 22 L31 8 L34 10 Q31 18 35 23 L35 40 L13 40 L13 23 Q17 18 14 10 Z" />
      </svg>
    )
  }

  if (garmentId === 'trousers') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden className="h-12 w-12 fill-current">
        <path d="M14 8 L34 8 L37 41 L27 41 L24 19 L21 41 L11 41 Z" />
      </svg>
    )
  }

  if (garmentId === 'gown' || garmentId === 'slip' || garmentId === 'overall' || garmentId === 'dress') {
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

function NewDesignLink() {
  return (
    <Link to="/studio" search={{ new: true }} className="text-flv-accent underline underline-offset-2">
      Start a new design
    </Link>
  )
}

/** Outline glyphs for pieces not built yet. */
function PlannedGlyph({ id }: { id: string }) {
  if (id === 'cap') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden className="h-12 w-12 fill-current">
        <path d="M10 30 Q10 14 24 14 Q38 14 38 30 Z M8 30 L44 30 L44 34 L8 34 Z" />
      </svg>
    )
  }

  if (id === 'tote') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden className="h-12 w-12 fill-current">
        <path d="M12 18 L36 18 L38 42 L10 42 Z M18 18 Q18 8 24 8 Q30 8 30 18 L27 18 Q27 11 24 11 Q21 11 21 18 Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden className="h-12 w-12 fill-current">
      <path d="M11 32 Q11 12 24 12 Q37 12 37 32 Z M9 32 L39 32 L39 38 L9 38 Z" />
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
  const setAvatarMeasurements = useEditorStore(
    (state) => state.setAvatarMeasurements,
  )
  // A saved design keeps its garment (`setGarmentId` ignores a change), so
  // say so instead of letting the picker silently do nothing.
  const locked = useEditorStore((state) => state.cloud !== null)
  const current = resolveGarmentId({ garmentId: garmentId ?? storeId })
  const credit = garmentCredit({ garmentId: current })
  const canPaint = garmentCanPaint({ garmentId: current })
  const [category, setCategory] = useState<GarmentCategoryId>(
    garmentCategory({ garmentId: current }),
  )
  // The garment may arrive after the first render (a saved design loading):
  // the category follows it.
  useEffect(() => {
    setCategory(garmentCategory({ garmentId: current }))
  }, [current])
  const [sampleColor, setSampleColor] = useState<string>(SAMPLE_COLORS[0].value)
  const [sampleSize, setSampleSize] = useState<SampleSizeId>('L')
  const garments = listGarmentsByCategory({ category })
  const planned = listPlannedGarments({ category })
  // Categories with only Coming soon pieces (Accessories) show too, never hidden.
  const categories = pickerCategories()
  const selected =
    garments.find((garment) => garment.id === current) ?? (locked ? undefined : garments[0])
  const lockedNoteId = useId()

  return (
    <div className="flex w-full max-w-full flex-col gap-3">
      {locked ? (
        <p role="note" className="font-body text-sm text-flv-ink">
          This design is a {getGarment({ garmentId: current }).label.toLowerCase()}. {LOCKED_GARMENT_NOTE}{' '}
          <NewDesignLink />
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {categories.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={category === entry.id}
            onClick={() => {
              setCategory(entry.id)
              // A saved design keeps its garment: browsing a category picks nothing.
              const first = locked ? undefined : listGarmentsByCategory({ category: entry.id })[0]
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
      <nav
        aria-label="Garment gallery"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {garments.map((garment) => {
          const isCurrent = current === garment.id
          const isLocked = locked && !isCurrent

          return (
            <div key={garment.id} className="group relative">
              <button
                type="button"
                // Focusable while locked, so a keyboard reaches the reason too.
                aria-disabled={isLocked ? 'true' : undefined}
                aria-describedby={isLocked ? lockedNoteId : undefined}
                aria-pressed={isCurrent ? 'true' : 'false'}
                onClick={() => {
                  if (isLocked) {
                    return
                  }
                  setGarmentId({ garmentId: garment.id })
                  setCategory(garmentCategory({ garmentId: garment.id }))
                }}
                className={cn(
                  'relative flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3',
                  chromeTextClass(),
                  {
                    'border-flv-accent text-flv-accent': isCurrent,
                    'border-flv-line text-flv-muted hover:text-flv-accent': !isCurrent && !isLocked,
                    'cursor-not-allowed border-dashed border-flv-line text-flv-muted': isLocked,
                  },
                )}
              >
                {isCurrent ? (
                  <span className="absolute top-2 right-2 text-flv-accent">
                    ✓
                  </span>
                ) : null}
                {isLocked ? (
                  <Lock aria-label="Locked" className="absolute top-2 right-2 size-3.5 text-flv-muted" />
                ) : null}
                <span className={cn('flex flex-col items-center gap-2', { 'opacity-45': isLocked })}>
                  <FormGlyph garmentId={garment.id} />
                  <span>{garment.label}</span>
                  <span className="font-body text-[0.55rem] tracking-[0.08em] text-flv-muted normal-case">
                    {FIT_LABEL[garment.id] ?? FLV_COPY.selectFitClassic}
                  </span>
                </span>
              </button>
              {isLocked ? (
                <div
                  data-locked-hint
                  className="pointer-events-none invisible absolute inset-x-1 top-full z-20 -mt-2 rounded-lg border border-flv-line bg-flv-paper p-2 font-body text-[0.7rem] leading-snug text-flv-ink normal-case opacity-0 shadow-md transition-opacity group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100"
                >
                  {LOCKED_GARMENT_NOTE} <NewDesignLink />
                </div>
              ) : null}
            </div>
          )
        })}
        {planned.map((piece) => (
          <button
            key={piece.id}
            type="button"
            disabled
            aria-label={`${piece.label}, coming soon`}
            data-planned-garment={piece.id}
            className={cn(
              'relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-flv-line px-3 py-3 text-flv-muted',
              chromeTextClass(),
            )}
          >
            <span className="opacity-60">
              <PlannedGlyph id={piece.id} />
            </span>
            <span className="opacity-60">{piece.label}</span>
            <ComingSoonBadge />
          </button>
        ))}
      </nav>
      {/* The locked tiles' reason, for screen readers (aria-describedby). */}
      {locked ? (
        <p id={lockedNoteId} className="sr-only">
          {LOCKED_GARMENT_NOTE}
        </p>
      ) : null}
      {selected ? (
        <aside className={railFrameClass()}>
          <p className={chromeKickerClass()}>{FLV_COPY.selectDetails}</p>
          <p className="font-display text-xl text-flv-ink">
            {selected.label} / {FIT_LABEL[selected.id] ?? FLV_COPY.selectFitClassic}
          </p>
          <p className={chromeMutedClass()}>
            {!canPaint
              ? 'Seated Style3D form for color, preview, and publish. Print studio is on the tee.'
              : selected.id === 'tee'
                ? 'A crew-neck, short-sleeve tee with four print areas: front, back and both sleeves.'
                : `${garmentPanels({ garmentId: selected.id }).length} print areas: ${printAreas({ garmentId: selected.id })}.`}
          </p>
          <div className="flex flex-col gap-2">
            <p className={chromeTextClass()}>Fit</p>
            <RadioGroup className="flex flex-wrap gap-2" aria-label="Fit">
              {FITS.map((fit) => {
                const built = fit === (FIT_LABEL[selected.id] ?? FLV_COPY.selectFitClassic)

                return (
                  <button
                    key={fit}
                    type="button"
                    role="radio"
                    aria-checked={built}
                    disabled={!built}
                    className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border px-3', chromeTextClass(), {
                      'border-flv-accent text-flv-accent': built,
                      'border-flv-line text-flv-muted': !built,
                    })}
                  >
                    {fit}
                    {built ? null : <ComingSoonBadge />}
                  </button>
                )
              })}
            </RadioGroup>
          </div>
          <div className="flex flex-col gap-2">
            <p className={chromeTextClass()}>{FLV_COPY.selectAvailableColors}</p>
            <RadioGroup className="flex flex-wrap gap-2" aria-label={FLV_COPY.selectAvailableColors}>
              {SAMPLE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  role="radio"
                  aria-checked={sampleColor === color.value}
                  aria-label={color.name}
                  title={color.name}
                  onClick={() => {
                    setSampleColor(color.value)
                    applyBaseColor({ color: color.value })
                  }}
                  className={cn('size-11 rounded-full border border-black/10 ring-offset-2 ring-offset-white', {
                    'ring-2 ring-flv-accent': sampleColor === color.value,
                  })}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </RadioGroup>
          </div>
          {CONCEPT_FEATURES ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className={chromeTextClass()}>{FLV_COPY.selectSampleSize}</p>
              <ConceptPreviewBadge />
            </div>
            <RadioGroup className="flex flex-wrap gap-2" aria-label={FLV_COPY.selectSampleSize}>
              {SAMPLE_SIZE_IDS.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={sampleSize === size}
                  onClick={() => {
                    setSampleSize(size)
                    setAvatarMeasurements({
                      measurements: sampleSizeMeasurements({ size }),
                    })
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
            </RadioGroup>
          </div>
          ) : null}
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
