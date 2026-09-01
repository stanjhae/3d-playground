import { cn } from '../../lib/cn'
import { listFabrics } from '../../lib/fabrics'
import { garmentParts, partLabel } from '../../lib/garment-parts'
import { useEditorStore } from '../../lib/editor-store'

export function FabricPanel({
  selectedMeshName,
}: {
  selectedMeshName?: string
}) {
  const storeSelection = useEditorStore((state) => state.selectedMeshName)
  const garmentId = useEditorStore((state) => state.garmentId)
  const fabricId = useEditorStore((state) => state.fabricId)
  const applyFabric = useEditorStore((state) => state.applyFabric)
  const selectMesh = useEditorStore((state) => state.selectMesh)
  const undoLast = useEditorStore((state) => state.undoLast)
  const canUndo = useEditorStore((state) => state.overrides.length > 0)
  const selected = selectedMeshName ?? storeSelection ?? 'body'
  const parts = garmentParts({ garmentId })
  const fabrics = listFabrics()

  return (
    <aside className="flex max-h-[36vh] w-full flex-col gap-4 overflow-y-auto border border-atelier-line bg-atelier/92 p-4 backdrop-blur-sm lg:max-h-[min(72vh,38rem)] lg:max-w-72">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
            Cloth
          </p>
          <p className="text-sm text-ivory">
            For the {partLabel({ meshName: selected })}
          </p>
        </div>
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            undoLast()
          }}
          className="min-h-11 font-display text-xs tracking-[0.16em] text-ivory-muted uppercase hover:text-brass disabled:opacity-30 disabled:hover:text-ivory-muted"
        >
          Undo
        </button>
      </div>
      {parts.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {parts.map((part) => {
            const isSelected =
              selected === part.id || selected.startsWith(`${part.id}-`)

            return (
              <button
                key={part.id}
                type="button"
                onClick={() => {
                  selectMesh({ selectedMeshName: part.id })
                }}
                className={cn(
                  'min-h-11 border px-3 py-1.5 font-display text-[10px] tracking-[0.16em] uppercase',
                  {
                    'border-brass text-brass': isSelected,
                    'border-atelier-line text-ivory-muted hover:text-brass':
                      !isSelected,
                  },
                )}
              >
                {part.label}
              </button>
            )
          })}
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-2">
        {fabrics.map((fabric) => {
          const isActive = fabricId === fabric.id

          return (
            <li key={fabric.id}>
              <button
                type="button"
                onClick={() => {
                  applyFabric({ fabricId: fabric.id, colorId: fabric.id })
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 border bg-atelier px-3 py-2 text-left',
                  {
                    'border-brass': isActive,
                    'border-atelier-line hover:border-brass': !isActive,
                  },
                )}
              >
                <span
                  aria-hidden
                  className="size-6 shrink-0 border border-atelier-line"
                  style={{ backgroundColor: fabric.color }}
                />
                <span className="font-display text-xs tracking-[0.08em] text-ivory">
                  {fabric.name}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
