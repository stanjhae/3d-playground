import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase helpers shared by the apps. Plain JavaScript (types in
 * index.d.ts) so any app's server functions can import it without a build
 * step. Never import this from browser code: it handles the secret key.
 */

/** The service settings, or null when any is missing. */
export function serviceEnv(source = globalThis.process?.env ?? {}) {
  const url = source.SUPABASE_URL
  const secretKey = source.SUPABASE_SECRET_KEY
  return url && secretKey ? { url, secretKey } : null
}

/** A service-role client: bypasses row security, so server code only. */
export function serviceClient(env) {
  return createClient(env.url, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** The bearer token on a request, or null. */
export function bearerToken(request) {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match ? match[1] : null
}

/** The signed-in account behind a request's bearer token, or null. */
export async function userFromRequest({ client, request }) {
  const token = bearerToken(request)

  if (!token) {
    return null
  }

  const { data, error } = await client.auth.getUser(token)
  return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null }
}

/** Whether an account is in `public.admins`. Throws when the check fails. */
export async function isAdmin({ client, userId }) {
  const { data, error } = await client.from('admins').select('user_id').eq('user_id', userId).maybeSingle()

  if (error) {
    throw new Error(`admin check failed: ${error.code ?? 'unknown'}`)
  }

  return data !== null
}
