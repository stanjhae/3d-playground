import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { cn } from '../../lib/cn'
import type { LayerPatch } from '../../lib/design-commands'
import { Swatch } from '../ui/Swatch'
import { useEditorStore } from '../../lib/editor-store'
import { isCanonicalGarment } from '../../lib/concept-flags'
import { useStudioMode } from '../../lib/studio-mode'
import { HOUSE_COPY } from '../../lib/house-copy'
import { type PlaceableLayer, layerMostlyOffPanel } from '../../lib/layer-hit'
import { INK_COLORS } from '../../lib/paint-colors'
import { chestLineY } from '../../lib/panel-snap'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import {
  TRANSFORM_FIELDS,
  formatField,
  parseField,
  stepField,
  type TransformKey,
} from '../../lib/transform-fields'

type DraftPose = {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

/**
 * A typed value beside a slider (#156). Enter or leaving the box commits,
 * arrows step (Shift for ten), Escape restores. Refused input keeps its
 * message beside the box rather than being clamped.
 */
function TransformNumber({
  fieldKey,
  value,
  onCommit,
}: {
  fieldKey: TransformKey
  value: number
  onCommit: ({ value }: { value: number }) => void
}) {
  const field = TRANSFORM_FIELDS[fieldKey]
  const shown = formatField({ field, value })
  const [text, setText] = useState(shown)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  useEffect(() => {
    setText(shown)
    setError(null)
  }, [shown])

  function commitText() {
    // Unchanged text never rewrites the value it rounds (45.37 shown 45.4).
    if (text.trim() === shown) {
      setText(shown)
      setError(null)
      return
    }

    const parsed = parseField({ field, text })

    if (!parsed.ok) {
      setError(parsed.message)
      return
    }

    setError(null)
    setText(formatField({ field, value: parsed.value }))

    if (parsed.value !== value) {
      onCommit({ value: parsed.value })
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitText()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setText(shown)
      setError(null)
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const stepped = stepField({
        field,
        value,
        direction: event.key === 'ArrowUp' ? 1 : -1,
        large: event.shiftKey,
      })

      if (!stepped.ok) {
        setError(stepped.message)
        return
      }

      setError(null)
      setText(formatField({ field, value: stepped.value }))
      onCommit({ value: stepped.value })
    }
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={field.label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
          onBlur={commitText}
          onKeyDown={onKeyDown}
          className={cn(
            'min-h-9 w-16 border bg-white px-2 text-right font-body text-sm text-flv-ink',
            error ? 'border-flv-accent' : 'border-flv-line',
          )}
        />
        <span aria-hidden className="w-3 font-body text-xs text-flv-muted">
          {field.unit}
        </span>
      </span>
      {error ? (
        <span id={errorId} role="alert" className="font-body text-xs text-flv-accent">
          {error}
        </span>
      ) : null}
    </span>
  )
}

export function TechInspector() {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const garmentId = useEditorStore((state) => state.garmentId)
  const layers = useEditorStore((state) => state.document.layers)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const copyLayerToOpposite = useEditorStore(
    (state) => state.copyLayerToOpposite,
  )
  const layer = layers.find((entry) => entry.id === selectedLayerId)
  const [draft, setDraft] = useState<DraftPose | null>(null)
  const pro = useStudioMode((state) => state.pro)

  useEffect(() => {
    if (
      !layer ||
      (layer.kind !== 'graphic' &&
        layer.kind !== 'text' &&
        layer.kind !== 'pattern')
    ) {
      setDraft(null)
      return
    }

    setDraft({
      x: layer.x,
      y: layer.y,
      scale: layer.scale,
      rotation: layer.rotation,
      opacity: layer.opacity,
    })
  }, [layer])

  if (
    !layer ||
    !draft ||
    (layer.kind !== 'graphic' &&
      layer.kind !== 'text' &&
      layer.kind !== 'pattern')
  ) {
    return (
      <aside className={railFrameClass()}>
        <p className={chromeKickerClass()}>{HOUSE_COPY.inspector}</p>
        <p className="font-body text-sm text-flv-muted">
          {HOUSE_COPY.selectMark}
        </p>
      </aside>
    )
  }

  const selected = layer
  const pose = draft
  // Only the tee's chest is measured.
  const chest = isCanonicalGarment({ garmentId }) && selected.kind !== 'pattern' ? chestLineY({ panel: selected.panel }) : null
  const alignButtonClass = cn(
    'min-h-11 flex-1 border border-flv-line px-3 text-flv-muted hover:text-flv-accent disabled:opacity-50 disabled:hover:text-flv-muted',
    chromeTextClass(),
  )

  function commitDraft({ patch }: { patch: LayerPatch }) {
    updateLayer({
      layerId: selected.id,
      patch,
    })
  }

  function bindRange({
    key,
  }: {
    key: keyof DraftPose
  }) {
    return {
      value: pose[key],
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const value = Number(event.target.value)
        setDraft((current) =>
          current ? { ...current, [key]: value } : current,
        )
      },
      onPointerUp: (event: PointerEvent<HTMLInputElement>) => {
        const value = Number(event.currentTarget.value)
        setDraft((current) =>
          current ? { ...current, [key]: value } : current,
        )
        commitDraft({ patch: { [key]: value } })
      },
    }
  }

  function numberField({ key }: { key: TransformKey }) {
    return (
      <TransformNumber
        // A new mark starts clean, even at the same value.
        key={`${selected.id}-${key}`}
        fieldKey={key}
        value={pose[key]}
        onCommit={({ value }) => {
          setDraft((current) =>
            current ? { ...current, [key]: value } : current,
          )
          commitDraft({ patch: { [key]: value } })
        }}
      />
    )
  }

  const color =
    selected.kind === 'text' || selected.kind === 'pattern'
      ? selected.color
      : (selected.color ?? INK_COLORS[0]?.value ?? '#1a1c22')

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.inspector}</p>
      {layerMostlyOffPanel({ layer: { ...selected, ...pose } as PlaceableLayer }) ? (
        <p role="status" className="font-body text-xs text-flv-accent">
          Most of this is outside its panel, so most of it won’t show. Move it towards the middle.
        </p>
      ) : null}
      <p className="font-body text-xs font-medium text-flv-ink">Size and angle</p>
      <div className="flex flex-col gap-1">
        <span className={cn('text-flv-muted', chromeTextClass())}>
          {HOUSE_COPY.size}
        </span>
        <div className="flex items-start gap-2">
          <input
            type="range"
            min={0.05}
            max={0.8}
            step={0.01}
            aria-label={TRANSFORM_FIELDS.scale.name}
            className="min-h-9 min-w-0 flex-1 accent-[var(--color-flv-accent)]"
            {...bindRange({ key: 'scale' })}
          />
          {pro ? numberField({ key: 'scale' }) : null}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className={cn('text-flv-muted', chromeTextClass())}>
          {HOUSE_COPY.rotation}
        </span>
        <div className="flex items-start gap-2">
          <input
            type="range"
            min={-Math.PI}
            max={Math.PI}
            step={0.01}
            aria-label={TRANSFORM_FIELDS.rotation.name}
            className="min-h-9 min-w-0 flex-1 accent-[var(--color-flv-accent)]"
            {...bindRange({ key: 'rotation' })}
          />
          {pro ? numberField({ key: 'rotation' }) : null}
        </div>
      </div>
      {/* An image on the tee keeps its own colours: swatches there did nothing. */}
      {selected.kind === 'graphic' && isCanonicalGarment({ garmentId }) ? null : (
      <div className="flex flex-col gap-2 border-t border-flv-line pt-3">
        <span className="font-body text-xs font-medium text-flv-ink">Colour</span>
        <div className="flex flex-wrap gap-2">
          {INK_COLORS.map((ink) => (
            <Swatch
              key={ink.id}
              name={ink.name}
              color={ink.value}
              selected={color.toLowerCase() === ink.value.toLowerCase()}
              onClick={() => {
                commitDraft({ patch: { color: ink.value } })
              }}
            />
          ))}
        </div>
      </div>
      )}
      {selected.kind !== 'pattern' ? (
        <div role="group" aria-label="Align" className="flex flex-col gap-1">
          <span className={cn('text-flv-muted', chromeTextClass())}>Align</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => commitDraft({ patch: { x: 0.5 } })}
              disabled={pose.x === 0.5}
              className={alignButtonClass}
            >
              Centre
            </button>
            {chest !== null ? (
              <button
                type="button"
                onClick={() => commitDraft({ patch: { y: chest } })}
                disabled={pose.y === chest}
                className={alignButtonClass}
              >
                {selected.panel === 'back' ? 'On shoulder blades' : 'On chest'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {pro ? (
        <div className="flex flex-col gap-3 border-t border-flv-line pt-3">
          <span className="font-body text-xs font-medium text-flv-ink">Exact placement</span>
      <div className="flex flex-col gap-1">
        <span className={cn('text-flv-muted', chromeTextClass())}>
          {HOUSE_COPY.position} X
        </span>
        <div className="flex items-start gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            aria-label={TRANSFORM_FIELDS.x.name}
            className="min-h-9 min-w-0 flex-1 accent-[var(--color-flv-accent)]"
            {...bindRange({ key: 'x' })}
          />
          {numberField({ key: 'x' })}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className={cn('text-flv-muted', chromeTextClass())}>
          {HOUSE_COPY.position} Y
        </span>
        <div className="flex items-start gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            aria-label={TRANSFORM_FIELDS.y.name}
            className="min-h-9 min-w-0 flex-1 accent-[var(--color-flv-accent)]"
            {...bindRange({ key: 'y' })}
          />
          {numberField({ key: 'y' })}
        </div>
      </div>
        <label className="flex flex-col gap-1">
          <span className={cn('text-flv-muted', chromeTextClass())}>
            {HOUSE_COPY.opacity}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            className="accent-[var(--color-flv-accent)]"
            {...bindRange({ key: 'opacity' })}
          />
        </label>
      <button
        type="button"
        onClick={() => {
          copyLayerToOpposite({ layerId: selected.id })
        }}
        className={cn(
          'min-h-11 border border-flv-line px-3 text-flv-muted hover:text-flv-accent',
          chromeTextClass(),
        )}
      >
        {HOUSE_COPY.copyOpposite}
      </button>
        </div>
      ) : null}
    </aside>
  )
}
