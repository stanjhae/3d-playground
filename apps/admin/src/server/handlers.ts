import { type Caller, type ServiceEnv, isAdmin, serviceClient, serviceEnv, userFromRequest } from '@flv/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The admin app's server side. Every route needs a signed-in account that is
 * in `public.admins`; anything else gets 401 or 403 and no data. All reads
 * use the service role, so this file is the only gate: keep every route
 * behind `requireAdmin`.
 */

export type Overview = {
  users: number
  designs: number
  publications: number
  openReports: number
}

type Deps = {
  env?: ServiceEnv | null
  /** Tests pass a stub; otherwise a service-role client for `env`. */
  client?: SupabaseClient
}

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

const error = (status: number, code: string, message: string) => json(status, { error: { code, message } })

/** The admin behind a request, or the response that refuses it. */
async function requireAdmin({
  request,
  client,
}: {
  request: Request
  client: SupabaseClient
}): Promise<{ refused: Response } | { caller: Caller }> {
  const caller = await userFromRequest({ client, request })

  if (!caller) {
    return { refused: error(401, 'unauthorized', 'Sign in first') }
  }

  let allowed: boolean

  try {
    allowed = await isAdmin({ client, userId: caller.id })
  } catch (failure) {
    console.error('admin check failed', { message: failure instanceof Error ? failure.message : 'unknown' })
    return { refused: error(503, 'unavailable', 'The admin check isn’t working right now. Try again later.') }
  }

  return allowed ? { caller } : { refused: error(403, 'forbidden', 'This account is not an admin') }
}

async function count({ client, table, filter }: { client: SupabaseClient; table: string; filter?: [string, string] }) {
  let query = client.from(table).select('*', { count: 'exact', head: true })

  if (filter) {
    query = query.eq(filter[0], filter[1])
  }

  const { count: total, error: failed } = await query

  if (failed) {
    throw new Error(`${table} count failed: ${failed.code ?? 'unknown'}`)
  }

  return total ?? 0
}

async function overview(client: SupabaseClient): Promise<Overview> {
  const [users, designs, publications, openReports] = await Promise.all([
    client.auth.admin.listUsers({ page: 1, perPage: 1 }).then(({ data, error: failed }) => {
      if (failed) {
        throw new Error(`user count failed: ${failed.message}`)
      }

      return (data as { total?: number }).total ?? data.users.length
    }),
    count({ client, table: 'designs' }),
    count({ client, table: 'publications', filter: ['status', 'published'] }),
    count({ client, table: 'publication_reports', filter: ['status', 'open'] }),
  ])

  return { users, designs, publications, openReports }
}

export async function handleAdminRequest({ request, env = serviceEnv(), client }: { request: Request } & Deps) {
  const { pathname } = new URL(request.url)

  if (request.method !== 'GET') {
    return error(405, 'method_not_allowed', 'Method not allowed')
  }

  if (!env && !client) {
    return error(503, 'unconfigured', 'The admin server has no Supabase settings')
  }

  const service = client ?? serviceClient(env as ServiceEnv)
  const gate = await requireAdmin({ request, client: service })

  if ('refused' in gate) {
    return gate.refused
  }

  if (pathname === '/api/me') {
    return json(200, { email: gate.caller.email })
  }

  if (pathname === '/api/overview') {
    try {
      return json(200, await overview(service))
    } catch (failure) {
      console.error('admin overview failed', { message: failure instanceof Error ? failure.message : 'unknown' })
      return error(502, 'upstream', 'Couldn’t read the numbers. Try again.')
    }
  }

  return error(404, 'not_found', 'Not found')
}
