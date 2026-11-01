import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import {
  type FlpRoute as Route,
  type RouteFixture as Fixture,
  type RouteMethod as Method,
  flpRoutes,
  routeLabel as label,
} from './route-table'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Every `/api/flp` route against another owner and no session (Q03 #188).
 * The table is in `route-table.ts`, shared with `scripts/hosted-check.mjs`:
 * a new route belongs there, with the scope that says what a stranger may
 * see. Opt-in: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

const FLP_ROUTES = flpRoutes({ document: DOCUMENT, renders: RENDERS })

const key = () => crypto.randomUUID()

describe.skipIf(!env)('every /api/flp route against strangers', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let a: Account
  let b: Account
  const fixture: Fixture = { designId: '', assetId: '', slug: '' }

  function api({ route, token }: { route: Route; token?: string }) {
    const body = route.body?.()
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${route.path(fixture)}`, {
        method: route.method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  async function asOwner({ path, method = 'GET', body }: { path: string; method?: Method; body?: unknown }) {
    const response = await api({ route: { method, path: () => path, body: () => body, scope: 'owner' }, token: a.token })
    expect(response.status, `${method} ${path}`).toBeLessThan(300)
    return response.status === 204 ? null : ((await response.json()) as Record<string, unknown>)
  }

  async function ownerState() {
    const design = await admin
      .from('designs')
      .select('title, head_seq, visibility')
      .eq('id', fixture.designId)
      .single()
    const asset = await admin.from('assets').select('status').eq('id', fixture.assetId).single()
    return { design: design.data, asset: asset.data }
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    a = await createAccount({ admin, env: serverEnv, label: 'routes-a' })
    b = await createAccount({ admin, env: serverEnv, label: 'routes-b' })

    // A design with a version, views and a publication, and a staged asset.
    const created = await asOwner({
      path: 'designs',
      method: 'POST',
      body: { mutationKey: key(), title: 'Owner tee', content: DOCUMENT },
    })
    fixture.designId = created!.designId as string
    await asOwner({ path: `designs/${fixture.designId}/renders`, method: 'POST', body: { seq: 1, renders: RENDERS } })
    const published = await asOwner({
      path: `designs/${fixture.designId}/publication`,
      method: 'POST',
      body: { seq: 1, displayName: 'Owner' },
    })
    fixture.slug = published!.slug as string
    const reserved = await asOwner({ path: 'assets', method: 'POST' })
    fixture.assetId = reserved!.assetId as string
  })

  afterAll(async () => {
    for (const account of [a, b]) {
      if (account) {
        await admin.auth.admin.deleteUser(account.id)
      }
    }
  })

  test('the owner can reach every owner-scoped read', async () => {
    for (const route of FLP_ROUTES.filter((each) => each.scope === 'owner' && each.method === 'GET')) {
      expect((await api({ route, token: a.token })).status, label(route)).toBe(200)
    }
  })

  test.each(FLP_ROUTES.filter((route) => route.scope !== 'public').map((route) => [label(route), route] as const))(
    '%s needs a session',
    async (_, route) => {
      const response = await api({ route })
      expect(response.status).toBe(401)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('unauthenticated')
    },
  )

  test.each(FLP_ROUTES.filter((route) => route.scope === 'owner').map((route) => [label(route), route] as const))(
    "%s answers another owner's token with 404",
    async (_, route) => {
      const before = await ownerState()
      const response = await api({ route, token: b.token })
      expect(response.status).toBe(404)
      const text = await response.text()
      expect(text).not.toContain(fixture.designId)
      expect(text).not.toContain(a.id)
      // Nothing about the owner's design or asset moved.
      expect(await ownerState()).toEqual(before)
    },
  )

  test.each(FLP_ROUTES.filter((route) => route.scope === 'public').map((route) => [label(route), route] as const))(
    '%s is readable signed out',
    async (_, route) => {
      expect((await api({ route })).status).toBe(200)
    },
  )
})
