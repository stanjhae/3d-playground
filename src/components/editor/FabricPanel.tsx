import { listFabrics } from '../../lib/fabrics'
import { useEditorStore } from '../../lib/editor-store'

function partLabel({ meshName }: { meshName: string }) {
  const [head] = meshName.split('-')
  return head.charAt(0).toUpperCase() + head.slice(1)
}

export function FabricPanel({ selectedMeshName }: { selectedMeshName?: string }) {
  const storeSelection = useEditorStore((state) => state.selectedMeshName)
  const fabricId = useEditorStore((state) => state.fabricId)
  const applyFabric = useEditorStore((state) => state.applyFabric)
  const undoLast = useEditorStore((state) => state.undoLast)
  const canUndo = useEditorStore((state) => state.overrides.length > 0)
  const selected = selectedMeshName ?? storeSelection ?? undefined
  const fabrics = listFabrics()

  return (
    <aside className="flex w-full max-w-72 flex-col gap-5 border border-atelier-line bg-atelier-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
            Cloth
          </p>
          <p className="text-sm text-ivory">
            {selected
              ? `For the ${partLabel({ meshName: selected })}`
              : 'Pick a part of the gown'}
          </p>
        </div>
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            undoLast()
          }}
          className="font-display text-xs tracking-[0.16em] text-ivory-muted uppercase disabled:opacity-30 hover:text-brass disabled:hover:text-ivory-muted"
        >
          Undo
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {fabrics.map((fabric) => {
          const isActive = fabricId === fabric.id

          return (
            <li key={fabric.id}>
              <button
                type="button"
                disabled={!selected}
                onClick={() => {
                  applyFabric({ fabricId: fabric.id, colorId: fabric.id })
                }}
                className={
                  isActive
                    ? 'flex w-full items-center gap-3 border border-brass bg-atelier px-3 py-2 text-left disabled:opacity-40'
                    : 'flex w-full items-center gap-3 border border-atelier-line bg-atelier px-3 py-2 text-left disabled:opacity-40 hover:border-brass'
                }
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
