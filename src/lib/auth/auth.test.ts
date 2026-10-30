import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  INITIAL_CODE_FLOW,
  RESEND_SECONDS,
  codeFlowErrorFromAuth,
  codeFlowReducer,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
  resendSecondsLeft,
} from './code-flow'
import { DEFAULT_RETURN_PATH, safeReturnPath } from './return-path'
import {
  accountGuard,
  applySession,
  onAccountChange,
  useSessionStore,
} from './session-store'

function session({ userId, token = 'token' }: { userId: string; token?: string }) {
  return {
    access_token: token,
    user: { id: userId, email: `${userId}@example.test` },
  } as unknown as Session
}

describe('safeReturnPath', () => {
  test.each([
    ['/create', '/create'],
    ['/create?design=abc#layers', '/create?design=abc#layers'],
    ['/look/abc', '/look/abc'],
  ])('keeps internal path %s', (value, expected) => {
    expect(safeReturnPath({ value })).toBe(expected)
  })

  test.each([
    'https://evil.example/create',
    '//evil.example/create',
    '/\\evil.example',
    'javascript:alert(1)',
    'create',
    '/sign-in?returnTo=/create',
    '/create\n',
    '',
    42,
    undefined,
  ])('rejects %s', (value) => {
    expect(safeReturnPath({ value })).toBe(DEFAULT_RETURN_PATH)
  })
})

describe('code flow', () => {
  test('normalizes email and pasted codes', () => {
    expect(normalizeEmail({ value: '  Ada@Example.COM ' })).toBe('ada@example.com')
    expect(isValidEmail({ value: 'ada@example.com' })).toBe(true)
    expect(isValidEmail({ value: 'ada@' })).toBe(false)
    expect(normalizeCode({ value: '123 456' })).toBe('123456')
    expect(normalizeCode({ value: '123-456' })).toBe('123456')
    expect(normalizeCode({ value: '12345' })).toBeNull()
    expect(normalizeCode({ value: '12345a' })).toBeNull()
  })

  test('request → code step with a resend countdown', () => {
    const requested = codeFlowReducer(
      codeFlowReducer(INITIAL_CODE_FLOW, { type: 'request', email: 'a@b.co' }),
      { type: 'requested', now: 1_000 },
    )

    expect(requested).toMatchObject({ step: 'code', email: 'a@b.co', busy: false })
    expect(resendSecondsLeft({ state: requested, now: 1_000 })).toBe(RESEND_SECONDS)
    expect(resendSecondsLeft({ state: requested, now: 1_000 + RESEND_SECONDS * 1000 })).toBe(0)
  })

  test('a wrong, reused or expired code stays on the code step', () => {
    const onCode = { ...INITIAL_CODE_FLOW, step: 'code' as const, email: 'a@b.co' }
    const failed = codeFlowReducer(codeFlowReducer(onCode, { type: 'verify' }), {
      type: 'failed',
      error: codeFlowErrorFromAuth({ error: { code: 'otp_expired', status: 403 } }),
    })

    expect(failed).toMatchObject({ step: 'code', error: 'wrong-or-expired-code', busy: false })
  })

  test('throttling starts a wait', () => {
    const failed = codeFlowReducer(INITIAL_CODE_FLOW, {
      type: 'failed',
      error: codeFlowErrorFromAuth({ error: { code: 'over_email_send_rate_limit', status: 429 } }),
      now: 5_000,
    })

    expect(failed.error).toBe('throttled')
    expect(resendSecondsLeft({ state: failed, now: 5_000 })).toBe(RESEND_SECONDS)
  })

  test('maps network and unknown errors neutrally', () => {
    expect(codeFlowErrorFromAuth({ error: { name: 'AuthRetryableFetchError', status: 0 } })).toBe(
      'network',
    )
    expect(codeFlowErrorFromAuth({ error: { code: 'user_not_found', status: 400 } })).toBe(
      'unknown',
    )
  })
})

describe('session store', () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: 'loading',
      account: null,
      accessToken: null,
      accountEpoch: 0,
    })
  })

  test('a refresh for the same account keeps in-flight work valid', () => {
    applySession({ session: session({ userId: 'a', token: 't1' }) })
    const stillA = accountGuard()

    applySession({ session: session({ userId: 'a', token: 't2' }) })

    expect(stillA()).toBe(true)
    expect(useSessionStore.getState().accessToken).toBe('t2')
  })

  test('a response started for account A is dropped once B signs in', () => {
    applySession({ session: session({ userId: 'a' }) })
    const stillA = accountGuard()

    applySession({ session: null })
    applySession({ session: session({ userId: 'b' }) })

    expect(stillA()).toBe(false)
    expect(useSessionStore.getState().account?.userId).toBe('b')
  })

  test('expiry signs out and invalidates in-flight work', () => {
    applySession({ session: session({ userId: 'a' }) })
    const stillA = accountGuard()

    applySession({ session: null })

    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-out',
      account: null,
      accessToken: null,
    })
    expect(stillA()).toBe(false)
  })

  test('listeners hear every account change, including the first load', () => {
    const seen: Array<string | null> = []
    const stop = onAccountChange((next) => seen.push(next?.userId ?? null))

    applySession({ session: session({ userId: 'a' }) })
    applySession({ session: session({ userId: 'a', token: 'refreshed' }) })
    applySession({ session: session({ userId: 'b' }) })
    applySession({ session: null })
    stop()

    expect(seen).toEqual(['a', 'b', null])
  })
})
