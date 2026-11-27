import { describe, expect, test, vi } from 'vitest'

import { missingSlug, resultTable, runSyntheticChecks, syntheticChecks } from './synthetic-check'

/** The scheduled synthetic check (O1). */

const BASE = 'https://beta.example'

function healthySite({ health = { ok: true, supabase: 'ok' } }: { health?: unknown } = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname

    if (path === '/') {
      return new Response('<div id="root"></div>', {
        headers: { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" },
      })
    }

    if (path === '/api/health') {
      return Response.json(health, { headers: { 'cache-control': 'no-store' } })
    }

    return Response.json({ error: { code: 'not_found' } }, { status: 404 })
  })
}

describe('runSyntheticChecks', () => {
  test('passes a healthy site with three GETs', async () => {
    const fetchImpl = healthySite()
    const results = await runSyntheticChecks({ base: `${BASE}/`, fetchImpl, retryMs: 0 })

    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ['home page', true],
      ['health', true],
      ['share API 404', true],
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true)
  })

  test('fails health when Supabase is unreachable, after one retry', async () => {
    const fetchImpl = healthySite({ health: { ok: true, supabase: 'not_configured' } })
    const results = await runSyntheticChecks({ base: BASE, fetchImpl, retryMs: 0 })

    expect(results[1]).toMatchObject({ ok: false, detail: 'supabase not_configured' })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  test('a failure that clears on retry passes', async () => {
    let calls = 0
    const site = healthySite()
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls += 1
      if (calls === 1) {
        throw new TypeError('fetch failed')
      }
      return site(input)
    })
    const [home] = await runSyntheticChecks({ base: BASE, fetchImpl, retryMs: 0, checks: syntheticChecks().slice(0, 1) })

    expect(home.ok).toBe(true)
  })

  test('a share link that resolves is a failure', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ title: 'x' }))
    const results = await runSyntheticChecks({ base: BASE, fetchImpl, retryMs: 0, checks: syntheticChecks().slice(2) })

    expect(results[0]).toMatchObject({ ok: false, detail: 'status 200, code undefined' })
  })
})

test('missingSlug never looks like a real share slug', () => {
  expect(missingSlug({ random: () => 0.5 })).toMatch(/^synthetic-missing-[a-z0-9]+$/)
})

test('resultTable marks failures', () => {
  const table = resultTable({ base: BASE, results: [{ name: 'health', ok: false, detail: 'status 500', ms: 12 }] })

  expect(table).toContain('| ❌ health | status 500 | 12 ms |')
})
