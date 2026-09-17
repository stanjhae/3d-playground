import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { layerVoice } from '../../lib/layer-hit'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'

export function LayerRail() {
  const layers = useEditorStore((state) => state.document.layers)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const listed = layers.filter((layer) => layer.kind !== 'art')

  if (listed.length === 0) {
    return null
  }

  return (
    <aside className="flex flex-col gap-2 border border-atelier-line bg-atelier/92 p-3">
      <p className={chromeKickerClass()}>{HOUSE_COPY.onTheCloth}</p>
      <ul className="flex flex-col gap-2">
        {listed.map((layer) => {
          const selected = selectedLayerId === layer.id

          return (
            <li key={layer.id} className="flex items-center gap-2">
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
                    'text-brass': selected,
                    'text-ivory-muted hover:text-brass': !selected,
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
                  'min-h-11 text-ivory-muted hover:text-brass',
                  chromeTextClass(),
                )}
              >
                {layer.visible ? HOUSE_COPY.hideLayer : HOUSE_COPY.showLayer}
              </button>
              {layer.kind !== 'paint' ? (
                <button
                  type="button"
                  onClick={() => {
                    removeLayer({ layerId: layer.id })
                  }}
                  className={cn(
                    'min-h-11 text-ivory-muted hover:text-brass',
                    chromeTextClass(),
                  )}
                >
                  {HOUSE_COPY.dismissLayer}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
