import { GripVertical } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useId, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { isLockableLayer, isLockedLayer } from '../../lib/design-document'
import { garmentPanels } from '../../lib/garments'
import { layerPlacement, useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  focusAfterDelete,
  LOCKED_REASON,
  layerDeletedMessage,
  layerEdgeMessage,
  layerLockMessage,
  type LayerMove,
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
import { useStudioMode } from '../../lib/studio-mode'

const actionClass = cn(
  'min-h-11 text-flv-muted hover:text-flv-accent aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:text-flv-muted',
  chromeTextClass(),
)

const lockClass = cn(
  'min-h-11 border px-2',
  chromeTextClass(),
)

const moveClass =
  'grid size-11 place-items-center border border-flv-line text-flv-ink hover:text-flv-accent aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:text-flv-ink'

export function LayerRail() {
  const pro = useStudioMode((state) => state.pro)
  const layers = useEditorStore((state) => state.document.layers)
  const garmentId = useEditorStore((state) => state.garmentId)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const moveLayerTo = useEditorStore((state) => state.moveLayerTo)
  /** A row being dragged by its grip, and the row it would land on. */
  const [drag, setDrag] = useState<{ layerId: string; panel: string | null; overId: string | null } | null>(null)
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

  /** The row under the pointer, if it is in the same panel as the dragged one. */
  function rowUnder({ event }: { event: ReactPointerEvent }) {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-row]')
    return row && row.dataset.layerPanel === drag?.panel ? (row.dataset.layerRow ?? null) : null
  }

  function dropDrag() {
    if (!drag) {
      return
    }

    const { layerId, overId } = drag
    setDrag(null)
    const target = overId ? layerPlacement({ layerId: overId }) : null

    if (!overId || overId === layerId || !target) {
      return
    }

    moveLayerTo({ layerId, toIndex: target.index })
    const name = groups.flatMap((group) => group.rows).find((row) => row.layer.id === layerId)?.name ?? 'Item'
    const label = groups.find((group) => group.rows.some((row) => row.layer.id === layerId))?.label ?? ''
    announce({
      message: layerMovedMessage({ name, direction: 'drag', placement: layerPlacement({ layerId }), panelLabel: label }),
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
                  const locked = isLockedLayer({ layer })
                  const lockable = isLockableLayer({ layer })
                  const movable = row.index !== null
                  const reasonId = `${headingId}-${layer.id}-locked`
                  // Off while locked, with the reason beside them (W3).
                  const lockedProps = locked
                    ? { 'aria-disabled': true as const, 'aria-describedby': reasonId, title: LOCKED_REASON }
                    : {}

                  function move(direction: Exclude<LayerMove, 'drag'>) {
                    if (locked) {
                      return
                    }

                    const allowed = direction === 'up' || direction === 'front' ? row.canMoveUp : row.canMoveDown

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
                    focusRow({ layerId: layer.id, control: direction === 'front' ? 'up' : direction === 'back' ? 'down' : direction })
                  }

                  return (
                    <li
                      key={layer.id}
                      data-layer-row={layer.id}
                      data-layer-panel={group.panel ?? undefined}
                      className={cn('flex flex-wrap items-center gap-x-2 border-l-2 border-t-2 pl-2', {
                        'border-l-flv-accent': selected,
                        'border-l-transparent': !selected,
                        'border-t-flv-accent': drag !== null && drag.overId === layer.id && drag.layerId !== layer.id,
                        'border-t-transparent': !(drag !== null && drag.overId === layer.id && drag.layerId !== layer.id),
                        'opacity-50': drag?.layerId === layer.id,
                      })}
                    >
                      {movable && !locked ? (
                        // Pointer only: the arrow buttons and To front / To back do the same from the keyboard.
                        <span
                          aria-hidden
                          data-layer-control="grip"
                          title={`Drag to reorder ${name}`}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.currentTarget.setPointerCapture(event.pointerId)
                            setDrag({ layerId: layer.id, panel: group.panel, overId: layer.id })
                          }}
                          onPointerMove={(event) => {
                            if (drag?.layerId === layer.id) {
                              const overId = rowUnder({ event })
                              if (overId !== drag.overId) {
                                setDrag({ ...drag, overId })
                              }
                            }
                          }}
                          onPointerUp={dropDrag}
                          onPointerCancel={() => setDrag(null)}
                          className="grid min-h-11 w-6 cursor-grab touch-none place-items-center text-flv-muted active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </span>
                      ) : null}
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
                        {locked ? <span className="sr-only">, locked</span> : null}
                      </button>
                      {lockable ? (
                        <button
                          type="button"
                          data-layer-control="lock"
                          aria-label={`Lock ${name}`}
                          aria-pressed={locked}
                          title={locked ? `Unlock ${name}` : `Lock ${name}`}
                          onClick={() => {
                            updateLayer({ layerId: layer.id, patch: { locked: !locked } })
                            announce({ message: layerLockMessage({ name, locked: !locked }) })
                          }}
                          className={cn(lockClass, {
                            'border-flv-accent text-flv-accent': locked,
                            'border-flv-line text-flv-muted hover:text-flv-accent': !locked,
                          })}
                        >
                          Lock
                        </button>
                      ) : null}
                      {movable ? (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            data-layer-control="up"
                            aria-label={`Move ${name} up`}
                            aria-disabled={row.canMoveUp && !locked ? undefined : true}
                            aria-describedby={locked ? reasonId : undefined}
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
                            aria-disabled={row.canMoveDown && !locked ? undefined : true}
                            aria-describedby={locked ? reasonId : undefined}
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
                      {locked ? (
                        <span id={reasonId} className={cn('w-full', chromeMutedClass())}>
                          Locked. {LOCKED_REASON}.
                        </span>
                      ) : null}
                      <span className="flex w-full flex-wrap gap-x-3">
                        <button
                          type="button"
                          data-layer-control="visibility"
                          aria-label={`${layer.visible ? HOUSE_COPY.hideLayer : HOUSE_COPY.showLayer} ${name}`}
                          {...lockedProps}
                          onClick={() => {
                            if (locked) {
                              return
                            }

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
                        {pro && movable ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${name} to the front`}
                              aria-disabled={row.canMoveUp && !locked ? undefined : true}
                              aria-describedby={locked ? reasonId : undefined}
                              onClick={() => move('front')}
                              className={cn(actionClass, 'aria-disabled:opacity-35')}
                            >
                              To front
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${name} to the back`}
                              aria-disabled={row.canMoveDown && !locked ? undefined : true}
                              aria-describedby={locked ? reasonId : undefined}
                              onClick={() => move('back')}
                              className={cn(actionClass, 'aria-disabled:opacity-35')}
                            >
                              To back
                            </button>
                          </>
                        ) : null}
                        {pro ? (
                          <>
                        <button
                          type="button"
                          aria-label={`${FLV_COPY.layerRename} ${name}`}
                          {...lockedProps}
                          onClick={() => {
                            if (locked) {
                              return
                            }

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
                          </>
                        ) : null}
                        {layer.kind !== 'paint' ? (
                          <button
                            type="button"
                            aria-label={`${FLV_COPY.layerDelete} ${name}`}
                            {...lockedProps}
                            onClick={() => {
                              if (locked) {
                                return
                              }

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
