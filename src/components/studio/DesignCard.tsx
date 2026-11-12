import { Link } from '@tanstack/react-router'
import { Globe, Lock, Shirt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { clearRecovery, indexedDbRecoveryStorage } from '../../lib/cloud-recovery'
import { type DesignThumbnail, designThumbnail, thumbnailKey } from '../../lib/design-thumbnail'
import { type DesignSummary, deleteDesign, unpublishDesign, updateDesign } from '../../lib/flp-api/client'
import { voteCountLabel } from '../../lib/flp-api/votes'
import { buttonClass } from '../ui/Button'
import { failureSentence } from '../../lib/flp-api/plain-messages'

/**
 * One owned design in My Studio: open, rename in place, duplicate, or delete
 * after a confirmation that names it (A06 #150, A07 #151, P3).
 */

const smallButton =
  'inline-flex min-h-9 items-center rounded-full border border-flv-line bg-white px-3 font-body text-xs font-medium hover:border-flv-ink disabled:opacity-50'

export function DesignCard({
  design,
  ownerId,
  onRenamed,
  onDeleted,
  onDuplicate,
  duplicating = false,
  standing = null,
  onUnpublished,
}: {
  design: DesignSummary
  /** Its place on the public board while published: why vote otherwise? */
  standing?: { rank: number; votes: number } | null
  /** Taken off the board from the card; the list shows it private again. */
  onUnpublished?: () => void
  ownerId: string
  onRenamed: (title: string) => void
  onDeleted: () => void
  onDuplicate: () => void
  /** A copy of this design is being made. */
  duplicating?: boolean
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm-delete'>('view')
  const [title, setTitle] = useState(design.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const previousMode = useRef(mode)

  useEffect(() => {
    if (mode === 'confirm-delete') {
      dialog.current?.showModal()
    } else {
      dialog.current?.close()
    }

    // The buttons come back with view mode: put focus back on the one used.
    if (mode === 'view' && previousMode.current !== 'view') {
      ;(previousMode.current === 'rename' ? renameButton : deleteButton).current?.focus()
    }

    previousMode.current = mode
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
      setError(failureSentence({ lead: 'Not renamed', reason: result.message }))
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
      // Now, not on the next render: the open dialog makes the page inert,
      // and the list moves focus as soon as it hears.
      dialog.current?.close()
      onDeleted()
    } else if (result.code !== 'account-changed') {
      setMode('view')
      setError(failureSentence({ lead: 'Not deleted', reason: result.message }))
    }
  }

  async function unpublish() {
    setBusy(true)
    setError(null)
    const result = await unpublishDesign({ designId: design.id })
    setBusy(false)

    if (result.ok) {
      onUnpublished?.()
    } else if (result.code !== 'account-changed') {
      setError(failureSentence({ lead: 'Still published', reason: result.message }))
    }
  }

  return (
    <div className="flv-panel flex min-h-20 min-w-0 flex-col gap-3 p-4">
      {/* The picture opens the design too; the Edit button is its named twin. */}
      <Link to="/create" search={{ cloud: design.id, step: 'design' }} tabIndex={-1} aria-hidden>
        <CardThumbnail design={design} />
      </Link>
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
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-flv-line bg-white px-2 font-display text-lg"
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
          id={`card-title-${design.id}`}
          to="/create"
          search={{ cloud: design.id, step: 'design' }}
          className="font-display text-lg [overflow-wrap:anywhere] hover:text-flv-accent"
        >
          {design.title}
        </Link>
      )}

      {mode === 'view' ? (
        // Editing and publishing are the card's main jobs, so they're buttons, not a title link to discover.
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/create"
            search={{ cloud: design.id, step: 'design' }}
            aria-describedby={`card-title-${design.id}`}
            className={buttonClass()}
          >
            Edit
          </Link>
          {design.visibility === 'published' ? (
            <button
              type="button"
              className={smallButton}
              disabled={busy}
              aria-label={`Unpublish ${design.title}`}
              onClick={() => void unpublish()}
            >
              {busy ? 'Unpublishing…' : 'Unpublish'}
            </button>
          ) : (
            <Link
              to="/create"
              search={{ cloud: design.id, step: 'share' }}
              aria-describedby={`card-title-${design.id}`}
              className={buttonClass({ variant: 'secondary' })}
            >
              Publish…
            </Link>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-body text-xs text-flv-muted">
          {design.visibility === 'published' ? (
            <Globe aria-hidden className="size-3.5 text-flv-accent" />
          ) : (
            <Lock aria-hidden className="size-3.5" />
          )}
          {design.visibility === 'published' ? 'Published · ' : 'Private · '}
          edited {new Date(design.updatedAt).toLocaleString()}
        </span>
        {design.visibility === 'published' && standing ? (
          <span className="font-body text-xs font-medium text-flv-accent">
            #{standing.rank} on the board ·{' '}
            {/* Read from the database, not claimed (docs/claims-audit.md). */}
            <span data-testid="vote-count">{voteCountLabel({ count: standing.votes })}</span>
          </span>
        ) : null}
        {mode === 'view' ? (
          <span className="flex gap-2">
            <button ref={renameButton} type="button" className={smallButton} onClick={() => setMode('rename')}>
              Rename
            </button>
            <button
              type="button"
              className={smallButton}
              disabled={duplicating}
              aria-label={`Duplicate ${design.title}`}
              onClick={onDuplicate}
            >
              {duplicating ? 'Copying…' : 'Duplicate'}
            </button>
            <button ref={deleteButton} type="button" className={smallButton} onClick={() => setMode('confirm-delete')}>
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
        className="m-auto max-w-md rounded-2xl border border-flv-line bg-white p-6 text-flv-ink shadow-[var(--shadow-flv)] backdrop:bg-black/40"
        onCancel={() => setMode('view')}
      >
        <h2 id={`delete-title-${design.id}`} className="font-display text-2xl [overflow-wrap:anywhere]">
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

/**
 * The design's picture, loaded once the card is near the screen so a long
 * list does not open every design at once. The shirt icon stays until then,
 * and if the picture cannot be made.
 */
function CardThumbnail({ design }: { design: DesignSummary }) {
  const frame = useRef<HTMLDivElement>(null)
  const key = thumbnailKey({ design })
  const [loaded, setLoaded] = useState<{ key: string; thumbnail: DesignThumbnail | null } | null>(null)
  const [broken, setBroken] = useState<string | null>(null)
  const thumbnail = loaded?.key === key ? loaded.thumbnail : null

  useEffect(() => {
    const element = frame.current

    if (!element || design.headSeq === null) {
      return
    }

    let cancelled = false
    const start = () => {
      void designThumbnail({ design }).then((result) => {
        if (!cancelled) {
          setLoaded({ key, thumbnail: result })
        }
      })
    }

    if (typeof IntersectionObserver === 'undefined') {
      start()
      return () => {
        cancelled = true
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          start()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)

    return () => {
      cancelled = true
      observer.disconnect()
    }
    // A rename changes `design` but not `key`; the cached picture returns at once.
  }, [design, key])

  const shown = thumbnail && broken !== thumbnail.src ? thumbnail : null

  return (
    <div
      ref={frame}
      aria-hidden
      data-thumbnail={shown?.kind ?? 'placeholder'}
      className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl text-flv-muted ${shown?.kind === 'render' ? 'bg-white' : 'bg-flv-soft'}`}
    >
      {shown ? (
        <img
          src={shown.src}
          alt=""
          decoding="async"
          className={shown.kind === 'render' ? 'size-full object-contain' : 'h-[88%] w-auto object-contain'}
          onError={() => setBroken(shown.src)}
        />
      ) : (
        <Shirt className="size-16 stroke-[1.1]" />
      )}
    </div>
  )
}
