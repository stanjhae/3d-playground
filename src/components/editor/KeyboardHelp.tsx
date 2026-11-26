import { Keyboard, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { cn } from '../../lib/cn'
import { useShortcutsHelp } from '../../lib/shortcuts-help'
import {
  chromeMutedClass,
  chromeTextClass,
  railFrameClass,
} from '../../lib/studio-chrome'
import { studioKeyList } from '../../lib/studio-keys'

/** The button that opens the shortcuts: by Undo and Redo, and in the Design rail. */
export function ShortcutsButton({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const open = useShortcutsHelp((state) => state.open)
  const setOpen = useShortcutsHelp((state) => state.setOpen)

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Shift+?"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      data-testid="shortcuts-button"
      onClick={() => setOpen({ open: true })}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-flv-muted hover:text-flv-accent',
        chromeTextClass(),
        className,
      )}
    >
      <Keyboard aria-hidden className="size-4" />
      {showLabel ? <span>Keyboard shortcuts</span> : null}
      <kbd aria-hidden className="hidden rounded border border-flv-line px-1 font-body text-[0.7rem] leading-4 xl:inline">
        ?
      </kbd>
    </button>
  )
}

/**
 * The studio's keyboard alternatives (#163) in a modal: `?` opens and
 * closes it, Esc or the close button closes it, focus goes back to where
 * it was.
 */
export function ShortcutsDialog() {
  const open = useShortcutsHelp((state) => state.open)
  const setOpen = useShortcutsHelp((state) => state.setOpen)
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
      data-testid="shortcuts-dialog"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-flv-line bg-white p-5 text-flv-ink shadow-[var(--shadow-flv)] backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault()
        setOpen({ open: false })
      }}
      onClose={() => setOpen({ open: false })}
      onClick={(event) => {
        // A click on the backdrop (the dialog box itself, outside its content) closes it.
        if (event.target === event.currentTarget) {
          setOpen({ open: false })
        }
      }}
      onKeyDown={(event) => {
        // ? closes it again, as it opened it.
        if (event.key === '?') {
          event.preventDefault()
          setOpen({ open: false })
        }
      }}
    >
      {open ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-display text-2xl">
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              autoFocus
              aria-label="Close keyboard shortcuts"
              onClick={() => setOpen({ open: false })}
              className="grid size-11 place-items-center text-flv-muted hover:text-flv-accent"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <KeyList />
        </div>
      ) : null}
    </dialog>
  )
}

function KeyList() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {studioKeyList().map((entry) => (
        <div key={entry.keys} className="contents">
          <dt className="font-body text-xs text-flv-ink">
            <kbd className="font-body">{entry.keys}</kbd>
          </dt>
          <dd className={chromeMutedClass()}>{entry.does}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * In the Design rail: a way into the same shortcuts dialog. It used to be a
 * folded <details> at the very bottom of the column, where nobody found it.
 */
export function KeyboardHelp() {
  return (
    <div className={cn(railFrameClass(), 'gap-2')}>
      <ShortcutsButton showLabel className="justify-start px-0" />
    </div>
  )
}
