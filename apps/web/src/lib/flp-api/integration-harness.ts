import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { TERMS_VERSION } from '../terms.ts'

import type { CanonicalDocument } from '../canonical-document'
import type { FlpServerEnv } from './server'

/**
 * Shared setup for the `*.integration.test.ts` suites (local Supabase) and
 * `scripts/hosted-check.mjs` (a deployed environment's project).
 */

export type Account = { id: string; email: string; token: string; client: SupabaseClient }

/**
 * Sets when an account was made, so votes follow the hosted rule (a vote
 * counts once the account is a day old) without waiting. Local stack only:
 * it runs SQL in the Supabase database container.
 */
export function setAccountAge({ id, age }: { id: string; age: string }) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d+ (minutes|hours|days)$/.test(age)) {
    throw new Error('setAccountAge takes an account id and an age like "2 days"')
  }

  // Node's own module, loaded at run time: the app's types have no Node.
  const { execFileSync } = (
    globalThis as unknown as {
      process: { getBuiltinModule: (id: 'node:child_process') => { execFileSync: (file: string, args: string[]) => unknown } }
    }
  ).process.getBuiltinModule('node:child_process')

  execFileSync('docker', [
    'exec',
    'supabase_db_3d-playground',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-qc',
    `update auth.users set created_at = now() - interval '${age}' where id = '${id}'`,
  ])
}

/**
 * A signed-in test account. It is two days old unless `young`, so its
 * votes count at once, as an established account's would.
 */
export async function createAccount({
  admin,
  env,
  label,
  young = false,
}: {
  admin: SupabaseClient
  env: FlpServerEnv
  label: string
  young?: boolean
}): Promise<Account> {
  const email = `it-${label}-${crypto.randomUUID()}@example.test`
  const password = `pw-${crypto.randomUUID()}`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })

  if (created.error || !created.data.user) {
    throw created.error ?? new Error('user not created')
  }

  if (!young) {
    setAccountAge({ id: created.data.user.id, age: '2 days' })
  }

  const client = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signedIn = await client.auth.signInWithPassword({ email, password })

  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error('no session')
  }

  return { id: created.data.user.id, email, token: signedIn.data.session.access_token, client }
}

/** Records that the account accepted the terms in force, as voting needs. */
export async function acceptTermsFor({ admin, account }: { admin: SupabaseClient; account: Account }) {
  const { error } = await admin.rpc('flp_accept_terms', { p_owner_id: account.id, p_version: TERMS_VERSION })

  if (error) {
    throw error
  }
}

/** Points every image layer at `assetId`. */
export function withImageAsset({
  document,
  assetId,
}: {
  document: CanonicalDocument
  assetId: string
}): CanonicalDocument {
  const copy = structuredClone(document)

  for (const panel of Object.values(copy.panels)) {
    for (const layer of panel.layers) {
      if (layer.kind === 'image') {
        layer.assetId = assetId
      }
    }
  }

  return copy
}
