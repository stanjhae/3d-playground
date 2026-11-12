import { useState } from 'react'

import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { garmentPanels } from '../../lib/garments'
import { startGraphicDrag } from '../../lib/graphic-drag'
import {
  listGraphicsByCategory,
  type GraphicAsset,
} from '../../lib/graphics-library'
import { decodeLayerImage } from '../../lib/layer-images'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const CATEGORY_TABS: {
  id: GraphicAsset['category']
  label: string
}[] = [
  { id: 'crosses', label: 'Crosses' },
  { id: 'flames', label: 'Flames' },
  { id: 'logos', label: 'Logos' },
  { id: 'shapes', label: 'Shapes' },
]

export function GraphicLibrary() {
  const addGraphic = useEditorStore((state) => state.addGraphic)
  const [category, setCategory] = useState<GraphicAsset['category']>('crosses')
  const [decodeError, setDecodeError] = useState<string | null>(null)
  // A tap adds at once: say where it went, so nobody waits to tap the cloth.
  // The note holds only while that graphic is still the selection: removed,
  // undone or deselected, it goes.
  const [added, setAdded] = useState<{ layerId: string; message: string } | null>(null)
  const addedStillSelected = useEditorStore((state) => added !== null && state.selectedLayerId === added.layerId)
  const garmentId = useEditorStore((state) => state.garmentId)
  const paintPanel = useEditorStore((state) => state.paintPanel)
  const panelLabel = (
    garmentPanels({ garmentId }).find((panel) => panel.id === paintPanel)?.label ?? 'front'
  ).toLowerCase()
  const assets = listGraphicsByCategory({ category })

  return (
    <aside className={railFrameClass()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={chromeKickerClass()}>{FLV_COPY.suggestionsTitle}</p>
        <ConceptPreviewBadge />
      </div>
      <p className={chromeMutedClass()}>{FLV_COPY.suggestionsApply}</p>
      {added && addedStillSelected ? (
        <p className="font-body text-sm text-flv-ink" role="status">
          {added.message}
        </p>
      ) : null}
      {decodeError ? (
        <p className="font-body text-sm text-flv-accent" role="status">
          {decodeError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setCategory(tab.id)
            }}
            className={cn('min-h-11 border px-3', chromeTextClass(), {
              'border-flv-accent text-flv-accent': category === tab.id,
              'border-flv-line text-flv-muted hover:text-flv-accent':
                category !== tab.id,
            })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {assets.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                startGraphicDrag({ dataTransfer: event.dataTransfer, src: asset.src })
              }}
              onClick={() => {
                setDecodeError(null)
                addGraphic({ src: asset.src })
                const layerId = useEditorStore.getState().selectedLayerId
                setAdded(
                  layerId
                    ? {
                        layerId,
                        message: `${asset.label} added to the ${panelLabel}. Drag it on the garment to move it, or resize it under Selected item.`,
                      }
                    : null,
                )
                void decodeLayerImage({ src: asset.src }).then((buffer) => {
                  if (!buffer) {
                    setDecodeError(
                      `${asset.label} could not load onto the cloth. Try another mark.`,
                    )
                  }
                })
              }}
              className="flex min-h-24 w-full flex-col items-center justify-center gap-2 border border-flv-line bg-flv-paper p-2 hover:border-flv-accent"
            >
              <img
                src={asset.src}
                alt=""
                className="max-h-12 max-w-full object-contain"
              />
              <span className={cn('text-center', chromeTextClass())}>
                {asset.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
