import { useEffect, useRef, useState } from 'react'

import { useEditorStore } from '../../lib/editor-store'
import {
  clampShapeValue,
  type GarmentShape,
  neutralShapeFor,
  type ShapeField,
  type ShapeSpec,
  shapeValueLabel,
} from '../../lib/garment-shape-params'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'

/** The fields one slider moves: both of the pair (sleeves, legs) while they are mirrored. */
function linkedFields({ field, mirrored, spec }: { field: ShapeField; mirrored: boolean; spec: ShapeSpec }) {
  const pair: readonly ShapeField[] = spec.pair?.fields ?? []
  return mirrored && pair.includes(field) ? pair : [field]
}

function ShapeSlider({
  field,
  label,
  step,
  limits,
  value,
  onPreview,
  onCommit,
}: {
  field: ShapeField
  label: string
  step: number
  limits: { min: number; max: number }
  value: number
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit

  // The native change fires once, on release (or per key press): one undo step.
  useEffect(() => {
    const input = ref.current

    if (!input) {
      return
    }

    const listener = () => commit.current(Number.parseFloat(input.value))
    input.addEventListener('change', listener)
    return () => input.removeEventListener('change', listener)
  }, [])

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className={chromeMutedClass()}>{label}</span>
        <span className={chromeMutedClass()} data-shape-value={field}>
          {shapeValueLabel({ field, value })}
        </span>
      </span>
      <input
        ref={ref}
        type="range"
        name={field}
        aria-label={label}
        min={limits.min}
        max={limits.max}
        step={step}
        value={value}
        onChange={(event) => onPreview(Number.parseFloat(event.target.value))}
        className="w-full accent-flv-accent"
      />
    </label>
  )
}

/**
 * Parametric shape: sliders that deform the garment's real model, the ones
 * its template's shape map offers (`shapeSpecFor`).
 */
export function ShapeRail({ spec }: { spec: ShapeSpec }) {
  const stored = useEditorStore((state) => state.document.shape)
  const preview = useEditorStore((state) => state.shapePreview)
  const previewShape = useEditorStore((state) => state.previewShape)
  const setShape = useEditorStore((state) => state.setShape)
  const shape: GarmentShape = preview ?? stored ?? neutralShapeFor({ spec })
  const value = (field: ShapeField) => shape[field] ?? 0
  const pair = spec.pair
  const [mirrored, setMirrored] = useState(() => !pair || value(pair.fields[0]) === value(pair.fields[1]))

  const patchFor = ({ field, value: next }: { field: ShapeField; value: number }) =>
    Object.fromEntries(
      linkedFields({ field, mirrored, spec }).map((linked) => [linked, clampShapeValue({ field: linked, value: next, spec })]),
    ) as GarmentShape

  return (
    <aside className={railFrameClass()} data-testid="shape-rail">
      <p className={chromeKickerClass()}>{HOUSE_COPY.cut}</p>
      {pair ? (
        <label className={`flex min-h-11 items-center gap-2 ${chromeTextClass()}`}>
          <input
            type="checkbox"
            checked={mirrored}
            onChange={(event) => {
              const next = event.target.checked
              setMirrored(next)

              // Locking evens the pair out to the wearer's left one.
              if (next && value(pair.fields[0]) !== value(pair.fields[1])) {
                setShape({ shape: { [pair.fields[1]]: value(pair.fields[0]) } })
              }
            }}
            className="accent-flv-accent"
          />
          {pair.label}
        </label>
      ) : null}
      {spec.controls
        .filter((control) => !(mirrored && pair && control.field === pair.fields[1]))
        .map((control) => (
          <ShapeSlider
            key={control.field}
            field={control.field}
            label={mirrored && pair && control.field === pair.fields[0] ? pair.together : control.label}
            step={control.step}
            limits={spec.limits[control.field]!}
            value={value(control.field)}
            onPreview={(next) => previewShape({ shape: { ...shape, ...patchFor({ field: control.field, value: next }) } })}
            onCommit={(next) => setShape({ shape: patchFor({ field: control.field, value: next }) })}
          />
        ))}
      <button
        type="button"
        disabled={!stored}
        onClick={() => {
          setShape({ shape: neutralShapeFor({ spec }) })
        }}
        className={`min-h-11 border border-flv-line px-3 text-flv-muted hover:text-flv-accent disabled:opacity-40 ${chromeTextClass()}`}
      >
        Reset shape
      </button>
    </aside>
  )
}
