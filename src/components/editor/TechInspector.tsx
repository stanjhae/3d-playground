import { LAYER_SCALE_RANGE } from '../../lib/layer-scale'
import {
  Suspense,
  lazy,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { IMAGE_SATURATION_MAX } from '../../lib/canonical-document'
import { cn } from '../../lib/cn'
import type { LayerPatch } from '../../lib/design-commands'
import { Swatch } from '../ui/Swatch'
import { ProColour } from './ProColour'
import { useEditorStore } from '../../lib/editor-store'
import { isCanonicalGarment } from '../../lib/concept-flags'
import { useStudioMode } from '../../lib/studio-mode'
import { HOUSE_COPY } from '../../lib/house-copy'
import { type PlaceableLayer, layerMostlyOffPanel, layerStretches, layerVoice } from '../../lib/layer-hit'
import { LOCKED_REASON, layerLockMessage } from '../../lib/layer-list'
import { announce } from '../../lib/studio-announcer'
import { revealInScroller } from '../../lib/reveal-in-scroller'
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
  roundPlacement,
  stepField,
  type SizeKey,
  type TransformKey,
} from '../../lib/transform-fields'

const FillInspector = lazy(() => import('./FillInspector'))

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
  fieldKey: TransformKey | SizeKey
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
  // The chest line is measured on the procedural tee (@1–@3).
  const realModel = useEditorStore((state) => Boolean(state.document.modelSrc))
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const copyLayerToOpposite = useEditorStore(
    (state) => state.copyLayerToOpposite,
  )
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const frameRef = useRef<HTMLElement | null>(null)
  const layer = layers.find((entry) => entry.id === selectedLayerId)
  const [draft, setDraft] = useState<DraftPose | null>(null)
  const pro = useStudioMode((state) => state.pro)
  const lockReasonId = useId()
  // W and H move together until this is turned off (stretch one side, W).
  const [keepProportions, setKeepProportions] = useState(true)

  // On a phone the tools scroll under the cloth: bring a fresh selection's
  // size, angle and Remove into view.
  useEffect(() => {
    if (selectedLayerId && frameRef.current) {
      revealInScroller({ element: frameRef.current })
    }
  }, [selectedLayerId])

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

  // A whole-side fill has its own settings (writer W).
  if (layer?.kind === 'fill') {
    return (
      <Suspense fallback={null}>
        <FillInspector layer={layer} />
      </Suspense>
    )
  }

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
  // A locked item shows its settings but takes no change but unlocking (W3).
  const locked = selected.kind !== 'pattern' && selected.locked === true
  // Only the tee's chest is measured.
  const chest = garmentId === 'tee' && !realModel && selected.kind !== 'pattern' ? chestLineY({ panel: selected.panel }) : null
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
        // Size scales a stretched item as a whole: its height keeps its share.
        const stretch =
          key === 'scale' && selected.kind !== 'pattern' && selected.scaleY !== undefined
            ? { scaleY: roundPlacement({ value: (value * selected.scaleY) / selected.scale }) }
            : {}
        commitDraft({ patch: { [key]: value, ...stretch } })
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
    <aside ref={frameRef} className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.inspector}</p>
      {/* Remove and copy sit first: a placed mark is never stuck on the cloth. */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            removeLayer({ layerId: selected.id })
            announce({ message: `${layerVoice({ layer: selected })} removed. Undo brings it back.` })
          }}
          className={alignButtonClass}
        >
          {HOUSE_COPY.removeItem}
        </button>
        {selected.kind !== 'pattern' ? (
          <button
            type="button"
            onClick={() => {
              duplicateLayer({ layerId: selected.id })
            }}
            className={alignButtonClass}
          >
            {HOUSE_COPY.duplicateItem}
          </button>
        ) : null}
      </div>
      {selected.kind !== 'pattern' ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-pressed={locked}
            onClick={() => {
              commitDraft({ patch: { locked: !locked } })
              announce({ message: layerLockMessage({ name: layerVoice({ layer: selected }), locked: !locked }) })
            }}
            className={cn(alignButtonClass, { 'border-flv-accent text-flv-accent': locked })}
          >
            Lock
          </button>
          {locked ? (
            <p id={lockReasonId} className="font-body text-xs text-flv-muted">
              Locked. {LOCKED_REASON}.
            </p>
          ) : null}
        </div>
      ) : null}
      {/* `disabled` reaches every control inside; `contents` keeps the layout. */}
      <fieldset disabled={locked} aria-describedby={locked ? lockReasonId : undefined} className="contents">
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
            min={LAYER_SCALE_RANGE.min}
            max={LAYER_SCALE_RANGE.max}
            step={0.01}
            aria-label={TRANSFORM_FIELDS.scale.name}
            className="min-h-9 min-w-0 flex-1 accent-[var(--color-flv-accent)]"
            {...bindRange({ key: 'scale' })}
          />
          {pro ? numberField({ key: 'scale' }) : null}
        </div>
      </div>
      {layerStretches({ layer: selected }) && selected.kind !== 'pattern' ? (
        <div role="group" aria-label="Width and height" className="flex flex-col gap-1">
          <span className={cn('text-flv-muted', chromeTextClass())}>Width and height</span>
          <div className="flex flex-wrap items-start gap-2">
            {(['width', 'height'] as const).map((key) => {
              const width = selected.scale
              const height = selected.scaleY ?? selected.scale
              return (
                <span key={key} className="flex items-start gap-1">
                  <span aria-hidden className="pt-2 font-body text-xs text-flv-muted">
                    {key === 'width' ? 'W' : 'H'}
                  </span>
                  <TransformNumber
                    key={`${selected.id}-${key}`}
                    fieldKey={key}
                    value={key === 'width' ? width : height}
                    onCommit={({ value }) => {
                      const patch: LayerPatch =
                        key === 'width'
                          ? keepProportions
                            ? { scale: value, scaleY: roundPlacement({ value: (value * height) / width }) }
                            : { scale: value, scaleY: height }
                          : keepProportions
                            ? { scale: roundPlacement({ value: (value * width) / height }), scaleY: value }
                            : { scaleY: value }
                      setDraft((current) => (current && patch.scale !== undefined ? { ...current, scale: patch.scale } : current))
                      commitDraft({ patch })
                    }}
                  />
                </span>
              )
            })}
            <button
              type="button"
              aria-pressed={keepProportions}
              onClick={() => {
                setKeepProportions((current) => !current)
              }}
              className={cn(
                'min-h-9 border border-flv-line px-2 text-flv-muted hover:text-flv-accent',
                chromeTextClass(),
                { 'border-flv-accent text-flv-accent': keepProportions },
              )}
            >
              Keep proportions
            </button>
          </div>
        </div>
      ) : null}
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
      {/* An image on the tee keeps its own colours: swatches there did nothing.
          Its colour can be turned down to black and white, or up (tester, 22 Nov). */}
      {selected.kind === 'graphic' && isCanonicalGarment({ garmentId }) ? (
        <ImageColour
          key={selected.id}
          name={layerVoice({ layer: selected })}
          saturation={selected.saturation ?? 1}
          disabled={locked}
          onCommit={({ saturation }) => commitDraft({ patch: { saturation } })}
        />
      ) : (
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
        {pro ? (
          <ProColour
            label={`${selected.kind === 'text' ? 'Word' : 'Item'} colour`}
            value={color}
            onChange={({ color: next }) => commitDraft({ patch: { color: next } })}
          />
        ) : null}
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
      {selected.kind !== 'pattern' ? (
        <div role="group" aria-label="Flip" className="flex flex-col gap-1">
          <span className={cn('text-flv-muted', chromeTextClass())}>Flip</span>
          <div className="flex gap-2">
            {(
              [
                ['flipX', 'Left to right'],
                ['flipY', 'Upside down'],
              ] as const
            ).map(([flag, name]) => (
              <button
                key={flag}
                type="button"
                aria-pressed={Boolean(selected[flag])}
                onClick={() => commitDraft({ patch: { [flag]: !selected[flag] } })}
                className={cn(alignButtonClass, { 'border-flv-accent text-flv-accent': Boolean(selected[flag]) })}
              >
                {name}
              </button>
            ))}
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
      </fieldset>
    </aside>
  )
}

/**
 * An image's colour strength: a slider from black and white to richer
 * colour, committed when let go, and a Black & white toggle. One undo step
 * each.
 */
function ImageColour({
  name,
  saturation,
  disabled,
  onCommit,
}: {
  name: string
  saturation: number
  disabled: boolean
  onCommit: ({ saturation }: { saturation: number }) => void
}) {
  const [draft, setDraft] = useState(saturation)
  const mono = saturation === 0

  useEffect(() => {
    setDraft(saturation)
  }, [saturation])

  function commit({ value }: { value: number }) {
    const rounded = Math.round(value * 100) / 100

    if (rounded !== saturation) {
      onCommit({ saturation: rounded })
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-flv-line pt-3">
      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between font-body text-xs font-medium text-flv-ink">
          Colour strength
          <span className="font-normal text-flv-muted">{Math.round(draft * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={IMAGE_SATURATION_MAX}
          step={0.05}
          disabled={disabled}
          aria-label={`Colour strength of ${name}`}
          className="accent-[var(--color-flv-accent)]"
          value={draft}
          onChange={(event) => setDraft(Number(event.target.value))}
          onPointerUp={(event) => commit({ value: Number(event.currentTarget.value) })}
          onKeyUp={(event) => commit({ value: Number(event.currentTarget.value) })}
          onBlur={(event) => commit({ value: Number(event.currentTarget.value) })}
        />
      </label>
      <button
        type="button"
        aria-pressed={mono}
        disabled={disabled}
        onClick={() => onCommit({ saturation: mono ? 1 : 0 })}
        className={cn('min-h-11 border px-3 disabled:opacity-50', chromeTextClass(), {
          'border-flv-accent text-flv-accent': mono,
          'border-flv-line text-flv-muted hover:text-flv-accent': !mono,
        })}
      >
        Black &amp; white
      </button>
    </div>
  )
}
