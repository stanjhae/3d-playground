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
  throttled: 'Too many attempts. Wait a minute, then try again.',
  network: 'Could not reach the sign-in service. Check your connection and try again.',
  unknown: 'Sign-in did not work. Try again.',
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

  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) {
    return 'network'
  }

  return 'unknown'
}
