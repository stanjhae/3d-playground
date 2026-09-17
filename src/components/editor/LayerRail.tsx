import { cn } from '../../lib/cn'
import { useEditorStore } from '../../lib/editor-store'
import { HOUSE_COPY } from '../../lib/house-copy'
import { layerVoice } from '../../lib/layer-hit'

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
      <p className="font-display text-xs tracking-[0.22em] text-brass uppercase">
        {HOUSE_COPY.onTheCloth}
      </p>
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
                  'min-h-11 min-w-0 flex-1 truncate text-left font-display text-xs tracking-[0.14em] uppercase',
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
                className="min-h-11 font-display text-[10px] tracking-[0.14em] text-ivory-muted uppercase hover:text-brass"
              >
                {layer.visible ? HOUSE_COPY.hideLayer : HOUSE_COPY.showLayer}
              </button>
              {layer.kind !== 'paint' ? (
                <button
                  type="button"
                  onClick={() => {
                    removeLayer({ layerId: layer.id })
                  }}
                  className="min-h-11 font-display text-[10px] tracking-[0.14em] text-ivory-muted uppercase hover:text-brass"
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
