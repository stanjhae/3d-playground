import { type SupabaseClient, createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * The browser client, with its own storage key so an admin session never
 * mixes with a session from the main app on the same machine.
 */
export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey, { auth: { storageKey: 'flv-admin-auth' } }) : null

export type AdminResult<T> = { ok: true; body: T } | { ok: false; status: number; message: string }

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<AdminResult<T>> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  const headers = new Headers(init.headers)

  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    const response = await fetch(path, { ...init, headers })
    const body = await response.json().catch(() => null)

    return response.ok
      ? { ok: true, body: body as T }
      : { ok: false, status: response.status, message: body?.error?.message ?? 'Something went wrong' }
  } catch {
    return { ok: false, status: 0, message: 'The admin server didn’t answer. Check your connection.' }
  }
}

/** GET an admin API route with the current session's token. */
export function adminGet<T>(path: string) {
  return adminFetch<T>(path)
}

/** POST a JSON action to an admin API route. */
export function adminPost<T>(path: string, body: unknown) {
  return adminFetch<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
