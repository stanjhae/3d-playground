import { type SupabaseClient, createClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client. Only the public URL and publishable key are
 * read here; service-role credentials live on the server (F08 #143).
 * Local values come from `supabase start` (see .env.example).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined

export const AUTH_STORAGE_KEY = 'flp-auth'

/**
 * The studio requires a session wherever Supabase is configured (PRD:
 * Create opens email entry). `VITE_FLP_REQUIRE_AUTH=false` opts out, e.g.
 * for a guest-only demo build. See docs/auth.md.
 */
export const AUTH_REQUIRED =
  Boolean(url && publishableKey) && import.meta.env.VITE_FLP_REQUIRE_AUTH !== 'false'

let client: SupabaseClient | null = null

export function authConfigured() {
  return Boolean(url && publishableKey)
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!authConfigured()) {
    return null
  }

  client ??= createClient(url as string, publishableKey as string, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  return client
}
