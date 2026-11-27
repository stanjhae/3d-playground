import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test } from 'vitest'

import { handleAdminRequest } from './handlers.ts'

type Rows = { admins: string[]; counts: Record<string, number>; users: number; failAdminCheck?: boolean }

/** A stand-in for the service client: tokens are user ids, `none` is invalid. */
function stub(rows: Rows) {
  return {
    auth: {
      getUser: async (token: string) =>
        token === 'none' ? { data: { user: null }, error: { message: 'bad' } } : { data: { user: { id: token, email: `${token}@example.com` } }, error: null },
      admin: { listUsers: async () => ({ data: { users: [], total: rows.users }, error: null }) },
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

      const result = { count: rows.counts[table] ?? 0, error: null }
      const query = { eq: () => query, then: (resolve: (value: typeof result) => unknown) => resolve(result) }
      return { select: () => query }
    },
  } as unknown as SupabaseClient
}

const rows: Rows = { admins: ['boss'], counts: { designs: 12, publications: 5, publication_reports: 2 }, users: 40 }

function call(path: string, token?: string, method = 'GET', data: Rows = rows) {
  return handleAdminRequest({
    client: stub(data),
    request: new Request(`http://localhost${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  })
}

describe('the admin API', () => {
  test('refuses anyone not signed in', async () => {
    expect((await call('/api/me')).status).toBe(401)
    expect((await call('/api/overview', 'none')).status).toBe(401)
  })

  test('refuses a signed-in account that is not an admin, with no data', async () => {
    const response = await call('/api/overview', 'someone')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: 'forbidden', message: 'This account is not an admin' } })
  })

  test('refuses when the admin check itself fails', async () => {
    expect((await call('/api/overview', 'boss', 'GET', { ...rows, failAdminCheck: true })).status).toBe(503)
  })

  test('answers an admin', async () => {
    const me = await call('/api/me', 'boss')
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ email: 'boss@example.com' })

    const overview = await call('/api/overview', 'boss')
    expect(await overview.json()).toEqual({ users: 40, designs: 12, publications: 5, openReports: 2 })
    expect(overview.headers.get('cache-control')).toBe('no-store')
  })

  test('only reads', async () => {
    expect((await call('/api/overview', 'boss', 'POST')).status).toBe(405)
    expect((await call('/api/nothing', 'boss')).status).toBe(404)
  })
})
