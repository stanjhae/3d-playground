import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test } from 'vitest'

import { type AdminConfig, adminConfig, handleAdminRequest } from './handlers.ts'

type Rows = {
  admins: string[]
  counts: Record<string, number>
  users: number
  failAdminCheck?: boolean
  tables?: Record<string, unknown[]>
}

type Call = { kind: 'rpc'; fn: string; args: Record<string, unknown> } | { kind: 'read'; table: string }

/**
 * A stand-in for the service client: tokens are user ids, `none` is invalid.
 * Table reads answer `rows.tables[table]` whatever the filters; every read
 * and rpc is recorded in `calls`, so a test can prove nothing was touched.
 */
function stub(rows: Rows, calls: Call[] = []) {
  const authUsers = [
    { id: 'u1', email: 'ann@example.com', created_at: '2026-11-01T00:00:00Z', last_sign_in_at: null },
    { id: 'u2', email: 'bob@example.com', created_at: '2026-11-20T00:00:00Z', last_sign_in_at: '2026-11-21T00:00:00Z' },
  ]

  return {
    auth: {
      getUser: async (token: string) =>
        token === 'none' ? { data: { user: null }, error: { message: 'bad' } } : { data: { user: { id: token, email: `${token}@example.com` } }, error: null },
      admin: {
        listUsers: async () => {
          calls.push({ kind: 'read', table: 'auth.users' })
          return { data: { users: authUsers, total: rows.users }, error: null }
        },
        getUserById: async (id: string) => ({ data: { user: authUsers.find((user) => user.id === id) ?? null }, error: null }),
      },
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ kind: 'rpc', fn, args })
      const result = { data: { slug: 'a'.repeat(16), reason: 'r', held_by: 'x', held_at: 'now', cleared_by: null, cleared_at: null }, error: null }
      return { single: async () => result, then: (resolve: (value: typeof result) => unknown) => resolve(result) }
    },
    from: (table: string) => {
      if (table === 'admins') {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () =>
                rows.failAdminCheck ? { data: null, error: { code: '500' } } : { data: rows.admins.includes(id) ? { user_id: id } : null, error: null },
            }),
          }),
        }
      }

      calls.push({ kind: 'read', table })
      const data = rows.tables?.[table] ?? []
      const result = { data, count: rows.counts[table] ?? data.length, error: null }
      const query: Record<string, unknown> = {
        then: (resolve: (value: typeof result) => unknown) => resolve(result),
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      }

      for (const method of ['select', 'eq', 'in', 'is', 'ilike', 'order', 'limit']) {
        query[method] = () => query
      }

      return query
    },
  } as unknown as SupabaseClient
}

const DESIGN = '11111111-1111-4111-8111-111111111111'
const REPORT = '22222222-2222-4222-8222-222222222222'

const rows: Rows = { admins: ['boss'], counts: { designs: 12, publications: 5, publication_reports: 2 }, users: 40 }
const config: AdminConfig = { siteUrl: 'https://site.example', posthogUrl: 'https://posthog.example/dashboard/1' }

function siteHealth(body: unknown, status = 200): typeof fetch {
  return (async () => Response.json(body, { status })) as unknown as typeof fetch
}

function call(
  path: string,
  token?: string,
  { method = 'GET', data = rows, body, calls, fetchImpl, origin }: { method?: string; data?: Rows; body?: unknown; calls?: Call[]; fetchImpl?: typeof fetch; origin?: string } = {},
) {
  const headers: Record<string, string> = {}

  if (token) headers.Authorization = `Bearer ${token}`
  if (origin) headers.Origin = origin

  return handleAdminRequest({
    client: stub(data, calls),
    config,
    fetchImpl: fetchImpl ?? siteHealth({ ok: true, flags: { VITE_PATTERN_BETA: true, VITE_AI_ASSIST: false, FLP_AI_ASSIST: false } }),
    request: new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
  })
}

