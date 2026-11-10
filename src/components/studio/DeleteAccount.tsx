import { useNavigate } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'

import { forgetAccountLocally } from '../../lib/account-local-data'
import { signOut, useSessionStore } from '../../lib/auth/session-store'
import { getSupabaseClient } from '../../lib/auth/supabase-client'
import { useEditorStore } from '../../lib/editor-store'
import { deleteOwnAccount } from '../../lib/flp-api/client'
import { sameEmail } from '../../lib/flp-api/contract'
import { failureSentence } from '../../lib/flp-api/plain-messages'

/**
 * Self-serve account deletion (P1), at the foot of My Studio. Two steps:
 * open the panel, then type the account's email to confirm. The server
 * removes the files, then the account; the database removes everything
 * else with it (`src/lib/flp-api/account-deletion.mjs`, the same steps as
 * `scripts/delete-account.mjs`). Then this browser forgets the account's
 * local copies and signs out.
 */
export function DeleteAccount({ designCount }: { designCount: number | null }) {
  const email = useSessionStore((state) => state.account?.email ?? null)
  const userId = useSessionStore((state) => state.account?.userId ?? null)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const opener = useRef<HTMLButtonElement | null>(null)
  const confirmed = sameEmail({ typed, account: email })

  if (!email || !userId) {
    return null
  }

  const designs =
    designCount === null ? 'all your designs' : designCount === 1 ? 'your 1 design' : `all ${designCount} of your designs`

  async function remove() {
    if (!confirmed || !userId) {
      return
    }

    setBusy(true)
    setError(null)
    const result = await deleteOwnAccount({ confirmEmail: typed })

    if (!result.ok) {
      setBusy(false)

      if (result.code !== 'account-changed') {
        setError(failureSentence({ lead: 'Your account was not deleted', reason: result.message }))
      }

      return
    }

    await forgetAccountLocally({ ownerId: userId })
    // Leave the protected page first, so the sign-out below doesn't send
    // the browser to sign-in instead.
    await navigate({ to: '/account-deleted' })
    await signOut({ client: getSupabaseClient() })
    useEditorStore.getState().reset()
  }

  return (
    <section aria-labelledby="delete-account-heading" className="mt-8 flex flex-col gap-3 border-t border-flv-line pt-6">
      <h2 id="delete-account-heading" className="font-display text-2xl">
        Delete account
      </h2>
      {!open ? (
        <div className="flex flex-col items-start gap-2">
          <p className="font-body text-sm text-flv-muted">
            Deletes your account and everything in it. You can’t undo this.
          </p>
          <button
            ref={opener}
            type="button"
            className="inline-flex min-h-11 items-center rounded-full border border-flv-line bg-white px-4 font-body text-sm hover:border-flv-ink"
            onClick={() => setOpen(true)}
          >
            Delete account…
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col items-start gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void remove()
          }}
        >
          <p className="font-body text-sm text-flv-ink">
            This permanently deletes your account, {designs}, their saved history and pictures, every image you
            uploaded, and the public links of anything you published. You will be signed out. It can’t be undone.
          </p>
          <label htmlFor={inputId} className="font-body text-sm text-flv-muted">
            To confirm, type your email address: <strong className="text-flv-ink">{email}</strong>
          </label>
          <input
            id={inputId}
            type="email"
            autoComplete="off"
            autoFocus
            className="min-h-11 w-full max-w-sm rounded-lg border border-flv-line bg-white px-3 font-body text-sm text-flv-ink"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              setError(null)
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!confirmed || busy}
              className="inline-flex min-h-11 items-center rounded-full bg-flv-accent px-5 font-body text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 px-2 font-body text-sm text-flv-muted underline underline-offset-2 hover:text-flv-ink"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
                requestAnimationFrame(() => opener.current?.focus())
              }}
            >
              Cancel
            </button>
          </div>
          <p role="status" aria-live="polite" className="min-h-5 font-body text-sm text-flv-accent">
            {error}
          </p>
        </form>
      )}
    </section>
  )
}
