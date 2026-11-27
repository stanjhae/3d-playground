import { type ReactNode, useEffect, useId, useRef } from 'react'

const dialogButton =
  'inline-flex min-h-9 items-center rounded-full border border-flv-line bg-white px-3 font-body text-xs font-medium hover:border-flv-ink disabled:opacity-50'

/**
 * A modal question before an action that can't be quietly taken back
 * (unpublishing kills the public link at once). The safe choice has focus;
 * Escape and the safe choice both cancel.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const node = dialog.current

    if (!node) {
      return
    }

    if (open && !node.open) {
      node.showModal()
    } else if (!open && node.open) {
      node.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto max-w-md rounded-2xl border border-flv-line bg-white p-6 text-flv-ink shadow-[var(--shadow-flv)] backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      {open ? (
        <>
          <h2 id={titleId} className="font-display text-2xl [overflow-wrap:anywhere]">
            {title}
          </h2>
          <div className="mt-2 font-body text-sm text-flv-muted">{children}</div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={dialogButton} onClick={onCancel} autoFocus>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`${dialogButton} border-flv-accent text-flv-accent`}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy && busyLabel ? busyLabel : confirmLabel}
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  )
}