/** Every route the admin answers, each method it takes, with a valid body. */
const EVERY_ROUTE: { path: string; method: string; body?: unknown }[] = [
  { path: '/api/me', method: 'GET' },
  { path: '/api/overview', method: 'GET' },
  { path: '/api/users', method: 'GET' },
  { path: '/api/users?q=ann', method: 'GET' },
  { path: '/api/designs', method: 'GET' },
  { path: '/api/designs', method: 'POST', body: { action: 'unpublish', designId: DESIGN } },
  { path: '/api/reports', method: 'GET' },
  { path: '/api/reports', method: 'POST', body: { id: REPORT, action: 'dismiss' } },
  { path: '/api/reports', method: 'POST', body: { id: REPORT, action: 'hide' } },
  { path: '/api/health', method: 'GET' },
  { path: '/api/flags', method: 'GET' },
]

describe('the admin API gate', () => {
  test('refuses anyone not signed in', async () => {
    expect((await call('/api/me')).status).toBe(401)
    expect((await call('/api/overview', 'none')).status).toBe(401)
  })

  test.each(EVERY_ROUTE)('$method $path: a signed-in non-admin gets 403, no data, and nothing is read or changed', async ({ path, method, body }) => {
    const calls: Call[] = []
    const response = await call(path, 'someone', { method, body, calls })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: 'forbidden', message: 'This account is not an admin' } })
    expect(calls).toEqual([])
  })

  test.each(EVERY_ROUTE)('$method $path: signed out gets 401', async ({ path, method, body }) => {
    expect((await call(path, undefined, { method, body })).status).toBe(401)
  })

  test('refuses when the admin check itself fails', async () => {
    expect((await call('/api/overview', 'boss', { data: { ...rows, failAdminCheck: true } })).status).toBe(503)
  })

  test('refuses a cross-origin write, even from an admin', async () => {
    const calls: Call[] = []
    const response = await call('/api/designs', 'boss', { method: 'POST', body: { action: 'unpublish', designId: DESIGN }, calls, origin: 'https://evil.example' })
    expect(response.status).toBe(403)
    expect(calls).toEqual([])
  })

  test('unknown routes are 404 and wrong methods 405', async () => {
    expect((await call('/api/overview', 'boss', { method: 'POST' })).status).toBe(405)
    expect((await call('/api/users', 'boss', { method: 'DELETE' })).status).toBe(405)
    expect((await call('/api/nothing', 'boss')).status).toBe(404)
  })
})

