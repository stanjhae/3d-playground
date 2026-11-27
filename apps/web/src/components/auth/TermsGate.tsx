import { Link } from '@tanstack/react-router'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { signOut, useSessionStore } from '../../lib/auth/session-store'
import { getSupabaseClient } from '../../lib/auth/supabase-client'
import { useEditorStore } from '../../lib/editor-store'
import { acceptTerms, getProfile } from '../../lib/flp-api/client'
import { failureSentence } from '../../lib/flp-api/plain-messages'
import { TERMS_VERSION, termsAccepted } from '../../lib/terms'

/**
 * Asks a signed-in account to accept the terms of use once (P1), before
 * My Studio or the studio opens. New accounts meet it straight after their
 * first sign-in; accounts from before the terms existed meet it the next
 * time they open either page. Accepting is stored on the account
 * (`profiles.terms_version`), so it isn't asked again on other devices.
 */

// Accounts this tab already knows have accepted, so moving between My
// Studio and the studio doesn't ask the server every time.
const acceptedInThisTab = new Set<string>()

type GateState =
  | { status: 'checking' }
  | { status: 'needed'; error: string | null; busy: boolean }
  | { status: 'failed'; message: string }
  | { status: 'accepted' }

const buttonClass =
  'flv-cta inline-flex min-h-11 items-center justify-center px-5 font-body text-sm font-medium disabled:opacity-50'

export function TermsGate({ children }: { children: ReactNode }) {
  const userId = useSessionStore((state) => state.account?.userId ?? null)
  const [state, setState] = useState<GateState>(() =>
    userId && acceptedInThisTab.has(userId) ? { status: 'accepted' } : { status: 'checking' },
  )

  const check = useCallback(async () => {
    if (!userId) {
      return
    }

    if (acceptedInThisTab.has(userId)) {
      setState({ status: 'accepted' })
      return
    }

    setState({ status: 'checking' })
    const result = await getProfile()

    if (result.ok) {
      if (termsAccepted({ version: result.data.termsVersion })) {
        acceptedInThisTab.add(userId)
        setState({ status: 'accepted' })
      } else {
        setState({ status: 'needed', error: null, busy: false })
      }
    } else if (result.code !== 'account-changed') {
      setState({ status: 'failed', message: result.message })
    }
  }, [userId])

  useEffect(() => {
    void check()
  }, [check])

  // Read the set, not just the state: after an account switch the state
  // still describes the previous account until the check runs.
  if (!userId || acceptedInThisTab.has(userId)) {
    return children
  }

  if (state.status === 'checking' || state.status === 'accepted') {
    return (
      <p role="status" className="mx-auto max-w-xl px-4 py-24 font-body text-sm text-flv-muted">
        Checking your account…
      </p>
    )
  }

  if (state.status === 'failed') {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-start gap-3 px-4 py-24">
        <p role="alert" className="font-body text-sm text-flv-accent">
          {failureSentence({ lead: 'Your account could not load', reason: state.message })}
        </p>
        <button type="button" className={buttonClass} onClick={() => void check()}>
          Try again
        </button>
      </section>
    )
  }

  async function accept() {
    if (!userId) {
      return
    }

    setState({ status: 'needed', error: null, busy: true })
    const result = await acceptTerms({ version: TERMS_VERSION })

    if (result.ok) {
      acceptedInThisTab.add(userId)
      setState({ status: 'accepted' })
    } else if (result.code !== 'account-changed') {
      setState({
        status: 'needed',
        busy: false,
        error: failureSentence({ lead: 'Not accepted', reason: result.message }),
      })
    }
  }

  return (
    <section
      aria-labelledby="terms-gate-heading"
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16"
    >
      <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">One step before you start</p>
      <h1 id="terms-gate-heading" className="font-display text-4xl leading-tight">
        Terms of use
      </h1>
      <p className="font-body text-sm leading-relaxed text-flv-muted">
        Fashion Leader Vote is an early alpha. The terms say that your designs stay yours, what you may upload and
        publish, and how to delete your account. Please read them before you continue.
      </p>
      <p className="font-body text-sm">
        <Link to="/terms" className="underline underline-offset-2 hover:text-flv-accent">
          Read the terms of use
        </Link>
        <span className="text-flv-muted"> · </span>
        <Link to="/privacy" className="underline underline-offset-2 hover:text-flv-accent">
          Privacy
        </Link>
      </p>
      <p className="font-body text-sm text-flv-muted">
        By selecting Accept and continue, you agree to the terms of use. Not now signs you out.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} disabled={state.busy} onClick={() => void accept()}>
          {state.busy ? 'Accepting…' : 'Accept and continue'}
        </button>
        <button
          type="button"
          className="min-h-11 px-2 font-body text-sm text-flv-muted underline underline-offset-2 hover:text-flv-ink"
          onClick={() => {
            void signOut({ client: getSupabaseClient() }).then(() => {
              useEditorStore.getState().reset()
            })
          }}
        >
          Not now
        </button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 font-body text-sm text-flv-accent">
        {state.error}
      </p>
    </section>
  )
}
