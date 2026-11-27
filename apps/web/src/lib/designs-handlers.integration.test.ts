import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from './canonical-fixtures'
import { guestBoardClosed, handleDesignsRequest } from './designs-handlers'
import { listStoredDesigns, resetDesignsStore } from './designs-store'
import { TINY_JPEG } from './image-fixtures'
import { type Account, createAccount, withImageAsset } from './flp-api/integration-harness'
import { PUBLIC_RENDER_KINDS } from './flp-api/publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './flp-api/server'

/**
 * The guest board is closed on the server where the alpha requires
 * sign-in (F09 #144), with a real local Supabase configured, as on the
 * alpha deployment. Anonymous direct requests to `/api/designs` can
 * neither post a look nor vote, and the board's reads never list alpha
 * work, private or published. Run with `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const GUEST_DRAFT = {
  title: 'Studio Guest',
  author: 'Guest',
  thumbnailDataUrl: '',
  overrides: [{ meshName: 'body' }],
}

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

describe.skipIf(!env)('guest board with sign-in required, against local Supabase (#144)', () => {
  const serverEnv = env as FlpServerEnv
  const saved = { url: processEnv.SUPABASE_URL, auth: processEnv.VITE_FLP_REQUIRE_AUTH }
  let admin: SupabaseClient
  let account: Account
  const alpha = { privateId: '', publishedId: '', slug: '', marker: `alpha-${crypto.randomUUID()}` }

  function flp({ path, method = 'GET', body }: { path: string; method?: 'GET' | 'POST'; body?: unknown }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${account.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  /** An anonymous request: no cookie, no Authorization header. */
  function board({ path = '', method = 'GET', body }: { path?: string; method?: 'GET' | 'POST'; body?: unknown }) {
    return handleDesignsRequest({
      request: new Request(`http://localhost/api/designs${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
    })
  }

  beforeAll(async () => {
    // As deployed: Supabase configured, sign-in not switched off.
    processEnv.SUPABASE_URL = serverEnv.url
    delete processEnv.VITE_FLP_REQUIRE_AUTH

    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    account = await createAccount({ admin, env: serverEnv, label: 'guest-board' })
    const content = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
    const create = async (title: string) =>
      ((await (await flp({ path: 'designs', method: 'POST', body: { mutationKey: crypto.randomUUID(), title, content } })).json()) as {
        designId: string
      }).designId

    alpha.privateId = await create(`${alpha.marker} private`)
    alpha.publishedId = await create(`${alpha.marker} published`)
    const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))
    expect((await flp({ path: `designs/${alpha.publishedId}/renders`, method: 'POST', body: { seq: 1, renders } })).status).toBe(201)
    const published = await flp({ path: `designs/${alpha.publishedId}/publication`, method: 'POST', body: { seq: 1 } })
    alpha.slug = ((await published.json()) as { slug: string }).slug
  })

  beforeEach(() => {
    resetDesignsStore()
  })

  afterAll(async () => {
    if (saved.url === undefined) delete processEnv.SUPABASE_URL
    else processEnv.SUPABASE_URL = saved.url
    if (saved.auth === undefined) delete processEnv.VITE_FLP_REQUIRE_AUTH
    else processEnv.VITE_FLP_REQUIRE_AUTH = saved.auth
    if (account) await admin.auth.admin.deleteUser(account.id)
  })

  test('the deployment requires sign-in, so the board is closed', () => {
    expect(guestBoardClosed()).toBe(true)
  })

  test('an anonymous POST to /api/designs is refused with 403 and adds nothing', async () => {
    const before = listStoredDesigns().length
    const response = await board({ method: 'POST', body: GUEST_DRAFT })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: expect.stringContaining('Sign in') })
    expect(listStoredDesigns()).toHaveLength(before)
  })

  test('a guest vote is gone (410), by path or by query, for guest and alpha ids', async () => {
    const [seed] = listStoredDesigns({ boardOnly: true })
    const votes = seed!.votes

    for (const path of [
      `/${seed!.id}/vote`,
      `?voteId=${seed!.id}`,
      `/${alpha.publishedId}/vote`,
      `/${alpha.slug}/vote`,
    ]) {
      const response = await board({ path, method: 'POST' })
      expect(response.status, path).toBe(410)
    }

    expect(listStoredDesigns().find((design) => design.id === seed!.id)?.votes).toBe(votes)
  })

  test('reads list no alpha work, private or published', async () => {
    const response = await board({})
    expect(response.status).toBe(200)
    const listing = await response.text()

    for (const value of [alpha.marker, alpha.privateId, alpha.publishedId, alpha.slug, account.id]) {
      expect(listing).not.toContain(value)
    }

    // Nor can an alpha id be fetched through the board's single-look read.
    for (const id of [alpha.privateId, alpha.publishedId, alpha.slug]) {
      expect((await board({ path: `?lookId=${id}` })).status, id).toBe(404)
    }
  })
})
