import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { useSessionStore } from '../auth/session-store'
import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG, rgbaPng } from '../image-fixtures'
import { uploadAsset } from './assets'
import { listFilesUnder, runCleanupDryRun, runDeleteAccount } from './delete-account-runner.mjs'
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
  let slug: string
  let uploadUrl: string
  let renderUrl: string

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

    // A real upload, on the first of two published designs with five stored views each.
    useSessionStore.setState({
      status: 'signed-in',
      account: { userId: account.id, email: null },
      accessToken: account.token,
      accountEpoch: useSessionStore.getState().accountEpoch + 1,
    })
    const uploaded = await uploadAsset({
      file: new Blob([(await rgbaPng({ width: 2, height: 2, alpha: 255 })) as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
      fetchImpl: (input, init) => {
        const url = String(input)
        return url.startsWith('/api/flp/')
          ? handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${url}`, init) })
          : fetch(input, init)
      },
    })

    if (!uploaded.ok) {
      throw new Error(`upload failed: ${uploaded.code} ${uploaded.message}`)
    }

    uploadUrl = uploaded.data.readUrl
    const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

    for (const [title, assetId] of [['Kept one', uploaded.data.assetId], ['Kept two', 'asset_lib_cross-simple']] as const) {
      const created = await api({
        path: 'designs',
        method: 'POST',
        body: {
          mutationKey: crypto.randomUUID(),
          title,
          content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId }),
        },
      })
      const { designId } = (await created.json()) as { designId: string }
      expect((await api({ path: `designs/${designId}/renders`, method: 'POST', body: { seq: 1, renders } })).status).toBe(201)
      const published = await api({ path: `designs/${designId}/publication`, method: 'POST', body: { seq: 1 } })
      expect(published.status).toBe(200)
      slug = ((await published.json()) as { slug: string }).slug
    }
  })

  afterAll(async () => {
    if (account && (await accountExists())) await admin.auth.admin.deleteUser(account.id)
  })

  test('a failed file removal when deleting a design is logged and the next cleanup finds the files', async () => {
    const owner = await createAccount({ admin, env: serverEnv, label: 'delete-design' })
    const call = ({ path, method = 'POST', body }: { path: string; method?: string; body?: unknown }) =>
      handleFlpRequest({
        env: serverEnv,
        request: new Request(`http://localhost/api/flp/${path}`, {
          method,
          headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      })

    try {
      const created = await call({
        path: 'designs',
        body: {
          mutationKey: crypto.randomUUID(),
          title: 'Goes',
          content: withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' }),
        },
      })
      const { designId } = (await created.json()) as { designId: string }
      const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))
      expect((await call({ path: `designs/${designId}/renders`, body: { seq: 1, renders } })).status).toBe(201)

      // Storage refuses the removal; everything else keeps working.
      const realFetch = globalThis.fetch
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'DELETE' && String(input).includes('/storage/v1/object/design-assets')
          ? Promise.resolve(new Response(JSON.stringify({ statusCode: '500', error: 'down', message: 'down' }), { status: 500 }))
          : realFetch(input, init),
      )

      try {
        expect((await call({ path: `designs/${designId}`, method: 'DELETE' })).status).toBe(204)
        expect(logged).toHaveBeenCalledWith('flp render cleanup failed', { designId })
      } finally {
        vi.unstubAllGlobals()
        logged.mockRestore()
      }

      expect((await admin.from('designs').select('id').eq('id', designId)).data).toEqual([])
      const left = await listFilesUnder({ admin, prefix: `${owner.id}/${designId}` })
      expect(left).toHaveLength(PUBLIC_RENDER_KINDS.length)

      // A dry run only: the local store's other leftovers are kept on purpose.
      const swept = await runCleanupDryRun({ url: serverEnv.url, secretKey: serverEnv.secretKey })
      expect(swept.code, swept.output).toBe(0)
      expect(swept.output).toContain(`${owner.id}/${designId}\t${left.length} file(s)`)
      expect(await listFilesUnder({ admin, prefix: `${owner.id}/${designId}` })).toEqual(left)
    } finally {
      const files = await listFilesUnder({ admin, prefix: owner.id })
      if (files.length > 0) await admin.storage.from('design-assets').remove(files)
      await admin.auth.admin.deleteUser(owner.id)
    }
  }, 90_000)

  test('an interrupted deletion finishes on rerun: no rows, no files, no account', async () => {
    const stored = await files()
    expect(stored).toHaveLength(2 * PUBLIC_RENDER_KINDS.length + 1)

    // Everything works before the deletion, so what stops below stops because of it.
    const { data: render } = await admin.storage.from('design-assets').createSignedUrl(stored.find((file: string) => file.includes('view_front')) ?? stored[0]!, 600)
    renderUrl = render!.signedUrl
    expect((await api({ path: 'designs' })).status).toBe(200)
    expect((await api({ path: `public/${slug}` })).status).toBe(200)
    expect((await fetch(uploadUrl)).status).toBe(200)
    expect((await fetch(renderUrl)).status).toBe(200)

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

    // The token, the public link and the files stopped with the account.
    expect((await api({ path: 'designs' })).status).toBe(401)
    expect((await account.client.from('designs').select('id')).data).toEqual([])
    const gone = await api({ path: `public/${slug}` })
    expect(gone.status).toBe(404)
    const unknown = await api({ path: `public/${'0'.repeat(16)}` })
    expect(await gone.text()).toBe(await unknown.text())
    expect((await api({ path: `public/${slug}/image` })).status).toBe(404)
    expect((await fetch(uploadUrl)).ok).toBe(false)
    expect((await fetch(renderUrl)).ok).toBe(false)

    // And a fourth run is a harmless no-op.
    const fourth = await deleteAccount()
    expect(fourth.code).toBe(0)
    expect(fourth.output).toContain(`No account for ${email}`)
  })
})
