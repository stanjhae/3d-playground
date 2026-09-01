import { useState } from 'react'

import { cn } from '../../lib/cn'
import { getFabricById, listFabrics } from '../../lib/fabrics'
import { garmentParts, partLabel } from '../../lib/garment-parts'
import { useEditorStore } from '../../lib/editor-store'
import {
  CLOTH_LIST_ID,
  clothListVisibilityClass,
  nextClothOpen,
} from '../../lib/studio-chrome'

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
  const activeFabric = fabricId ? getFabricById({ id: fabricId }) : undefined
  const [clothOpen, setClothOpen] = useState(false)

  return (
    <aside
      className={cn(
        'flex w-full flex-col gap-3 border border-atelier-line bg-atelier/92 p-3 backdrop-blur-sm lg:max-h-[min(72vh,38rem)] lg:max-w-72 lg:gap-4 lg:overflow-y-auto lg:p-4',
        {
          'max-h-[min(42vh,22rem)] overflow-hidden': clothOpen,
        },
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="hidden min-w-0 flex-1 flex-col gap-1 lg:flex">
          <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
            Cloth
          </p>
          <p className="text-sm text-ivory">
            For the {partLabel({ meshName: selected })}
          </p>
        </div>
        <button
          type="button"
          aria-controls={CLOTH_LIST_ID}
          aria-expanded={clothOpen}
          onClick={() => {
            setClothOpen((open) =>
              nextClothOpen({ clothOpen: open, action: 'toggle' }),
            )
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-left lg:hidden"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-xs tracking-[0.28em] text-brass uppercase">
              Cloth
            </span>
            <span className="text-sm text-ivory">
              For the {partLabel({ meshName: selected })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {activeFabric ? (
              <span
                aria-hidden
                className="size-6 border border-atelier-line"
                style={{ backgroundColor: activeFabric.color }}
              />
            ) : null}
            <span className="font-display text-xs tracking-[0.16em] text-brass uppercase">
              {clothOpen ? 'Close' : 'Open'}
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            undoLast()
          }}
          className="min-h-11 shrink-0 font-display text-xs tracking-[0.16em] text-ivory-muted uppercase hover:text-brass disabled:opacity-30 disabled:hover:text-ivory-muted"
        >
          Undo
        </button>
      </div>
      <div
        id={CLOTH_LIST_ID}
        className={cn(
          'min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain lg:flex lg:flex-none lg:gap-4',
          clothListVisibilityClass({ clothOpen }),
        )}
      >
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
                    setClothOpen((open) =>
                      nextClothOpen({
                        clothOpen: open,
                        action: 'select-part',
                      }),
                    )
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
                    setClothOpen((open) =>
                      nextClothOpen({
                        clothOpen: open,
                        action: 'apply-fabric',
                      }),
                    )
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
      </div>
    </aside>
  )
}
