import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { TERMS_VERSION } from '../terms'
import { type Account, createAccount } from './integration-harness'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * POST /ai/sketch against a real local Supabase, with Claude stubbed:
 * hidden when off, then sign-in, terms and limits. Opt-in like the other
 * suites: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

describe.skipIf(!env)('the AI assist route', () => {
  const base = env as FlpServerEnv
  let admin: SupabaseClient
  let accepted: Account
  let notYet: Account
  let calls = 0

  const claude = (async () => {
    calls += 1
    return new Response(
      JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify({ ops: [{ op: 'lengthen', mm: 100 }], notes: 'Longer.' }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch

  const on: FlpServerEnv = { ...base, ai: { apiKey: 'test', model: 'claude-opus-5-5', dailyLimit: 2 }, aiFetch: claude }
  const off: FlpServerEnv = { ...base, ai: null }
  const body = { template: { id: 'tee-crew-short', version: 4 }, prompt: 'a longer tee' }

  function sketch({ serverEnv, token, value = body }: { serverEnv: FlpServerEnv; token?: string; value?: unknown }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request('http://localhost/api/flp/ai/sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(value),
      }),
    })
  }

  beforeAll(async () => {
    admin = createClient(base.url, base.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    accepted = await createAccount({ admin, env: base, label: 'ai-yes' })
    notYet = await createAccount({ admin, env: base, label: 'ai-no' })
    const terms = await handleFlpRequest({
      env: base,
      request: new Request('http://localhost/api/flp/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accepted.token}` },
        body: JSON.stringify({ version: TERMS_VERSION }),
      }),
    })
    expect(terms.ok).toBe(true)
  })

  afterAll(async () => {
    for (const account of [accepted, notYet]) {
      if (account) await admin.auth.admin.deleteUser(account.id)
    }
  })

  test("doesn't exist while the server has it off", async () => {
    expect((await sketch({ serverEnv: off, token: accepted.token })).status).toBe(404)
    expect((await sketch({ serverEnv: off })).status).toBe(404)
  })

  test('needs a signed-in account that has accepted the current terms', async () => {
    expect((await sketch({ serverEnv: on })).status).toBe(401)
    expect((await sketch({ serverEnv: on, token: notYet.token })).status).toBe(403)
    expect(calls).toBe(0)
  })

  test('answers with bounded edits, and stops at the daily limit', async () => {
    const first = await sketch({ serverEnv: on, token: accepted.token })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ ops: [{ op: 'lengthen', mm: 100 }], notes: 'Longer.' })

    const bad = await sketch({ serverEnv: on, token: accepted.token, value: { template: { id: 'tee-crew-short', version: 4 } } })
    expect(bad.status).toBe(422)

    // The daily limit is 2 here: one answer and one refused request use it up.
    expect((await sketch({ serverEnv: on, token: accepted.token })).status).toBe(429)
    expect(calls).toBe(1)
  })
})
