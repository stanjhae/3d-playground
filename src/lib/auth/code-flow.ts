/**
 * Email-code sign-in state (A02 #146). Pure so every branch is testable;
 * the screen dispatches actions and renders the state.
 */

export const CODE_LENGTH = 6
/** Matches `max_frequency` in supabase/config.toml. */
export const RESEND_SECONDS = 60

export type CodeFlowError =
  | 'invalid-email'
  | 'invalid-code'
  | 'wrong-or-expired-code'
  | 'throttled'
  | 'send-failed'
  | 'network'
  | 'unknown'

export type CodeFlowState = {
  step: 'email' | 'code' | 'done'
  email: string
  busy: boolean
  error: CodeFlowError | null
  /** Epoch ms when Resend becomes available. */
  resendAt: number | null
}

export type CodeFlowAction =
  | { type: 'request'; email: string }
  | { type: 'requested'; now: number }
  | { type: 'verify' }
  | { type: 'verified' }
  | { type: 'failed'; error: CodeFlowError; now?: number }
  | { type: 'change-email' }

export const INITIAL_CODE_FLOW: CodeFlowState = {
  step: 'email',
  email: '',
  busy: false,
  error: null,
  resendAt: null,
}

export const CODE_FLOW_MESSAGES: Record<CodeFlowError, string> = {
  'invalid-email': 'Enter an email address like name@example.com.',
  'invalid-code': `Enter the ${CODE_LENGTH}-digit code from the email.`,
  'wrong-or-expired-code':
    'That code is wrong, already used or expired. Check the latest email or send a new code.',
  throttled: 'Too many attempts. Wait a minute, then try again. If you still see this, try again in an hour.',
  'send-failed': 'We could not send your code. Try again in a few minutes.',
  network: 'Could not reach the sign-in service. Check your connection and try again.',
  unknown: 'Sign-in did not work. Try again.',
}

/** Shown on sign-in when a session ended without the person signing out. */
export const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in again to carry on; your work is still here.'

/** Matches the expiry the sign-in email states. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000

const CODE_STEP_KEY = 'flp-sign-in-code-step'

type CodeStepStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Remembers, for this tab only, that a code was sent to `email`, so a
 * reload stays on the code step. The code itself is never stored.
 */
export function rememberCodeStep({
  storage,
  email,
  sentAt,
}: {
  storage: CodeStepStorage | null
  email: string
  sentAt: number
}) {
  try {
    storage?.setItem(CODE_STEP_KEY, JSON.stringify({ email, sentAt }))
  } catch {
    // Without storage a reload just asks for the email again.
  }
}

export function forgetCodeStep({ storage }: { storage: CodeStepStorage | null }) {
  try {
    storage?.removeItem(CODE_STEP_KEY)
  } catch {
    // Nothing was kept.
  }
}

/** Back on the code step if a code sent to this tab can still work. */
export function restoreCodeFlow({
  storage,
  now,
}: {
  storage: CodeStepStorage | null
  now: number
}): CodeFlowState {
  try {
    const saved = JSON.parse(storage?.getItem(CODE_STEP_KEY) ?? 'null') as { email?: unknown; sentAt?: unknown } | null

    if (
      saved &&
      typeof saved.email === 'string' &&
      isValidEmail({ value: saved.email }) &&
      typeof saved.sentAt === 'number' &&
      saved.sentAt <= now &&
      now - saved.sentAt < CODE_LIFETIME_MS
    ) {
      return { ...INITIAL_CODE_FLOW, step: 'code', email: saved.email, resendAt: saved.sentAt + RESEND_SECONDS * 1000 }
    }
  } catch {
    // Unreadable means start over.
  }

  return INITIAL_CODE_FLOW
}

export function normalizeEmail({ value }: { value: string }) {
  return value.trim().toLowerCase()
}

export function isValidEmail({ value }: { value: string }) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Accepts pasted codes with spaces or dashes; null if not six digits. */
export function normalizeCode({ value }: { value: string }) {
  const digits = value.replace(/[\s-]/g, '')
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits) ? digits : null
}

export function resendSecondsLeft({
  state,
  now,
}: {
  state: CodeFlowState
  now: number
}) {
  return state.resendAt === null
    ? 0
    : Math.max(0, Math.ceil((state.resendAt - now) / 1000))
}

export function codeFlowReducer(
  state: CodeFlowState,
  action: CodeFlowAction,
): CodeFlowState {
  if (action.type === 'request') {
    return { ...state, email: action.email, busy: true, error: null }
  }

  if (action.type === 'requested') {
    return {
      ...state,
      step: 'code',
      busy: false,
      error: null,
      resendAt: action.now + RESEND_SECONDS * 1000,
    }
  }

  if (action.type === 'verify') {
    return { ...state, busy: true, error: null }
  }

  if (action.type === 'verified') {
    return { ...state, step: 'done', busy: false, error: null }
  }

  if (action.type === 'failed') {
    return {
      ...state,
      busy: false,
      error: action.error,
      resendAt:
        action.error === 'throttled' && action.now !== undefined
          ? action.now + RESEND_SECONDS * 1000
          : state.resendAt,
    }
  }

  return { ...INITIAL_CODE_FLOW, email: state.email }
}

/**
 * Maps Supabase Auth errors to a neutral flow error. Supabase reports a
 * wrong, reused and expired code the same way (`otp_expired`), and the
 * request step never says whether an account exists.
 */
export function codeFlowErrorFromAuth({
  error,
}: {
  error: { code?: string; status?: number; name?: string } | null | undefined
}): CodeFlowError {
  const code = error?.code ?? ''

  if (code === 'otp_expired' || code === 'otp_disabled') {
    return 'wrong-or-expired-code'
  }

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    error?.status === 429
  ) {
    return 'throttled'
  }

  if (code === 'email_address_invalid' || code === 'validation_failed') {
    return 'invalid-email'
  }

  // Auth reports a 5xx with the same error name as a lost connection; only
  // status 0 means the request never got an answer.
  if (error?.status === 0) {
    return 'network'
  }

  return 'unknown'
}

/** The same, for asking for a code: what's left is that the email didn't go. */
export function sendErrorFromAuth({
  error,
}: {
  error: { code?: string; status?: number; name?: string } | null | undefined
}): CodeFlowError {
  const failure = codeFlowErrorFromAuth({ error })
  return failure === 'unknown' ? 'send-failed' : failure
}
