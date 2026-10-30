import { useId, useRef } from 'react'

import { cn } from '../../lib/cn'
import { garmentPanels } from '../../lib/garments'
import { layerPlacement, useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  focusAfterDelete,
  layerDeletedMessage,
  layerEdgeMessage,
  layerListGroups,
  layerMovedMessage,
  layerVisibilityMessage,
} from '../../lib/layer-list'
import { announce } from '../../lib/studio-announcer'
import {
  chromeKickerClass,
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'

const actionClass = cn(
  'min-h-11 text-flv-muted hover:text-flv-accent',
  chromeTextClass(),
)

const moveClass =
  'grid size-11 place-items-center border border-flv-line text-flv-ink hover:text-flv-accent aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:text-flv-ink'

export function LayerRail() {
  const layers = useEditorStore((state) => state.document.layers)
  const garmentId = useEditorStore((state) => state.garmentId)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const listRef = useRef<HTMLDivElement | null>(null)
  const headingId = useId()
  const panels = garmentPanels({ garmentId })
  const groups = layerListGroups({ layers, panels, placement: layerPlacement })
  const orderedIds = groups.flatMap((group) => group.rows.map((row) => row.layer.id))

  if (orderedIds.length === 0) {
    return null
  }

  /** Focus a control in a row after React has re-rendered the list. */
  function focusRow({ layerId, control }: { layerId: string | null; control: string }) {
    requestAnimationFrame(() => {
      const list = listRef.current

      if (!list) {
        return
      }

      const row = layerId
        ? list.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(layerId)}"]`)
        : null
      const target =
        row?.querySelector<HTMLElement>(`[data-layer-control="${control}"]`) ??
        row?.querySelector<HTMLElement>('[data-layer-control="select"]') ??
        list.querySelector<HTMLElement>('[data-layer-control="select"]')
      target?.focus()
    })
  }

  return (
    <aside className={railFrameClass()} aria-labelledby={headingId}>
      <h2 id={headingId} className={chromeKickerClass()}>
        {HOUSE_COPY.onTheCloth}
      </h2>
      <div ref={listRef} className="flex flex-col gap-3">
        {groups.map((group) => {
          const groupId = `${headingId}-${group.panel ?? 'other'}`

          return (
            <section key={group.panel ?? 'other'} aria-labelledby={groupId} className="flex flex-col gap-1">
              <h3 id={groupId} className={chromeMutedClass()}>
                {group.label}
                <span className="sr-only">, top layer first</span>
              </h3>
              <ul aria-labelledby={groupId} className="flex flex-col gap-2">
                {group.rows.map((row) => {
                  const { layer, name } = row
                  const selected = selectedLayerId === layer.id
                  const canDuplicate =
                    layer.kind === 'graphic' ||
                    layer.kind === 'text' ||
                    layer.kind === 'pattern'
                  const movable = row.index !== null

                  function move(direction: 'up' | 'down') {
                    const allowed = direction === 'up' ? row.canMoveUp : row.canMoveDown

                    if (!allowed) {
                      announce({ message: layerEdgeMessage({ name, direction }) })
                      return
                    }

                    moveLayer({ layerId: layer.id, direction })
                    announce({
                      message: layerMovedMessage({
                        name,
                        direction,
                        placement: layerPlacement({ layerId: layer.id }),
                        panelLabel: group.label,
                      }),
                    })
                    focusRow({ layerId: layer.id, control: direction })
                  }

                  return (
                    <li
                      key={layer.id}
                      data-layer-row={layer.id}
                      className={cn('flex flex-wrap items-center gap-x-2 border-l-2 pl-2', {
                        'border-flv-accent': selected,
                        'border-transparent': !selected,
                      })}
                    >
                      <button
                        type="button"
                        data-layer-control="select"
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => {
                          selectLayer({
                            selectedLayerId: selected ? null : layer.id,
                          })
                        }}
                        className={cn(
                          'min-h-11 min-w-0 flex-1 basis-24 truncate text-left',
                          chromeTextClass(),
                          {
                            'text-flv-accent': selected,
                            'text-flv-muted hover:text-flv-accent': !selected,
                            'opacity-40': !layer.visible,
                          },
                        )}
                      >
                        {name}
                        {layer.visible ? null : <span className="sr-only">, hidden</span>}
                      </button>
                      {movable ? (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            data-layer-control="up"
                            aria-label={`Move ${name} up`}
                            aria-disabled={row.canMoveUp ? undefined : true}
                            title={`Move ${name} up`}
                            onClick={() => {
                              move('up')
                            }}
                            className={moveClass}
                          >
                            <span aria-hidden>↑</span>
                          </button>
                          <button
                            type="button"
                            data-layer-control="down"
                            aria-label={`Move ${name} down`}
                            aria-disabled={row.canMoveDown ? undefined : true}
                            title={`Move ${name} down`}
                            onClick={() => {
                              move('down')
                            }}
                            className={moveClass}
                          >
                            <span aria-hidden>↓</span>
                          </button>
                        </span>
                      ) : null}
                      <span className="flex w-full flex-wrap gap-x-3">
                        <button
                          type="button"
                          data-layer-control="visibility"
                          aria-label={`${layer.visible ? HOUSE_COPY.hideLayer : HOUSE_COPY.showLayer} ${name}`}
                          onClick={() => {
                            updateLayer({
                              layerId: layer.id,
                              patch: { visible: !layer.visible },
                            })
                            announce({
                              message: layerVisibilityMessage({ name, visible: !layer.visible }),
                            })
                          }}
                          className={actionClass}
                        >
                          {layer.visible ? HOUSE_COPY.hideLayer : HOUSE_COPY.showLayer}
                        </button>
                        <button
                          type="button"
                          aria-label={`${FLV_COPY.layerRename} ${name}`}
                          onClick={() => {
                            const next = window.prompt(
                              FLV_COPY.layerRename,
                              layer.label ?? name,
                            )

                            if (next === null) {
                              return
                            }

                            updateLayer({
                              layerId: layer.id,
                              patch: { label: next },
                            })
                          }}
                          className={actionClass}
                        >
                          {FLV_COPY.layerRename}
                        </button>
                        {canDuplicate ? (
                          <button
                            type="button"
                            aria-label={`${FLV_COPY.layerDuplicate} ${name}`}
                            onClick={() => {
                              duplicateLayer({ layerId: layer.id })
                            }}
                            className={actionClass}
                          >
                            {FLV_COPY.layerDuplicate}
                          </button>
                        ) : null}
                        {layer.kind !== 'paint' ? (
                          <button
                            type="button"
                            aria-label={`${FLV_COPY.layerDelete} ${name}`}
                            onClick={() => {
                              const next = focusAfterDelete({ orderedIds, deletedId: layer.id })
                              removeLayer({ layerId: layer.id })
                              announce({ message: layerDeletedMessage({ name }) })
                              focusRow({ layerId: next, control: 'select' })
                            }}
                            className={actionClass}
                          >
                            {FLV_COPY.layerDelete}
                          </button>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </aside>
  )
}
