import { Eye, EyeOff, GripVertical, Lock, LockOpen } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useId, useRef, useState } from 'react'

import { cn } from '../../lib/cn'
import { isLockableLayer, isLockedLayer } from '../../lib/design-document'
import { layerNameMessage } from '../../lib/glyph-coverage'
import { garmentPanels } from '../../lib/garments'
import { layerPlacement, useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { HOUSE_COPY } from '../../lib/house-copy'
import {
  focusAfterDelete,
  hiddenLayerIds,
  hideOthersIds,
  LAYER_NAME_MAX,
  LOCKED_REASON,
  layerDeletedMessage,
  layerEdgeMessage,
  layerLockMessage,
  type LayerMove,
  layerListGroups,
  layerMovedMessage,
  layerRenamedMessage,
  layersVisibilityMessage,
  layerVisibilityMessage,
  renamedLayer,
  visibilityToggleLabel,
} from '../../lib/layer-list'
import { announce } from '../../lib/studio-announcer'
import { chromeKickerClass, chromeMutedClass, chromeTextClass, railFrameClass } from '../../lib/studio-chrome'

const actionClass = cn(
  'min-h-11 text-flv-muted hover:text-flv-accent aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:text-flv-muted',
  chromeTextClass(),
)

/** The eye and the lock: always shown, so a row's state reads at a glance. */
const toggleClass =
  'grid size-11 shrink-0 place-items-center border text-flv-muted hover:text-flv-accent aria-pressed:border-flv-accent aria-pressed:text-flv-accent'

const moveClass =
  'grid size-11 place-items-center border border-flv-line text-flv-ink hover:text-flv-accent aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:text-flv-ink'

/**
 * The Layers panel on the Design step: every item on the cloth, by panel,
 * top first. Each row shows and hides (locked or not), locks, reorders,
 * renames in place, duplicates and deletes; "Hide others" and "Unhide all"
 * work on the whole list in one undo step.
 */
export function LayerRail() {
  const layers = useEditorStore((state) => state.document.layers)
  const garmentId = useEditorStore((state) => state.garmentId)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const setLayersVisible = useEditorStore((state) => state.setLayersVisible)
  const removeLayer = useEditorStore((state) => state.removeLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const moveLayerTo = useEditorStore((state) => state.moveLayerTo)
  /** A row being dragged by its grip, and the row it would land on. */
  const [drag, setDrag] = useState<{ layerId: string; panel: string | null; overId: string | null } | null>(null)
  /** The row being renamed in place, and what has been typed. */
  const [renaming, setRenaming] = useState<{ layerId: string; draft: string } | null>(null)
  const renameDone = useRef(false)
  /** Why the last name typed was not kept (emoji), shown under its row. */
  const [renameError, setRenameError] = useState<{ layerId: string; message: string } | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const headingId = useId()
  const panels = garmentPanels({ garmentId })
  const groups = layerListGroups({ layers, panels, placement: layerPlacement })
  const orderedIds = groups.flatMap((group) => group.rows.map((row) => row.layer.id))

  /** Focus a control in a row after React has re-rendered the list. */
  function focusRow({ layerId, control }: { layerId: string | null; control: string }) {
    requestAnimationFrame(() => {
      const list = listRef.current

      if (!list) {
        return
      }

      const row = layerId ? list.querySelector<HTMLElement>(`[data-layer-row="${CSS.escape(layerId)}"]`) : null
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

  function finishRename({ save, draft, keepOpen = false }: { save: boolean; draft: string; keepOpen?: boolean }) {
    // Enter or Esc ends it once; the blur as the field goes changes nothing.
    if (!renaming || renameDone.current) {
      return
    }

    const { layerId } = renaming
    // Names take no emoji, as words take none (tester pass 3). Enter keeps
    // the field open to fix it; leaving the field keeps the old name.
    const refused = save ? layerNameMessage({ name: draft }) : null
    setRenameError(refused ? { layerId, message: refused } : null)

    if (refused) {
      announce({ message: refused })

      if (keepOpen) {
        return
      }
    }

    renameDone.current = true
    const current = groups.flatMap((group) => group.rows).find((row) => row.layer.id === layerId)?.name ?? ''
    const name = save && !refused ? renamedLayer({ draft, current }) : null
    setRenaming(null)

    if (name) {
      updateLayer({ layerId, patch: { label: name } })
      announce({ message: layerRenamedMessage({ name }) })
    }

    focusRow({ layerId, control: 'select' })
  }

  const hidden = hiddenLayerIds({ groups })
  const others = selectedLayerId && orderedIds.includes(selectedLayerId) ? hideOthersIds({ groups, keepId: selectedLayerId }) : []

  return (
    <aside className={railFrameClass()} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id={headingId} className={chromeKickerClass()}>
          {HOUSE_COPY.onTheCloth}
        </h2>
        {orderedIds.length > 0 ? (
          <span className="flex gap-3">
            <button
              type="button"
              aria-disabled={others.length > 0 ? undefined : true}
              title={selectedLayerId ? 'Hide every other layer' : 'Pick a layer first'}
              onClick={() => {
                if (others.length === 0) {
                  return
                }

                setLayersVisible({ layerIds: others, visible: false })
                announce({ message: layersVisibilityMessage({ count: others.length, visible: false }) })
              }}
              className={actionClass}
            >
              Hide others
            </button>
            <button
              type="button"
              aria-disabled={hidden.length > 0 ? undefined : true}
              onClick={() => {
                if (hidden.length === 0) {
                  return
                }

                setLayersVisible({ layerIds: hidden, visible: true })
                announce({ message: layersVisibilityMessage({ count: hidden.length, visible: true }) })
              }}
              className={actionClass}
            >
              Unhide all
            </button>
          </span>
        ) : null}
      </div>
      {orderedIds.length === 0 ? (
        <p className={chromeMutedClass()}>Nothing on the cloth yet. What you draw, type or add shows here, one layer each.</p>
      ) : null}
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
                  const canDuplicate = layer.kind === 'graphic' || layer.kind === 'text' || layer.kind === 'pattern'
                  const locked = isLockedLayer({ layer })
                  const lockable = isLockableLayer({ layer })
                  const movable = row.index !== null
                  const reasonId = `${headingId}-${layer.id}-locked`
                  const editing = renaming?.layerId === layer.id
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

                  function startRename() {
                    if (locked) {
                      return
                    }

                    renameDone.current = false
                    setRenameError(null)
                    setRenaming({ layerId: layer.id, draft: name })
                  }

                  return (
                    <li
                      key={layer.id}
                      data-layer-row={layer.id}
                      data-layer-panel={group.panel ?? undefined}
                      className={cn('flex flex-wrap items-center gap-x-1.5 border-t-2 border-l-2 pl-1', {
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
                          className="grid min-h-11 w-5 cursor-grab touch-none place-items-center text-flv-muted active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </span>
                      ) : (
                        <span aria-hidden className="w-5" />
                      )}
                      <button
                        type="button"
                        data-layer-control="visibility"
                        aria-label={visibilityToggleLabel({ name, visible: layer.visible })}
                        title={visibilityToggleLabel({ name, visible: layer.visible })}
                        onClick={() => {
                          // Hiding is about the view, so it works while locked.
                          updateLayer({ layerId: layer.id, patch: { visible: !layer.visible } })
                          announce({ message: layerVisibilityMessage({ name, visible: !layer.visible }) })
                        }}
                        className={cn(toggleClass, 'border-flv-line')}
                      >
                        {layer.visible ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
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
                          className={cn(toggleClass, 'border-flv-line')}
                        >
                          {locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
                        </button>
                      ) : null}
                      {editing ? (
                        <input
                          // Focus goes straight to the name being edited.
                          autoFocus
                          aria-label={`New name for ${name}`}
                          aria-invalid={renameError?.layerId === layer.id ? true : undefined}
                          aria-describedby={renameError?.layerId === layer.id ? `${headingId}-${layer.id}-rename` : undefined}
                          value={renaming.draft}
                          maxLength={LAYER_NAME_MAX}
                          onChange={(event) => setRenaming({ layerId: layer.id, draft: event.target.value })}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              finishRename({ save: true, draft: event.currentTarget.value, keepOpen: true })
                            } else if (event.key === 'Escape') {
                              // Esc here cancels the rename, not the selection.
                              event.preventDefault()
                              event.stopPropagation()
                              finishRename({ save: false, draft: event.currentTarget.value })
                            }
                          }}
                          onBlur={(event) => finishRename({ save: true, draft: event.currentTarget.value })}
                          className={cn('min-h-11 min-w-0 flex-1 basis-24 border border-flv-accent bg-flv-paper px-2', chromeTextClass())}
                        />
                      ) : (
                        <button
                          type="button"
                          data-layer-control="select"
                          aria-current={selected ? 'true' : undefined}
                          title={locked ? name : `${name}. Double-click to rename`}
                          onClick={() => {
                            selectLayer({ selectedLayerId: selected ? null : layer.id })
                          }}
                          onDoubleClick={startRename}
                          className={cn('min-h-11 min-w-0 flex-1 basis-24 truncate text-left', chromeTextClass(), {
                            'text-flv-accent': selected,
                            'text-flv-muted hover:text-flv-accent': !selected,
                            'opacity-40': !layer.visible,
                          })}
                        >
                          {name}
                          {layer.visible ? null : <span className="sr-only">, hidden</span>}
                          {locked ? <span className="sr-only">, locked</span> : null}
                        </button>
                      )}
                      {movable ? (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            data-layer-control="up"
                            aria-label={`Move ${name} up`}
                            aria-disabled={row.canMoveUp && !locked ? undefined : true}
                            aria-describedby={locked ? reasonId : undefined}
                            title={`Move ${name} up`}
                            onClick={() => move('up')}
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
                            onClick={() => move('down')}
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
                      {renameError?.layerId === layer.id ? (
                        <span id={`${headingId}-${layer.id}-rename`} data-testid="rename-error" className={cn('w-full pl-6', chromeMutedClass())}>
                          {renameError.message}
                        </span>
                      ) : null}
                      <span className="flex w-full flex-wrap gap-x-3 pl-6">
                        {movable ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${name} to the front`}
                              aria-disabled={row.canMoveUp && !locked ? undefined : true}
                              aria-describedby={locked ? reasonId : undefined}
                              onClick={() => move('front')}
                              className={actionClass}
                            >
                              To front
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${name} to the back`}
                              aria-disabled={row.canMoveDown && !locked ? undefined : true}
                              aria-describedby={locked ? reasonId : undefined}
                              onClick={() => move('back')}
                              className={actionClass}
                            >
                              To back
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          data-layer-control="rename"
                          aria-label={`${FLV_COPY.layerRename} ${name}`}
                          {...lockedProps}
                          onClick={startRename}
                          className={actionClass}
                        >
                          {FLV_COPY.layerRename}
                        </button>
                        {canDuplicate ? (
                          <button
                            type="button"
                            aria-label={`${FLV_COPY.layerDuplicate} ${name}`}
                            onClick={() => duplicateLayer({ layerId: layer.id })}
                            className={actionClass}
                          >
                            {FLV_COPY.layerDuplicate}
                          </button>
                        ) : null}
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
