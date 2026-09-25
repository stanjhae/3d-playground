import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import { layerVoice } from '../../lib/layer-hit'
import {
  chromeKickerClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

export function LayerRail() {
  const layers = useEditorStore((state) => state.document.layers)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const listed = layers.filter((layer) => layer.kind !== 'art')

  if (listed.length === 0) {
    return null
  }

  return (
    <aside className={railFrameClass()}>
      <p className={chromeKickerClass()}>{HOUSE_COPY.onTheCloth}</p>
      <ul className="flex flex-col gap-2">
        {listed.map((layer) => {
          const selected = selectedLayerId === layer.id
          const canDuplicate =
            layer.kind === 'graphic' ||
            layer.kind === 'text' ||
            layer.kind === 'pattern'

          return (
            <li key={layer.id} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  selectLayer({
                    selectedLayerId: selected ? null : layer.id,
                  })
                }}
                className={cn(
                  'min-h-11 min-w-0 flex-1 truncate text-left',
                  chromeTextClass(),
                  {
                    'text-flv-accent': selected,
                    'text-flv-muted hover:text-flv-accent': !selected,
                    'opacity-40': !layer.visible,
                  },
                )}
              >
                {layerVoice({ layer })}
              </button>
              <button
                type="button"
                onClick={() => {
                  updateLayer({
                    layerId: layer.id,
                    patch: { visible: !layer.visible },
                  })
                }}
                className={cn(
                  'min-h-11 text-flv-muted hover:text-flv-accent',
                  chromeTextClass(),
                )}
              >
                {layer.visible ? HOUSE_COPY.hideLayer : HOUSE_COPY.showLayer}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = window.prompt(
                    FLV_COPY.layerRename,
                    layer.label ?? layerVoice({ layer }),
                  )

                  if (next === null) {
                    return
                  }

                  updateLayer({
                    layerId: layer.id,
                    patch: { label: next },
                  })
                }}
                className={cn(
                  'min-h-11 text-flv-muted hover:text-flv-accent',
                  chromeTextClass(),
                )}
              >
                {FLV_COPY.layerRename}
              </button>
              {canDuplicate ? (
                <button
                  type="button"
                  onClick={() => {
                    duplicateLayer({ layerId: layer.id })
                  }}
                  className={cn(
                    'min-h-11 text-flv-muted hover:text-flv-accent',
                    chromeTextClass(),
                  )}
                >
                  {FLV_COPY.layerDuplicate}
                </button>
              ) : null}
              {layer.kind !== 'paint' ? (
                <button
                  type="button"
                  onClick={() => {
                    removeLayer({ layerId: layer.id })
                  }}
                  className={cn(
                    'min-h-11 text-flv-muted hover:text-flv-accent',
                    chromeTextClass(),
                  )}
                >
                  {FLV_COPY.layerDelete}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
