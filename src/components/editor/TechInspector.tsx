import { useEffect, useState, type ChangeEvent, type PointerEvent } from 'react'

import { cn } from '../../lib/cn'
import type { LayerPatch } from '../../lib/design-commands'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { INK_COLORS } from '../../lib/paint-colors'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

type DraftPose = {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

export function TechInspector() {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const layers = useEditorStore((state) => state.document.layers)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const copyLayerToOpposite = useEditorStore(
    (state) => state.copyLayerToOpposite,
  )
  const layer = layers.find((entry) => entry.id === selectedLayerId)
  const [draft, setDraft] = useState<DraftPose | null>(null)

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
        <p className="font-body text-sm text-ivory-muted">
          {HOUSE_COPY.selectMark}
        </p>
      </aside>
    )
  }

  const selected = layer
  const pose = draft

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

  const color =
    selected.kind === 'text' || selected.kind === 'pattern'
      ? selected.color
      : (selected.color ?? INK_COLORS[0]?.value ?? '#1a1c22')

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.inspector}</p>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.position} X
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="accent-brass"
          {...bindRange({ key: 'x' })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.position} Y
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="accent-brass"
          {...bindRange({ key: 'y' })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.size}
        </span>
        <input
          type="range"
          min={0.05}
          max={0.8}
          step={0.01}
          className="accent-brass"
          {...bindRange({ key: 'scale' })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.rotation}
        </span>
        <input
          type="range"
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          className="accent-brass"
          {...bindRange({ key: 'rotation' })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.opacity}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="accent-brass"
          {...bindRange({ key: 'opacity' })}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className={cn('text-ivory-muted', chromeTextClass())}>
          {HOUSE_COPY.baseColor}
        </span>
        <div className="flex flex-wrap gap-2">
          {INK_COLORS.map((ink) => (
            <button
              key={ink.id}
              type="button"
              aria-label={ink.name}
              aria-pressed={color.toLowerCase() === ink.value.toLowerCase()}
              onClick={() => {
                commitDraft({ patch: { color: ink.value } })
              }}
              className={cn('h-8 w-8 border border-atelier-line', {
                'ring-2 ring-brass ring-offset-1 ring-offset-atelier':
                  color.toLowerCase() === ink.value.toLowerCase(),
              })}
              style={{ backgroundColor: ink.value }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          copyLayerToOpposite({ layerId: selected.id })
        }}
        className={cn(
          'min-h-11 border border-atelier-line px-3 text-ivory-muted hover:text-brass',
          chromeTextClass(),
        )}
      >
        {HOUSE_COPY.copyOpposite}
      </button>
    </aside>
  )
}
