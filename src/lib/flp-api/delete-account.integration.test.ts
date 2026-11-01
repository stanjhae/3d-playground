import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { listFilesUnder, runDeleteAccount } from './delete-account-runner.mjs'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Account deletion is retryable (A07 #151): scripts/delete-account.mjs,
 * run unedited as an operator would, is interrupted twice (storage gives
 * out part-way through removing files, then deleting the account fails)
 * after an earlier attempt already removed some files. Rerun, it finishes
 * cleanly: no rows, no files, no account. Faults are injected by
 * preloading delete-account-faults.mjs (see delete-account-runner.mjs). Run with `pnpm test:integration`.
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

describe.skipIf(!env)('retryable account deletion against local Supabase (#151)', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let account: Account
  let email: string

  function api({ path, method = 'GET', body }: { path: string; method?: 'GET' | 'POST'; body?: unknown }) {
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

  /** Runs the real script with `--confirm`, optionally with one injected fault. */
  function deleteAccount({ failAt }: { failAt?: 'storage-remove' | 'account-delete' } = {}) {
    return runDeleteAccount({ email, url: serverEnv.url, secretKey: serverEnv.secretKey, failAt })
  }

  const files = () => listFilesUnder({ admin, prefix: account.id })
  const accountExists = async () => Boolean((await admin.auth.admin.getUserById(account.id)).data.user)
  const designRows = async () =>
    (await admin.from('designs').select('id', { count: 'exact', head: true }).eq('owner_id', account.id)).count ?? 0

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    account = await createAccount({ admin, env: serverEnv, label: 'delete-retry' })
    email = (await admin.auth.admin.getUserById(account.id)).data.user!.email!

    // Two published designs, each with its five stored views.
    const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

    for (const title of ['Kept one', 'Kept two']) {
      const created = await api({
        path: 'designs',
        method: 'POST',
        body: {
          mutationKey: crypto.randomUUID(),
          title,
          content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' }),
        },
      })
      const { designId } = (await created.json()) as { designId: string }
      expect((await api({ path: `designs/${designId}/renders`, method: 'POST', body: { seq: 1, renders } })).status).toBe(201)
      expect((await api({ path: `designs/${designId}/publication`, method: 'POST', body: { seq: 1 } })).status).toBe(200)
    }
  })

  afterAll(async () => {
    if (account && (await accountExists())) await admin.auth.admin.deleteUser(account.id)
  })

  test('an interrupted deletion finishes on rerun: no rows, no files, no account', async () => {
    const stored = await files()
    expect(stored).toHaveLength(2 * PUBLIC_RENDER_KINDS.length)

    // An earlier attempt got as far as removing a few files.
    await admin.storage.from('design-assets').remove(stored.slice(0, 3))
    expect(await files()).toHaveLength(stored.length - 3)

    // Run 1: storage gives out part-way through the removal.
    const first = await deleteAccount({ failAt: 'storage-remove' })
    expect(first.code, first.output).not.toBe(0)
    const left = await files()
    expect(left.length).toBeGreaterThan(0)
    expect(left.length).toBeLessThan(stored.length - 3)
    expect(await accountExists()).toBe(true)
    expect(await designRows()).toBe(2)

    // Run 2: the files go, but deleting the account fails.
    const second = await deleteAccount({ failAt: 'account-delete' })
    expect(second.code, second.output).toBe(1)
    expect(second.output).toContain('Rerun to finish')
    expect(await files()).toEqual([])
    expect(await accountExists()).toBe(true)

    // Run 3: nothing injected; it finishes.
    const third = await deleteAccount()
    expect(third.code, third.output).toBe(0)
    expect(third.output).toContain(`Deleted ${email}`)

    expect(await accountExists()).toBe(false)
    expect(await files()).toEqual([])

    for (const table of OWNED_TABLES) {
      const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('owner_id', account.id)
      expect(error, table).toBeNull()
      expect(count, table).toBe(0)
    }

    // And a fourth run is a harmless no-op.
    const fourth = await deleteAccount()
    expect(fourth.code).toBe(0)
    expect(fourth.output).toContain(`No account for ${email}`)
  })
})
