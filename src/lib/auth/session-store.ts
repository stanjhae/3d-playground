import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

/**
 * One place for the signed-in account (A03 #147): initial load, refresh,
 * expiry and sign-out all flow through `applySession`.
 *
 * `accountEpoch` changes whenever the account changes (sign-in, sign-out,
 * switch, expiry). Async work captures `accountGuard()` before it starts
 * and drops its result if the guard no longer holds, so a response for
 * account A never lands in account B's studio. Code that holds private
 * state registers `onAccountChange` to clear it.
 */

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in' | 'unavailable'

export type SessionAccount = {
  userId: string
  email: string | null
}

type SessionState = {
  status: SessionStatus
  account: SessionAccount | null
  accessToken: string | null
  accountEpoch: number
}

export const useSessionStore = create<SessionState>(() => ({
  status: 'loading',
  account: null,
  accessToken: null,
  accountEpoch: 0,
}))

type AccountChangeListener = (next: SessionAccount | null) => void

const accountChangeListeners = new Set<AccountChangeListener>()

export function onAccountChange(listener: AccountChangeListener) {
  accountChangeListeners.add(listener)
  return () => {
    accountChangeListeners.delete(listener)
  }
}

export function applySession({ session }: { session: Session | null }) {
  const previous = useSessionStore.getState()
  const account: SessionAccount | null = session
    ? { userId: session.user.id, email: session.user.email ?? null }
    : null
  const changed =
    previous.status === 'loading' ||
    previous.account?.userId !== account?.userId

  useSessionStore.setState({
    status: account ? 'signed-in' : 'signed-out',
    account,
    accessToken: session?.access_token ?? null,
    accountEpoch: changed ? previous.accountEpoch + 1 : previous.accountEpoch,
  })

  if (changed) {
    for (const listener of accountChangeListeners) {
      listener(account)
    }
  }
}

export function markAuthUnavailable() {
  useSessionStore.setState({
    status: 'unavailable',
    account: null,
    accessToken: null,
  })
}

/** True while the account that started some async work is still current. */
export function accountGuard() {
  const { accountEpoch, account } = useSessionStore.getState()
  const userId = account?.userId ?? null

  return () => {
    const current = useSessionStore.getState()
    return (
      current.accountEpoch === accountEpoch &&
      (current.account?.userId ?? null) === userId
    )
  }
}

let started: Promise<void> | null = null

/** Loads the stored session once and follows refresh/expiry/sign-out. */
export function startSession({ client }: { client: SupabaseClient | null }) {
  if (!client) {
    markAuthUnavailable()
    return Promise.resolve()
  }

  started ??= (async () => {
    client.auth.onAuthStateChange((_event, session) => {
      applySession({ session })
    })

    const { data, error } = await client.auth.getSession()
    applySession({ session: error ? null : data.session })
  })()

  return started
}

/** Resolves once the initial session is known (for route guards). */
export async function waitForSession({
  client,
}: {
  client: SupabaseClient | null
}) {
  await startSession({ client })
  return useSessionStore.getState()
}

export async function signOut({ client }: { client: SupabaseClient | null }) {
  if (client) {
    await client.auth.signOut({ scope: 'local' })
  }

  applySession({ session: null })
}
