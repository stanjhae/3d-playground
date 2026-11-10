import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { TERMS_VERSION } from '../terms'
import { listFilesUnder } from './storage-tree.mjs'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Terms acceptance and self-serve account deletion through the API (P1),
 * against local Supabase. Run with `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const OWNED_TABLES = ['designs', 'design_versions', 'publications', 'render_artifacts', 'assets', 'profiles', 'rate_limits'] as const

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

describe.skipIf(!env)('terms and account deletion against local Supabase (P1)', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  const created: Account[] = []

  function api({
    account,
    path,
    method = 'GET',
    body,
  }: {
    account?: Account
    path: string
    method?: 'GET' | 'POST' | 'DELETE'
    body?: unknown
  }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          ...(account ? { Authorization: `Bearer ${account.token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  async function newAccount(label: string) {
    const account = await createAccount({ admin, env: serverEnv, label })
    created.push(account)
    return account
  }

  /** A design with a version, five stored views and a public link. */
  async function publishedDesign(account: Account) {
    const response = await api({
      account,
      path: 'designs',
      method: 'POST',
      body: {
        mutationKey: crypto.randomUUID(),
        title: 'Leaving soon',
        content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' }),
      },
    })
    const { designId } = (await response.json()) as { designId: string }
    const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))
    expect((await api({ account, path: `designs/${designId}/renders`, method: 'POST', body: { seq: 1, renders } })).status).toBe(201)
    const published = await api({ account, path: `designs/${designId}/publication`, method: 'POST', body: { seq: 1 } })
    expect(published.status).toBe(200)
    return { designId, slug: ((await published.json()) as { slug: string }).slug }
  }

  const exists = async (account: Account) => Boolean((await admin.auth.admin.getUserById(account.id)).data.user)

  beforeAll(() => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  })

  afterAll(async () => {
    for (const account of created) {
      if (await exists(account)) {
        const files = await listFilesUnder({ admin, prefix: account.id })
        if (files.length > 0) await admin.storage.from('design-assets').remove(files)
        await admin.auth.admin.deleteUser(account.id)
      }
    }
  })

  test('a new account has not accepted the terms; accepting records the current version once', async () => {
    const a = await newAccount('terms-a')
    const b = await newAccount('terms-b')

    expect(await (await api({ account: a, path: 'profile' })).json()).toEqual({
      displayName: null,
      termsVersion: null,
      termsAcceptedAt: null,
    })

    // An old or made-up version is refused: the page must show the current terms.
    const stale = await api({ account: a, path: 'terms', method: 'POST', body: { version: '2020-01-01' } })
    expect(stale.status).toBe(409)
    expect((await api({ account: a, path: 'terms', method: 'POST', body: { version: '' } })).status).toBe(422)
    expect((await api({ account: a, path: 'terms', method: 'POST', body: { version: TERMS_VERSION, extra: 1 } })).status).toBe(422)
    expect((await api({ path: 'terms', method: 'POST', body: { version: TERMS_VERSION } })).status).toBe(401)

    const accepted = await api({ account: a, path: 'terms', method: 'POST', body: { version: TERMS_VERSION } })
    expect(accepted.status).toBe(200)
    const first = (await accepted.json()) as { termsVersion: string; termsAcceptedAt: string }
    expect(first.termsVersion).toBe(TERMS_VERSION)
    expect(Date.now() - Date.parse(first.termsAcceptedAt)).toBeLessThan(60_000)

    // Accepting again keeps the first time; setting a name keeps the acceptance.
    const again = (await (await api({ account: a, path: 'terms', method: 'POST', body: { version: TERMS_VERSION } })).json()) as {
      termsAcceptedAt: string
    }
    expect(again.termsAcceptedAt).toBe(first.termsAcceptedAt)
    const named = await api({ account: a, path: 'profile', method: 'POST', body: { displayName: 'Ada' } })
    expect(await named.json()).toEqual({ displayName: 'Ada', termsVersion: TERMS_VERSION, termsAcceptedAt: first.termsAcceptedAt })

    // Per account: the other account is still asked.
    expect(await (await api({ account: b, path: 'profile' })).json()).toMatchObject({ termsVersion: null })
    expect((await api({ account: a, path: 'terms' })).status).toBe(405)
  })

  test('deleting your own account needs your email and removes rows, files, public links and the session', async () => {
    const owner = await newAccount('self-delete')
    const other = await newAccount('self-delete-other')
    const { slug } = await publishedDesign(owner)
    const kept = await publishedDesign(other)
    expect((await listFilesUnder({ admin, prefix: owner.id })).length).toBe(PUBLIC_RENDER_KINDS.length)
    await api({ account: owner, path: 'terms', method: 'POST', body: { version: TERMS_VERSION } })

    // Confirmation is required, and must be this account's email.
    for (const body of [undefined, {}, { confirmEmail: other.email }, { confirmEmail: '' }]) {
      const refused = await api({ account: owner, path: 'account', method: 'DELETE', body })
      expect(refused.status, JSON.stringify(body)).toBe(422)
    }
    expect((await api({ account: owner, path: 'account', method: 'POST', body: { confirmEmail: owner.email } })).status).toBe(405)
    expect((await api({ path: 'account', method: 'DELETE', body: { confirmEmail: owner.email } })).status).toBe(401)
    expect(await exists(owner)).toBe(true)

    // Case and outer spaces don't matter, as at sign-in.
    const deleted = await api({
      account: owner,
      path: 'account',
      method: 'DELETE',
      body: { confirmEmail: ` ${owner.email.toUpperCase()} ` },
    })
    expect(deleted.status).toBe(204)

    expect(await exists(owner)).toBe(false)
    expect(await listFilesUnder({ admin, prefix: owner.id })).toEqual([])
    for (const table of OWNED_TABLES) {
      const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('owner_id', owner.id)
      expect(error, table).toBeNull()
      expect(count, table).toBe(0)
    }
    expect((await api({ path: `public/${slug}` })).status).toBe(404)
    expect((await api({ account: owner, path: 'designs' })).status).toBe(401)

    // The other account is untouched.
    expect(await exists(other)).toBe(true)
    expect((await api({ path: `public/${kept.slug}` })).status).toBe(200)
    expect((await listFilesUnder({ admin, prefix: other.id })).length).toBe(PUBLIC_RENDER_KINDS.length)
  })

  test('a deletion that fails part-way keeps the account and finishes on retry', async () => {
    const owner = await newAccount('self-delete-retry')
    await publishedDesign(owner)
    const realFetch = globalThis.fetch
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // Storage refuses the removal: nothing else may go.
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'DELETE' && String(input).includes('/storage/v1/object/design-assets')
        ? Promise.resolve(new Response(JSON.stringify({ statusCode: '500', error: 'down', message: 'down' }), { status: 500 }))
        : realFetch(input, init),
    )

    try {
      const failed = await api({ account: owner, path: 'account', method: 'DELETE', body: { confirmEmail: owner.email } })
      expect(failed.status).toBe(500)
      expect(logged).toHaveBeenCalledWith('flp account deletion failed', { stage: 'files' })
    } finally {
      vi.unstubAllGlobals()
      logged.mockRestore()
    }

    expect(await exists(owner)).toBe(true)
    expect((await api({ account: owner, path: 'designs' })).status).toBe(200)

    const retried = await api({ account: owner, path: 'account', method: 'DELETE', body: { confirmEmail: owner.email } })
    expect(retried.status).toBe(204)
    expect(await exists(owner)).toBe(false)
    expect(await listFilesUnder({ admin, prefix: owner.id })).toEqual([])
  })
})
