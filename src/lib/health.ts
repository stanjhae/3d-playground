import packageJson from '../../package.json' with { type: 'json' }
import { environmentName, releaseName } from './error-tunnel.ts'

/**
 * `GET /api/health` (O1): which build is live and whether it can reach
 * its Supabase project. The check is Supabase Auth's own health route,
 * which touches no table, so the synthetic check (every 15 minutes) costs
 * nothing that matters. Never cached.
 */

type Env = Record<string, string | undefined>

export type SupabaseHealth = 'ok' | 'unreachable' | 'not_configured'

const SUPABASE_TIMEOUT_MS = 3000

export async function checkSupabase({
  env,
  fetchImpl = fetch,
}: {
  env: Env
  fetchImpl?: typeof fetch
}): Promise<SupabaseHealth> {
  const url = env.SUPABASE_URL?.replace(/\/+$/, '')
  const key = env.SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return 'not_configured'
  }

  try {
    const response = await fetchImpl(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    })

    return response.ok ? 'ok' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

export async function handleHealthRequest({
  request,
  env = (globalThis as { process?: { env?: Env } }).process?.env ?? {},
  fetchImpl = fetch,
}: {
  request: Request
  env?: Env
  fetchImpl?: typeof fetch
}) {
  const headers = { 'Cache-Control': 'no-store' }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'Not found' }, { status: 404, headers })
  }

  const supabase = await checkSupabase({ env, fetchImpl })
  // A deploy without Supabase (local, CI) is healthy as far as it goes;
  // one that has it configured but can't reach it is not.
  const ok = supabase !== 'unreachable'

  return Response.json(
    {
      ok,
      version: packageJson.version,
      commit: releaseName({ env }),
      environment: environmentName({ env }),
      supabase,
      errorTracking: env.SENTRY_DSN ? 'on' : 'off',
    },
    { status: ok ? 200 : 503, headers },
  )
}
