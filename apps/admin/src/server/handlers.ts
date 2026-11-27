import { type Caller, type ServiceEnv, isAdmin, serviceClient, serviceEnv, userFromRequest } from '@flv/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  PanelError,
  type ReportAction,
  actOnReport,
  flagsPanel,
  healthPanel,
  listDesigns,
  listReports,
  listUsers,
  unpublishDesign,
} from './panels.ts'

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

/** Admin server settings beyond Supabase: where the site and PostHog are. */
export type AdminConfig = {
  /** The public site's origin, for its health route and links to share pages. */
  siteUrl: string | null
  /** A PostHog dashboard to link to. */
  posthogUrl: string | null
}

export function adminConfig(source: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}): AdminConfig {
  const url = (value: string | undefined) => (value && /^https?:\/\//.test(value) ? value.replace(/\/+$/, '') : null)
  return { siteUrl: url(source.FLV_SITE_URL), posthogUrl: url(source.FLV_POSTHOG_URL) }
}

type Deps = {
  env?: ServiceEnv | null
  /** Tests pass a stub; otherwise a service-role client for `env`. */
  client?: SupabaseClient
  config?: AdminConfig
  /** Tests stub the site's health route here. */
  fetchImpl?: typeof fetch
}

/** Every route, and the methods it answers. Anything else is 404 or 405. */
const ROUTES: Record<string, readonly string[]> = {
  '/api/me': ['GET'],
  '/api/overview': ['GET'],
  '/api/users': ['GET'],
  '/api/designs': ['GET', 'POST'],
  '/api/reports': ['GET', 'POST'],
  '/api/health': ['GET'],
  '/api/flags': ['GET'],
}

const MAX_BODY_BYTES = 4096
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const REPORT_ACTIONS: readonly ReportAction[] = ['dismiss', 'action', 'hide']

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

/** A small JSON object body, or null. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text()

  if (text.length > MAX_BODY_BYTES) {
    return null
  }

  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Who did it, as the moderation records name an operator (at most 80 characters). */
function operatorName(caller: Caller) {
  return `admin: ${caller.email ?? caller.id}`.slice(0, 80)
}

async function route({
  pathname,
  request,
  caller,
  client,
  config,
  fetchImpl,
}: {
  pathname: string
  request: Request
  caller: Caller
  client: SupabaseClient
  config: AdminConfig
  fetchImpl?: typeof fetch
}): Promise<Response> {
  const search = new URL(request.url).searchParams

  if (pathname === '/api/me') {
    return json(200, { email: caller.email, siteUrl: config.siteUrl, posthogUrl: config.posthogUrl })
  }

  if (pathname === '/api/overview') {
    return json(200, await overview(client))
  }

  if (pathname === '/api/users') {
    return json(200, await listUsers({ client, query: search.get('q') ?? '' }))
  }

  if (pathname === '/api/health') {
    return json(200, await healthPanel({ siteUrl: config.siteUrl, fetchImpl }))
  }

  if (pathname === '/api/flags') {
    return json(200, await flagsPanel({ siteUrl: config.siteUrl, fetchImpl }))
  }

  if (pathname === '/api/designs' && request.method === 'GET') {
    return json(200, await listDesigns({ client, query: search.get('q') ?? '', published: search.get('published') === '1' }))
  }

  if (pathname === '/api/reports' && request.method === 'GET') {
    return json(200, { reports: await listReports({ client }) })
  }

  const body = await readBody(request)

  if (pathname === '/api/designs') {
    if (body?.action !== 'unpublish' || typeof body.designId !== 'string' || !UUID.test(body.designId)) {
      return error(400, 'invalid', 'Send { action: "unpublish", designId }')
    }

    await unpublishDesign({ client, designId: body.designId })
    return json(200, { ok: true })
  }

  const action = body?.action as ReportAction

  if (!body || typeof body.id !== 'string' || !UUID.test(body.id) || !REPORT_ACTIONS.includes(action)) {
    return error(400, 'invalid', 'Send { id, action: "dismiss" | "action" | "hide" }')
  }

  await actOnReport({ client, id: body.id, action, operator: operatorName(caller) })
  return json(200, { ok: true })
}

export async function handleAdminRequest({ request, env = serviceEnv(), client, config = adminConfig(), fetchImpl }: { request: Request } & Deps) {
  const { pathname } = new URL(request.url)
  const methods = ROUTES[pathname]

  if (!methods) {
    return error(404, 'not_found', 'Not found')
  }

  if (!methods.includes(request.method)) {
    return error(405, 'method_not_allowed', 'Method not allowed')
  }

  // Writes carry the bearer token, so this is defence in depth against CSRF.
  const origin = request.headers.get('origin')

  if (request.method !== 'GET' && origin !== null && origin !== new URL(request.url).origin) {
    return error(403, 'cross_origin', 'Cross-origin requests are not allowed')
  }

  if (!env && !client) {
    return error(503, 'unconfigured', 'The admin server has no Supabase settings')
  }

  const service = client ?? serviceClient(env as ServiceEnv)
  const gate = await requireAdmin({ request, client: service })

  if ('refused' in gate) {
    return gate.refused
  }

  try {
    return await route({ pathname, request, caller: gate.caller, client: service, config, fetchImpl })
  } catch (failure) {
    if (failure instanceof PanelError) {
      return error(failure.status, failure.code, failure.message)
    }

    console.error('admin route failed', { pathname, message: failure instanceof Error ? failure.message : 'unknown' })
    return error(502, 'upstream', 'Couldn’t read that. Try again.')
  }
}
