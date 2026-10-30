import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { clearRecovery, indexedDbRecoveryStorage } from '../../lib/cloud-recovery'
import { type DesignSummary, deleteDesign, updateDesign } from '../../lib/flp-api/client'

/**
 * One owned design in My Studio: open, rename in place, or delete after a
 * confirmation that names it (A06 #150, A07 #151).
 */

const smallButton =
  'inline-flex min-h-9 items-center px-3 font-body text-[11px] tracking-[0.1em] uppercase border border-flv-line hover:border-flv-accent hover:text-flv-accent disabled:opacity-50'

export function DesignCard({
  design,
  ownerId,
  onRenamed,
  onDeleted,
}: {
  design: DesignSummary
  ownerId: string
  onRenamed: (title: string) => void
  onDeleted: () => void
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm-delete'>('view')
  const [title, setTitle] = useState(design.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (mode === 'confirm-delete') {
      dialog.current?.showModal()
    } else {
      dialog.current?.close()
    }
  }, [mode])

  async function rename() {
    const next = title.trim()

    if (!next || next === design.title) {
      setMode('view')
      setTitle(design.title)
      return
    }

    setBusy(true)
    setError(null)
    const result = await updateDesign({ designId: design.id, request: { title: next } })
    setBusy(false)

    if (result.ok) {
      onRenamed(result.data.title)
      setMode('view')
    } else if (result.code !== 'account-changed') {
      setError(`Not renamed (${result.message}).`)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    const result = await deleteDesign({ designId: design.id })
    setBusy(false)

    if (result.ok) {
      // Local recovery for a deleted design would only offer a dead end.
      void clearRecovery({ storage: indexedDbRecoveryStorage, ownerId, designId: design.id })
      setMode('view')
      onDeleted()
    } else if (result.code !== 'account-changed') {
      setMode('view')
      setError(`Not deleted (${result.message}).`)
    }
  }

  return (
    <div className="flex min-h-20 flex-col gap-3 border border-flv-line bg-flv-paper p-4">
      {mode === 'rename' ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void rename()
          }}
        >
          <label className="sr-only" htmlFor={`title-${design.id}`}>
            Design name
          </label>
          <input
            id={`title-${design.id}`}
            className="min-h-9 min-w-0 flex-1 border border-flv-line bg-transparent px-2 font-display text-xl"
            value={title}
            maxLength={80}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTitle(design.title)
                setMode('view')
              }
            }}
          />
          <button type="submit" className={smallButton} disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              setTitle(design.title)
              setMode('view')
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <Link
          to="/create"
          search={{ cloud: design.id, step: 'design' }}
          className="font-display text-xl hover:text-flv-accent"
        >
          {design.title}
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-body text-xs text-flv-muted">
          {design.visibility === 'published' ? 'Published · ' : 'Private · '}
          edited {new Date(design.updatedAt).toLocaleString()}
        </span>
        {mode === 'view' ? (
          <span className="flex gap-2">
            <button type="button" className={smallButton} onClick={() => setMode('rename')}>
              Rename
            </button>
            <button type="button" className={smallButton} onClick={() => setMode('confirm-delete')}>
              Delete
            </button>
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="font-body text-xs text-flv-accent">
          {error}
        </p>
      ) : null}

      <dialog
        ref={dialog}
        aria-labelledby={`delete-title-${design.id}`}
        className="m-auto max-w-md border border-flv-line bg-flv-paper p-6 text-flv-ink backdrop:bg-black/40"
        onCancel={() => setMode('view')}
      >
        <h2 id={`delete-title-${design.id}`} className="font-display text-2xl">
          Delete “{design.title}”?
        </h2>
        <p className="mt-2 font-body text-sm text-flv-muted">
          This deletes the design and all of its history. It cannot be undone.
          {design.visibility === 'published' ? ' Its public link stops working straight away.' : ''}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={smallButton} onClick={() => setMode('view')} autoFocus>
            Keep it
          </button>
          <button
            type="button"
            className={`${smallButton} border-flv-accent text-flv-accent`}
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? 'Deleting…' : 'Delete design'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