describe('the admin panels', () => {
  test('me: the email, the site and the PostHog link', async () => {
    const me = await call('/api/me', 'boss')
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ email: 'boss@example.com', siteUrl: config.siteUrl, posthogUrl: config.posthogUrl })
  })

  test('overview: the counts', async () => {
    const overview = await call('/api/overview', 'boss')
    expect(await overview.json()).toEqual({ users: 40, designs: 12, publications: 5, openReports: 2 })
    expect(overview.headers.get('cache-control')).toBe('no-store')
  })

  test('users: newest first, searchable, with design counts', async () => {
    const data = { ...rows, tables: { designs: [{ owner_id: 'u1' }, { owner_id: 'u1' }, { owner_id: 'u2' }], profiles: [{ owner_id: 'u1', display_name: 'Ann', handle: 'ann' }] } }
    const all = await (await call('/api/users', 'boss', { data })).json()
    expect(all.users.map((user: { id: string }) => user.id)).toEqual(['u2', 'u1'])
    expect(all.users[1]).toMatchObject({ email: 'ann@example.com', createdAt: '2026-11-01T00:00:00Z', displayName: 'Ann', designs: 2 })

    const found = await (await call('/api/users?q=ANN', 'boss', { data })).json()
    expect(found).toMatchObject({ total: 1, users: [{ id: 'u1' }] })
  })

  test('designs: unpublish revokes as the owner', async () => {
    const calls: Call[] = []
    const data = { ...rows, tables: { designs: [{ owner_id: 'u1', visibility: 'published' }] } }
    const response = await call('/api/designs', 'boss', { method: 'POST', body: { action: 'unpublish', designId: DESIGN }, data, calls })
    expect(response.status).toBe(200)
    expect(calls).toContainEqual({ kind: 'rpc', fn: 'flp_revoke_publication', args: { p_owner_id: 'u1', p_design_id: DESIGN } })
  })

  test('designs: unpublishing a private design is a 409, and a bad body a 400', async () => {
    const data = { ...rows, tables: { designs: [{ owner_id: 'u1', visibility: 'private' }] } }
    expect((await call('/api/designs', 'boss', { method: 'POST', body: { action: 'unpublish', designId: DESIGN }, data })).status).toBe(409)
    expect((await call('/api/designs', 'boss', { method: 'POST', body: { action: 'delete', designId: DESIGN } })).status).toBe(400)
  })

  test('reports: hide on a design report takes it down, then closes the report as actioned', async () => {
    const calls: Call[] = []
    const data = { ...rows, tables: { publication_reports: [{ slug: 'a'.repeat(16), comment_id: null, reason: 'spam', status: 'open' }] } }
    const response = await call('/api/reports', 'boss', { method: 'POST', body: { id: REPORT, action: 'hide' }, data, calls })
    expect(response.status).toBe(200)
    const rpcs = calls.filter((entry) => entry.kind === 'rpc').map((entry) => (entry as { fn: string }).fn)
    expect(rpcs).toEqual(['flp_take_down_publication', 'flp_resolve_report'])
    expect(calls).toContainEqual({ kind: 'rpc', fn: 'flp_resolve_report', args: { p_id: REPORT, p_status: 'actioned', p_operator: 'admin: boss@example.com' } })
  })

  test('reports: hide on a comment report hides the comment', async () => {
    const calls: Call[] = []
    const data = { ...rows, tables: { publication_reports: [{ slug: 'a'.repeat(16), comment_id: 'c1', reason: 'offensive', status: 'open' }] } }
    await call('/api/reports', 'boss', { method: 'POST', body: { id: REPORT, action: 'hide' }, data, calls })
    expect(calls.filter((entry) => entry.kind === 'rpc').map((entry) => (entry as { fn: string }).fn)).toEqual(['flp_hide_comment_operator', 'flp_resolve_report'])
  })

  test('reports: dismiss closes it without hiding anything', async () => {
    const calls: Call[] = []
    await call('/api/reports', 'boss', { method: 'POST', body: { id: REPORT, action: 'dismiss' }, calls })
    expect(calls).toEqual([{ kind: 'rpc', fn: 'flp_resolve_report', args: { p_id: REPORT, p_status: 'dismissed', p_operator: 'admin: boss@example.com' } }])
  })

  test('health: the site answer and the hosted-check record', async () => {
    const body = await (await call('/api/health', 'boss', { fetchImpl: siteHealth({ ok: false, supabase: 'unreachable' }, 503) })).json()
    expect(body.site).toEqual({ reached: true, status: 503, body: { ok: false, supabase: 'unreachable' } })
    expect(body.hosted === null || typeof body.hosted.verdict === 'string').toBe(true)
  })

  test('flags: as the site reports them, unknown when it doesn’t', async () => {
    const on = await (await call('/api/flags', 'boss')).json()
    expect(on.flags).toEqual([
      { name: 'VITE_PATTERN_BETA', on: true },
      { name: 'VITE_AI_ASSIST', on: false },
      { name: 'FLP_AI_ASSIST', on: false },
    ])

    const old = await (await call('/api/flags', 'boss', { fetchImpl: siteHealth({ ok: true }) })).json()
    expect(old.flags.every((flag: { on: unknown }) => flag.on === null)).toBe(true)
    expect(old.message).toMatch(/doesn’t report flags/)
  })
})

describe('adminConfig', () => {
  test('keeps only http(s) URLs, without a trailing slash', () => {
    expect(adminConfig({ FLV_SITE_URL: 'https://site.example/', FLV_POSTHOG_URL: 'javascript:alert(1)' })).toEqual({ siteUrl: 'https://site.example', posthogUrl: null })
  })
})
