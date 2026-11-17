import { Link } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { acceptTerms, reportDesign } from '../../lib/flp-api/client'
import type { DesignComment } from '../../lib/flp-api/contract'
import { addComment, getComments, hideComment } from '../../lib/community'
import { TERMS_VERSION } from '../../lib/terms'

const MAX = 500

/**
 * Comments on a shared design (community, behind `VITE_COMMUNITY`).
 * Anyone with the link reads them; signed in, people comment, take their
 * own down, report others'; the design's owner can hide any on it.
 */
export default function Comments({ slug }: { slug: string }) {
  const status = useSessionStore((state) => state.status)
  const accountEpoch = useSessionStore((state) => state.accountEpoch)
  const [comments, setComments] = useState<DesignComment[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Commenting asks for the terms once, here, like voting (P1).
  const [needsTerms, setNeedsTerms] = useState(false)
  const inputId = useId()

  useEffect(() => {
    if (status === 'loading') return
    let cancelled = false

    void getComments({ slug }).then((result) => {
      if (cancelled) return
      setFailed(!result.ok)
      if (result.ok) setComments(result.data.comments)
    })

    return () => {
      cancelled = true
    }
  }, [slug, status, accountEpoch])

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setMessage(null)
    const result = await addComment({ slug, body })
    setBusy(false)

    if (result.ok) {
      setComments(result.data.comments)
      setDraft('')
      setMessage('Comment posted')
    } else if (result.code !== 'account-changed') {
      if (result.code === 'terms_required') {
        setNeedsTerms(true)
      } else {
        setMessage(`Not posted. ${result.message}`)
      }
    }
  }

  async function acceptAndPost() {
    setBusy(true)
    const accepted = await acceptTerms({ version: TERMS_VERSION })
    setBusy(false)

    if (accepted.ok) {
      setNeedsTerms(false)
      await send()
    } else if (accepted.code !== 'account-changed') {
      setMessage(`The terms were not accepted. ${accepted.message}`)
    }
  }

  async function hide(comment: DesignComment) {
    const result = await hideComment({ slug, commentId: comment.id })

    if (result.ok) {
      setComments(result.data.comments)
      setMessage(comment.mine ? 'Your comment was removed' : 'Comment hidden')
    } else if (result.code !== 'account-changed') {
      setMessage(`Not removed. ${result.message}`)
    }
  }

  return (
    <section aria-labelledby={`${inputId}-heading`} className="flex flex-col gap-4 border-t border-flv-line pt-6">
      <h2 id={`${inputId}-heading`} className="font-display text-2xl">
        Comments{comments ? ` (${comments.length})` : ''}
      </h2>

      {failed ? <p className="font-body text-sm text-flv-muted">Comments can’t load right now.</p> : null}
      {comments && comments.length === 0 ? <p className="font-body text-sm text-flv-muted">No comments yet.</p> : null}

      {comments && comments.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1 rounded-xl border border-flv-line bg-white p-3">
              <p className="font-body text-xs text-flv-muted">
                {comment.authorHandle ? (
                  <Link to="/u/$handle" params={{ handle: comment.authorHandle }} className="font-medium text-flv-ink underline-offset-2 hover:underline">
                    {comment.authorName ?? `@${comment.authorHandle}`}
                  </Link>
                ) : (
                  <span className="font-medium text-flv-ink">{comment.authorName ?? 'A designer'}</span>
                )}{' '}
                · <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>
              </p>
              <p className="font-body text-sm whitespace-pre-line text-flv-ink [overflow-wrap:anywhere]">{comment.body}</p>
              {status === 'signed-in' ? (
                <div className="flex gap-3 font-body text-xs text-flv-muted">
                  {comment.canHide ? (
                    <button type="button" className="underline hover:text-flv-accent" onClick={() => void hide(comment)}>
                      {comment.mine ? 'Delete' : 'Hide'}
                    </button>
                  ) : null}
                  {!comment.mine ? <ReportComment slug={slug} commentId={comment.id} onDone={setMessage} /> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {status === 'signed-in' ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <label htmlFor={inputId} className="font-body text-xs font-medium text-flv-ink">
            Add a comment
          </label>
          <textarea
            id={inputId}
            value={draft}
            maxLength={MAX}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            className="rounded-lg border border-flv-line bg-white px-2 py-1 font-body text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex min-h-9 items-center rounded-full bg-flv-ink px-4 font-body text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Posting…' : 'Post comment'}
            </button>
            <span className="font-body text-xs text-flv-muted">
              {draft.length}/{MAX}
            </span>
          </div>
          {needsTerms ? (
            <div className="flex flex-wrap items-center gap-2 font-body text-xs text-flv-ink">
              <span>
                To comment, accept the{' '}
                <Link to="/terms" className="underline" target="_blank">
                  terms of use
                </Link>
                .
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void acceptAndPost()}
                className="inline-flex min-h-9 items-center rounded-full bg-flv-ink px-3 font-medium text-white disabled:opacity-50"
              >
                Accept and post
              </button>
            </div>
          ) : null}
        </form>
      ) : status === 'signed-out' ? (
        <Link to="/sign-in" search={{ returnTo: `/s/${slug}` }} className="font-body text-sm underline">
          Sign in to comment
        </Link>
      ) : null}

      <p role="status" aria-live="polite" className="min-h-5 font-body text-xs text-flv-muted">
        {message}
      </p>
    </section>
  )
}

function ReportComment({ slug, commentId, onDone }: { slug: string; commentId: string; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const selectId = useId()

  if (!open) {
    return (
      <button type="button" className="underline hover:text-flv-accent" onClick={() => setOpen(true)}>
        Report
      </button>
    )
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        const reason = (new FormData(event.currentTarget).get('reason') ?? 'other') as 'offensive' | 'spam' | 'other'
        const result = await reportDesign({ slug, request: { reason, commentId } })
        setOpen(false)
        onDone(result.ok ? 'Thanks. An operator will look at this comment.' : `Not reported. ${result.message}`)
      }}
    >
      <label htmlFor={selectId} className="sr-only">
        Why are you reporting this comment?
      </label>
      <select id={selectId} name="reason" className="min-h-8 rounded border border-flv-line bg-white px-1">
        <option value="offensive">Offensive</option>
        <option value="spam">Spam</option>
        <option value="other">Something else</option>
      </select>
      <button type="submit" className="underline">
        Send report
      </button>
    </form>
  )
}
