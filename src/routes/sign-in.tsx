import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useReducer, useRef, useState } from 'react'

import {
  CODE_FLOW_MESSAGES,
  CODE_LENGTH,
  INITIAL_CODE_FLOW,
  codeFlowErrorFromAuth,
  codeFlowReducer,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
  resendSecondsLeft,
} from '../lib/auth/code-flow'
import { safeReturnPath } from '../lib/auth/return-path'
import { useSessionStore } from '../lib/auth/session-store'
import { getSupabaseClient } from '../lib/auth/supabase-client'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeReturnPath({ value: search.returnTo }),
  }),
  component: SignIn,
})

const fieldClass =
  'min-h-11 w-full border border-flv-line bg-flv-paper px-3 font-body text-base text-flv-ink focus:border-flv-accent focus:outline-none'
const errorFieldClass = 'border-flv-accent'
const buttonClass =
  'flv-cta inline-flex min-h-11 items-center justify-center px-5 font-body text-xs tracking-[0.1em] uppercase disabled:opacity-50'
const quietButtonClass =
  'inline-flex min-h-11 items-center px-1 font-body text-xs tracking-[0.08em] text-flv-muted uppercase underline-offset-4 hover:text-flv-accent hover:underline disabled:no-underline disabled:opacity-60'

function SignIn() {
  const router = useRouter()
  const { returnTo } = Route.useSearch()
  const status = useSessionStore((state) => state.status)
  const [state, dispatch] = useReducer(codeFlowReducer, INITIAL_CODE_FLOW)
  const [emailDraft, setEmailDraft] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const client = getSupabaseClient()
  const secondsLeft = resendSecondsLeft({ state, now })

  useEffect(() => {
    if (status === 'signed-in') {
      router.history.replace(returnTo)
    }
  }, [status, returnTo, router])

  useEffect(() => {
    if (state.resendAt === null || state.resendAt <= Date.now()) {
      return
    }

    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [state.resendAt])

  useEffect(() => {
    const target = state.step === 'code' ? codeRef.current : emailRef.current
    target?.focus()
  }, [state.step, state.error])

  async function requestCode({ email }: { email: string }) {
    if (!client) {
      return
    }

    dispatch({ type: 'request', email })
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    if (error) {
      dispatch({
        type: 'failed',
        error: codeFlowErrorFromAuth({ error }),
        now: Date.now(),
      })
      return
    }

    setCodeDraft('')
    setNow(Date.now())
    dispatch({ type: 'requested', now: Date.now() })
  }

  async function verifyCode({ token }: { token: string }) {
    if (!client) {
      return
    }

    dispatch({ type: 'verify' })
    const { data, error } = await client.auth.verifyOtp({
      email: state.email,
      token,
      type: 'email',
    })

    if (error || !data.session) {
      setCodeDraft('')
      dispatch({ type: 'failed', error: codeFlowErrorFromAuth({ error }) })
      return
    }

    dispatch({ type: 'verified' })
  }

  const errorMessage = state.error ? CODE_FLOW_MESSAGES[state.error] : null

  return (
    <section className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col justify-center gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <p className="font-body text-xs tracking-[0.16em] text-flv-muted uppercase">
          Sign in
        </p>
        <h1 className="font-display text-4xl leading-tight">
          {state.step === 'code' ? 'Check your email' : 'Sign in with a code'}
        </h1>
        <p className="font-body text-sm text-flv-muted">
          {state.step === 'code'
            ? `If ${state.email} can receive email, a ${CODE_LENGTH}-digit code is on its way. It works once and expires in 10 minutes.`
            : 'We email you a one-time code. No password needed; new accounts are created on first sign-in.'}
        </p>
      </header>

      {!client ? (
        <p role="alert" className="font-body text-sm text-flv-accent">
          Sign-in is not configured in this environment.
        </p>
      ) : state.step === 'code' || state.step === 'done' ? (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const token = normalizeCode({ value: codeDraft })

            if (!token) {
              dispatch({ type: 'failed', error: 'invalid-code' })
              return
            }

            void verifyCode({ token })
          }}
        >
          <label htmlFor="sign-in-code" className="font-body text-sm">
            {CODE_LENGTH}-digit code
          </label>
          <input
            ref={codeRef}
            id="sign-in-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH * 2}
            value={codeDraft}
            onChange={(event) => setCodeDraft(event.target.value)}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={errorMessage ? 'sign-in-error' : undefined}
            className={cn(fieldClass, 'tracking-[0.4em]', {
              [errorFieldClass]: Boolean(state.error),
            })}
          />
          <button type="submit" className={buttonClass} disabled={state.busy}>
            {state.busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className={quietButtonClass}
              disabled={state.busy || secondsLeft > 0}
              onClick={() => void requestCode({ email: state.email })}
            >
              {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : 'Send a new code'}
            </button>
            <button
              type="button"
              className={quietButtonClass}
              disabled={state.busy}
              onClick={() => {
                setEmailDraft(state.email)
                dispatch({ type: 'change-email' })
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const email = normalizeEmail({ value: emailDraft })

            if (!isValidEmail({ value: email })) {
              dispatch({ type: 'failed', error: 'invalid-email' })
              return
            }

            void requestCode({ email })
          }}
        >
          <label htmlFor="sign-in-email" className="font-body text-sm">
            Email
          </label>
          <input
            ref={emailRef}
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(event) => setEmailDraft(event.target.value)}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={errorMessage ? 'sign-in-error' : undefined}
            className={cn(fieldClass, { [errorFieldClass]: Boolean(state.error) })}
          />
          <button
            type="submit"
            className={buttonClass}
            disabled={state.busy || secondsLeft > 0}
          >
            {state.busy
              ? 'Sending…'
              : secondsLeft > 0
                ? `Try again in ${secondsLeft}s`
                : 'Email me a code'}
          </button>
        </form>
      )}

      <p
        id="sign-in-error"
        role="status"
        aria-live="polite"
        className="min-h-5 font-body text-sm text-flv-accent"
      >
        {errorMessage}
      </p>
    </section>
  )
}
