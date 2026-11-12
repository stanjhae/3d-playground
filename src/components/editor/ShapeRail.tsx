import { useEffect, useRef, useState } from 'react'

import { shapeOf } from '../../lib/canonical-document'
import { useEditorStore } from '../../lib/editor-store'
import {
  clampShapeValue,
  type GarmentShape,
  SHAPE_CONTROLS,
  SHAPE_LIMITS,
  type ShapeField,
  shapeValueLabel,
} from '../../lib/garment-shape-params'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'

const SLEEVES: readonly ShapeField[] = ['leftSleeveLength', 'rightSleeveLength']

/** The fields one slider moves: both sleeves while they are mirrored. */
function linkedFields({ field, mirrored }: { field: ShapeField; mirrored: boolean }) {
  return mirrored && SLEEVES.includes(field) ? SLEEVES : [field]
}

function ShapeSlider({
  field,
  label,
  step,
  value,
  onPreview,
  onCommit,
}: {
  field: ShapeField
  label: string
  step: number
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
        min={SHAPE_LIMITS[field].min}
        max={SHAPE_LIMITS[field].max}
        step={step}
        value={value}
        onChange={(event) => onPreview(Number.parseFloat(event.target.value))}
        className="w-full accent-flv-accent"
      />
    </label>
  )
}

/** Parametric shape v1: sliders that deform the real tee (template v4). */
export function ShapeRail() {
  const stored = useEditorStore((state) => state.document.shape)
  const preview = useEditorStore((state) => state.shapePreview)
  const previewShape = useEditorStore((state) => state.previewShape)
  const setShape = useEditorStore((state) => state.setShape)
  const shape: GarmentShape = preview ?? shapeOf({ document: { shape: stored } })
  const [mirrored, setMirrored] = useState(() => shape.leftSleeveLength === shape.rightSleeveLength)

  const patchFor = ({ field, value }: { field: ShapeField; value: number }) =>
    Object.fromEntries(
      linkedFields({ field, mirrored }).map((linked) => [linked, clampShapeValue({ field: linked, value })]),
    ) as Partial<GarmentShape>

  return (
    <aside className={railFrameClass()} data-testid="shape-rail">
      <p className={chromeKickerClass()}>{HOUSE_COPY.cut}</p>
      <label className={`flex min-h-11 items-center gap-2 ${chromeTextClass()}`}>
        <input
          type="checkbox"
          checked={mirrored}
          onChange={(event) => {
            const next = event.target.checked
            setMirrored(next)

            // Locking evens the sleeves out to the wearer's left one.
            if (next && shape.leftSleeveLength !== shape.rightSleeveLength) {
              setShape({ shape: { rightSleeveLength: shape.leftSleeveLength } })
            }
          }}
          className="accent-flv-accent"
        />
        Mirror sleeves
      </label>
      {SHAPE_CONTROLS.filter((control) => !(mirrored && control.field === 'rightSleeveLength')).map((control) => (
        <ShapeSlider
          key={control.field}
          field={control.field}
          label={mirrored && control.field === 'leftSleeveLength' ? 'Sleeves' : control.label}
          step={control.step}
          value={shape[control.field]}
          onPreview={(value) => previewShape({ shape: { ...shape, ...patchFor({ field: control.field, value }) } })}
          onCommit={(value) => setShape({ shape: patchFor({ field: control.field, value }) })}
        />
      ))}
      <button
        type="button"
        disabled={!stored}
        onClick={() => {
          setShape({ shape: { leftSleeveLength: 0, rightSleeveLength: 0, bodyLength: 0, bodyWidth: 0, necklineDepth: 0 } })
        }}
        className={`min-h-11 border border-flv-line px-3 text-flv-muted hover:text-flv-accent disabled:opacity-40 ${chromeTextClass()}`}
      >
        Reset shape
      </button>
    </aside>
  )
}
