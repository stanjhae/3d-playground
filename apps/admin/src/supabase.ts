import { type SupabaseClient, createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * The browser client, with its own storage key so an admin session never
 * mixes with a session from the main app on the same machine.
 */
export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey, { auth: { storageKey: 'flv-admin-auth' } }) : null

/** GET an admin API route with the current session's token. */
export async function adminGet<T>(path: string): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token

  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const body = await response.json().catch(() => null)

  return response.ok
    ? { ok: true, body: body as T }
    : { ok: false, status: response.status, message: body?.error?.message ?? 'Something went wrong' }
}
