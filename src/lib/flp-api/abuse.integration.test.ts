import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { GOLDEN_DOCUMENT } from '../canonical-fixtures'
import { TINY_JPEG } from '../image-fixtures'
import { PUBLIC_LIMITS, type PublicBucket, type PublicLimiter, takePublicToken } from '../rate-limit'
import { handleWaitlistRequest } from '../waitlist-handlers'
import { listFilesUnder } from './delete-account-runner.mjs'
import { type Account, createAccount, withImageAsset } from './integration-harness'
import { activeHolds, clearModerationHold, moderationStatus, takeDownPublication } from './moderation'
import { PUBLIC_RENDER_KINDS } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'
import { handleSharePage } from './share-page'

/**
 * Abuse and moderation (P2) against a real local Supabase: limits shared
 * through Postgres, their outage policies, public read limits, and
 * takedowns. Opt-in like the other suites: `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({
  kind,
  data: btoa(String.fromCharCode(...TINY_JPEG)),
}))

/** A fresh address per test, so runs and tests never share a count. */
function address() {
  const part = () => Math.floor(Math.random() * 250) + 1
  return `198.18.${part()}.${part()}`
}

describe.skipIf(!env)('abuse and moderation against local Supabase', () => {
  const serverEnv = env as FlpServerEnv
  const limitsOn = {
    SUPABASE_URL: serverEnv?.url,
    SUPABASE_SECRET_KEY: serverEnv?.secretKey,
    FLP_REQUEST_LIMITS: 'on',
  }
  let admin: SupabaseClient
  let owner: Account

  /** The real limiter, as a deployment runs it, with optional lower limits. */
  function postgresLimiter(limits: Partial<Record<PublicBucket, number>> = {}): PublicLimiter {
    const rules = Object.fromEntries(
      Object.entries(PUBLIC_LIMITS).map(([bucket, rule]) => [
        bucket,
        { ...rule, limit: limits[bucket as PublicBucket] ?? rule.limit },
      ]),
    ) as Record<PublicBucket, (typeof PUBLIC_LIMITS)[PublicBucket]>

    return ({ request, bucket }) => takePublicToken({ request, bucket, env: limitsOn, limits: rules })
  }

  function api({
    path,
    method = 'GET',
    token,
    body,
    ip,
    limiter,
  }: {
    path: string
    method?: 'GET' | 'POST' | 'DELETE'
    token?: string
    body?: unknown
    ip?: string
    limiter?: PublicLimiter
  }) {
    return handleFlpRequest({
      // This suite publishes more than a person would in a minute.
      env: { ...serverEnv, rateLimits: { publish: 100 } },
      limiter,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(ip ? { 'x-forwarded-for': ip } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  async function publishedDesign({ title }: { title: string }) {
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: owner.token,
      body: { mutationKey: crypto.randomUUID(), title, content: DOCUMENT },
    })
    const designId = ((await created.json()) as { designId: string }).designId
    expect((await api({ path: `designs/${designId}/renders`, method: 'POST', token: owner.token, body: { seq: 1, renders: RENDERS } })).status).toBe(201)
    const published = await api({ path: `designs/${designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
    expect(published.status).toBe(200)
    return { designId, slug: ((await published.json()) as { slug: string }).slug }
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    owner = await createAccount({ admin, env: serverEnv, label: 'moderated' })
  })

  afterAll(async () => {
    if (owner) {
      const files = await listFilesUnder({ admin, prefix: owner.id })
      if (files.length > 0) await admin.storage.from('design-assets').remove(files)
      await admin.auth.admin.deleteUser(owner.id)
    }
  })

  describe('shared limits', () => {
    test('separate instances share one count', async () => {
      const ip = address()
      const request = () => new Request('http://localhost/api/waitlist', { method: 'POST', headers: { 'x-forwarded-for': ip } })
      // Each call makes its own client, as each serverless instance would.
      const one = postgresLimiter({ waitlist: 2 })
      const two = postgresLimiter({ waitlist: 2 })

      expect(await one({ request: request(), bucket: 'waitlist' })).toEqual({ allowed: true })
      expect(await two({ request: request(), bucket: 'waitlist' })).toEqual({ allowed: true })

      const third = await one({ request: request(), bucket: 'waitlist' })
      expect(third).toMatchObject({ allowed: false, reason: 'limited' })
      expect(third.allowed === false && third.reason === 'limited' && third.retryAfter).toBeGreaterThan(0)

      // Another address is unaffected.
      const other = new Request('http://localhost/api/waitlist', { method: 'POST', headers: { 'x-forwarded-for': address() } })
      expect(await two({ request: other, bucket: 'waitlist' })).toEqual({ allowed: true })
    })

    test('the address itself is never stored', async () => {
      const ip = address()
      await postgresLimiter()({
        request: new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } }),
        bucket: 'events',
      })

      const { data } = await admin.from('request_limits').select('subject').like('subject', `%${ip}%`)
      expect(data).toEqual([])
    })

    test('the waitlist handler stops the ninth sign-up from one address', async () => {
      const ip = address()
      const limiter = postgresLimiter()
      const join = () =>
        handleWaitlistRequest({
          limiter,
          request: new Request('http://localhost/api/waitlist', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
            body: JSON.stringify({ email: `p2-${crypto.randomUUID()}@example.test` }),
          }),
        })
      const statuses = []

      for (let index = 0; index < PUBLIC_LIMITS.waitlist.limit + 1; index += 1) {
        statuses.push((await join()).status)
      }

      expect(statuses.slice(0, -1).every((status) => status === 201)).toBe(true)
      expect(statuses.at(-1)).toBe(429)
    })

    test('when Postgres refuses, write buckets fail closed and reads fail open', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const broken = { ...limitsOn, SUPABASE_SECRET_KEY: 'not-the-key' }
      const request = new Request('http://localhost/', { headers: { 'x-forwarded-for': address() } })

      const decisions = Object.fromEntries(
        await Promise.all(
          (Object.keys(PUBLIC_LIMITS) as PublicBucket[]).map(async (bucket) => [
            bucket,
            (await takePublicToken({ request, bucket, env: broken })).allowed,
          ]),
        ),
      )

      expect(decisions).toEqual({ waitlist: false, events: false, errors: true, share_page: true, public_read: true })
      vi.mocked(console.error).mockRestore()
    })
  })

  describe('public reads', () => {
    test('one address over the limit is refused; another still reads', async () => {
      const { slug } = await publishedDesign({ title: 'Popular tee' })
      const limiter = postgresLimiter({ public_read: 2 })
      const ip = address()

      expect((await api({ path: `public/${slug}`, ip, limiter })).status).toBe(200)
      expect((await api({ path: `public/${slug}/image`, ip, limiter })).status).toBe(200)

      const limited = await api({ path: `public/${slug}`, ip, limiter })
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)

      expect((await api({ path: `public/${slug}`, ip: address(), limiter })).status).toBe(200)
    })

    test('guessing links costs the same as reading them', async () => {
      const limiter = postgresLimiter({ public_read: 1 })
      const ip = address()

      expect((await api({ path: 'public/0000000000000000', ip, limiter })).status).toBe(404)
      expect((await api({ path: 'public/0000000000000001', ip, limiter })).status).toBe(429)
    })

    test('the share page over its limit embeds nothing', async () => {
      const { slug } = await publishedDesign({ title: 'Linked tee' })
      const limiter = postgresLimiter({ share_page: 1 })
      const ip = address()
      const page = () =>
        handleSharePage({
          env: serverEnv,
          limiter,
          loadShell: async () => '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>',
          request: new Request(`http://localhost/s/${slug}`, { headers: { 'x-forwarded-for': ip } }),
        })

      const first = await page()
      expect(first.status).toBe(200)
      expect(await first.text()).toContain('flp-public')

      const second = await page()
      expect(second.status).toBe(429)
      expect(await second.text()).not.toContain('flp-public')
    })
  })

  describe('takedowns', () => {
    test('a takedown unpublishes now, blocks republishing until cleared, and clearing lets the owner publish again', async () => {
      const { designId, slug } = await publishedDesign({ title: 'Reported tee' })
      expect((await api({ path: `public/${slug}` })).status).toBe(200)

      const hold = await takeDownPublication({ admin, slug, reason: 'Reported: copied artwork', heldBy: 'p2-test' })
      expect(hold).toMatchObject({ slug, reason: 'Reported: copied artwork', heldBy: 'p2-test', clearedAt: null })

      // Public: the existing "not available" state, everywhere at once.
      expect((await api({ path: `public/${slug}` })).status).toBe(404)
      expect((await api({ path: `public/${slug}/image` })).status).toBe(404)
      const share = await handleSharePage({
        env: serverEnv,
        loadShell: async () => '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>',
        request: new Request(`http://localhost/s/${slug}`),
      })
      expect(share.status).toBe(200)
      expect(await share.text()).not.toContain('flp-public')

      // Owner: the design is theirs still, private, and cannot go back up.
      const ownerView = (await (await api({ path: `designs/${designId}/publication`, token: owner.token })).json()) as {
        publication: { status: string; seq: number | null }
      }
      expect(ownerView.publication).toMatchObject({ status: 'revoked', seq: null })
      expect((await api({ path: `designs/${designId}`, token: owner.token })).status).toBe(200)

      const refused = await api({ path: `designs/${designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
      expect(refused.status).toBe(403)
      expect(((await refused.json()) as { error: { code: string; message: string } }).error).toMatchObject({
        code: 'taken_down',
        message: expect.stringContaining('taken down after a report'),
      })
      expect((await api({ path: `public/${slug}` })).status).toBe(404)

      expect((await activeHolds({ admin })).map((entry) => entry.slug)).toContain(slug)
      expect(await moderationStatus({ admin, slug })).toMatchObject({ publication: 'revoked', hold: { clearedAt: null } })

      await clearModerationHold({ admin, slug, clearedBy: 'p2-test' })
      expect((await api({ path: `public/${slug}` })).status).toBe(404)

      const again = await api({ path: `designs/${designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
      expect(again.status).toBe(200)
      expect(((await again.json()) as { slug: string }).slug).toBe(slug)
      expect((await api({ path: `public/${slug}` })).status).toBe(200)
    })

    test('a design the owner already unpublished can be held', async () => {
      const { designId, slug } = await publishedDesign({ title: 'Pulled tee' })
      expect((await api({ path: `designs/${designId}/publication`, method: 'DELETE', token: owner.token })).status).toBe(204)

      await takeDownPublication({ admin, slug, reason: 'Reported after unpublish', heldBy: 'p2-test' })

      const refused = await api({ path: `designs/${designId}/publication`, method: 'POST', token: owner.token, body: { seq: 1 } })
      expect(refused.status).toBe(403)
    })

    test('an unknown link is reported as such', async () => {
      await expect(takeDownPublication({ admin, slug: '0000000000000000', reason: 'x', heldBy: 'p2-test' })).rejects.toMatchObject({
        code: 'not_found',
      })
      await expect(clearModerationHold({ admin, slug: '0000000000000000', clearedBy: 'p2-test' })).rejects.toMatchObject({
        code: 'no_hold',
      })
    })

    test('nobody can reach a hold through the API or as a signed-in owner', async () => {
      const { data, error } = await owner.client.from('moderation_holds').select('*')
      expect(data ?? []).toEqual([])
      expect(error).not.toBeNull()

      const rpc = await owner.client.rpc('flp_clear_moderation_hold', { p_slug: '0000000000000000', p_cleared_by: 'me' })
      expect(rpc.error).not.toBeNull()
    })
  })
})
