import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import type { CanonicalDocument } from '../canonical-document'
import type { FlpServerEnv } from './server'

/** Shared setup for the `*.integration.test.ts` suites (local Supabase). */

export type Account = { id: string; token: string; client: SupabaseClient }

export async function createAccount({
  admin,
  env,
  label,
}: {
  admin: SupabaseClient
  env: FlpServerEnv
  label: string
}): Promise<Account> {
  const email = `it-${label}-${crypto.randomUUID()}@example.test`
  const password = `pw-${crypto.randomUUID()}`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })

  if (created.error || !created.data.user) {
    throw created.error ?? new Error('user not created')
  }

  const client = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signedIn = await client.auth.signInWithPassword({ email, password })

  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error('no session')
  }

  return { id: created.data.user.id, token: signedIn.data.session.access_token, client }
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
