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

/** Studio requires a session only when this is on (see docs/auth.md). */
export const AUTH_REQUIRED = import.meta.env.VITE_FLP_REQUIRE_AUTH === 'true'

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
