import { useEffect, useState } from 'react'

import { CANONICAL_LIMITS } from '../../lib/canonical-document'
import { cn } from '../../lib/cn'
import type { FillLayer } from '../../lib/design-document'
import { type FillPatch, useEditorStore } from '../../lib/editor-store'
import { layerVoice } from '../../lib/layer-hit'
import { LOCKED_REASON, layerLockMessage } from '../../lib/layer-list'
import { announce } from '../../lib/studio-announcer'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'
import { HOUSE_COPY } from '../../lib/house-copy'
import { FillColours } from './FillColours'

type Draft = { tile: number; rotation: number; offsetX: number; offsetY: number; opacity: number }

function draftOf({ layer }: { layer: FillLayer }): Draft {
  return {
    tile: layer.tile,
    rotation: layer.rotation,
    offsetX: layer.offsetX ?? 0,
    offsetY: layer.offsetY ?? 0,
    opacity: layer.opacity,
  }
}

const buttonClass = cn(
  'min-h-11 flex-1 border border-flv-line px-3 text-flv-muted hover:text-flv-accent disabled:opacity-50 disabled:hover:text-flv-muted',
  chromeTextClass(),
)

/**
 * The selected fill's settings (writer W): tile size, turn, phase, colours
 * and opacity. A slider shows its value as it moves and commits one undo
 * step when let go (or on each key press). A fill has no place on the
 * panel to drag: it covers the whole side.
 */
export function FillInspector({ layer }: { layer: FillLayer }) {
  const updateFill = useEditorStore((state) => state.updateFill)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const [draft, setDraft] = useState<Draft>(() => draftOf({ layer }))
  const locked = layer.locked === true
  const name = layerVoice({ layer })

  useEffect(() => {
    setDraft(draftOf({ layer }))
  }, [layer])

  function commit({ key, value }: { key: keyof Draft; value: number }) {
    if (value === draftOf({ layer })[key]) {
      return
    }

    if (key === 'opacity') {
      updateLayer({ layerId: layer.id, patch: { opacity: value } })
      return
    }

    updateFill({ layerId: layer.id, patch: { [key]: value } as FillPatch })
  }

  function range({
    key,
    label,
    min,
    max,
    step,
    shown,
  }: {
    key: keyof Draft
    label: string
    min: number
    max: number
    step: number
    shown: string
  }) {
    const finish = (value: number) => {
      setDraft((current) => ({ ...current, [key]: value }))
      commit({ key, value })
    }

    return (
      <label className="flex flex-col gap-1">
        <span className={cn('flex justify-between text-flv-muted', chromeTextClass())}>
          {label}
          <span aria-hidden>{shown}</span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draft[key]}
          disabled={locked}
          aria-label={label}
          data-fill-control={key}
          className="min-h-9 w-full accent-[var(--color-flv-accent)]"
          onChange={(event) => {
            const value = Number(event.target.value)
            setDraft((current) => ({ ...current, [key]: value }))
          }}
          onPointerUp={(event) => finish(Number(event.currentTarget.value))}
          onKeyUp={(event) => finish(Number(event.currentTarget.value))}
          onBlur={(event) => finish(Number(event.currentTarget.value))}
        />
      </label>
    )
  }

  return (
    <aside className={railFrameClass()} data-testid="fill-inspector" data-layer-id={layer.id}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.inspector}</p>
      <p className="font-body text-sm text-flv-ink">{name}</p>
      <p className={chromeMutedClass()}>Covers the whole side. Reorder, hide or lock it in the layer list.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={locked}
          className={buttonClass}
          onClick={() => {
            removeLayer({ layerId: layer.id })
            announce({ message: `${name} removed. Undo brings it back.` })
          }}
        >
          {HOUSE_COPY.removeItem}
        </button>
        <button
          type="button"
          aria-pressed={locked}
          className={cn(buttonClass, { 'border-flv-accent text-flv-accent': locked })}
          onClick={() => {
            updateLayer({ layerId: layer.id, patch: { locked: !locked } })
            announce({ message: layerLockMessage({ name, locked: !locked }) })
          }}
        >
          Lock
        </button>
      </div>
      {locked ? <p className={chromeMutedClass()}>Locked. {LOCKED_REASON}.</p> : null}
      {range({
        key: 'tile',
        label: 'Tile size',
        min: CANONICAL_LIMITS.minFillTile,
        max: CANONICAL_LIMITS.maxFillTile,
        step: 0.01,
        shown: `${Math.round(draft.tile * 100)}% of the side`,
      })}
      {range({
        key: 'rotation',
        label: 'Rotate',
        min: -Math.PI,
        max: Math.PI,
        step: Math.PI / 36,
        shown: `${Math.round((draft.rotation * 180) / Math.PI)}°`,
      })}
      {range({ key: 'offsetX', label: 'Shift across', min: 0, max: 0.99, step: 0.01, shown: `${Math.round(draft.offsetX * 100)}%` })}
      {range({ key: 'offsetY', label: 'Shift up', min: 0, max: 0.99, step: 0.01, shown: `${Math.round(draft.offsetY * 100)}%` })}
      {layer.source.kind === 'pattern' ? (
        <FillColours
          colors={layer.source.colors}
          inkLabel={layer.source.patternId === 'check' ? 'Squares' : 'Stripes'}
          disabled={locked}
          onChange={({ colors }) => updateFill({ layerId: layer.id, patch: { colors } })}
        />
      ) : null}
      {range({ key: 'opacity', label: HOUSE_COPY.opacity, min: 0, max: 1, step: 0.01, shown: `${Math.round(draft.opacity * 100)}%` })}
    </aside>
  )
}

export default FillInspector
