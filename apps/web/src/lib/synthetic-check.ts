/**
 * The scheduled synthetic check (O1, docs/alerts.md): three read-only
 * GETs against the hosted site. Run by `.github/workflows/synthetic.yml`
 * through `scripts/synthetic-check.mjs`. Nothing here writes or signs in,
 * so it is safe against beta.
 *
 * No imports: the script runs under plain Node without installing deps.
 */

export type CheckResult = { name: string; ok: boolean; detail: string; ms: number }

type Fetch = typeof fetch

const TIMEOUT_MS = 10_000

type Check = {
  name: string
  path: string
  verify: (response: Response) => Promise<string | null>
}

async function json(response: Response) {
  try {
    return (await response.clone().json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/** A slug no design will have, so the share API must answer 404. */
export function missingSlug({ random = Math.random }: { random?: () => number } = {}) {
  return `synthetic-missing-${Math.floor(random() * 1e9).toString(36)}`
}

export function syntheticChecks({ slug = missingSlug() }: { slug?: string } = {}): Check[] {
  return [
    {
      name: 'home page',
      path: '/',
      async verify(response) {
        if (response.status !== 200) {
          return `status ${response.status}`
        }

        if (!response.headers.get('content-type')?.includes('text/html')) {
          return `content-type ${response.headers.get('content-type')}`
        }

        if (!response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")) {
          return 'security headers missing'
        }

        return (await response.text()).includes('id="root"') ? null : 'app shell missing'
      },
    },
    {
      name: 'health',
      path: '/api/health',
      async verify(response) {
        const body = await json(response)

        if (response.status !== 200 || body?.ok !== true) {
          return `status ${response.status}, supabase ${String(body?.supabase ?? 'unknown')}`
        }

        if (body.supabase !== 'ok') {
          return `supabase ${String(body.supabase)}`
        }

        return response.headers.get('cache-control')?.includes('no-store') ? null : 'health response is cacheable'
      },
    },
    {
      name: 'share API 404',
      path: `/api/flp/public/${slug}`,
      async verify(response) {
        const body = await json(response)
        const code = (body?.error as { code?: unknown } | undefined)?.code

        return response.status === 404 && code === 'not_found' ? null : `status ${response.status}, code ${String(code)}`
      },
    },
  ]
}

async function attempt({ base, check, fetchImpl }: { base: string; check: Check; fetchImpl: Fetch }) {
  try {
    const response = await fetchImpl(`${base}${check.path}`, {
      headers: { 'User-Agent': 'flv-synthetic-check', 'Cache-Control': 'no-cache' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return await check.verify(response)
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : 'request failed'
  }
}

/**
 * Runs every check; a failing one is tried again once after `retryMs`,
 * so a single dropped request doesn't page anyone.
 */
export async function runSyntheticChecks({
  base,
  fetchImpl = fetch,
  retryMs = 20_000,
  checks = syntheticChecks(),
}: {
  base: string
  fetchImpl?: Fetch
  retryMs?: number
  checks?: Check[]
}): Promise<CheckResult[]> {
  const root = base.replace(/\/+$/, '')

  return Promise.all(
    checks.map(async (check) => {
      const started = Date.now()
      let failure = await attempt({ base: root, check, fetchImpl })

      if (failure) {
        await new Promise((resolve) => setTimeout(resolve, retryMs))
        failure = await attempt({ base: root, check, fetchImpl })
      }

      return { name: check.name, ok: failure === null, detail: failure ?? 'ok', ms: Date.now() - started }
    }),
  )
}

/** A Markdown table for the job summary and the alert issue. */
export function resultTable({ base, results }: { base: string; results: CheckResult[] }) {
  const rows = results.map((r) => `| ${r.ok ? '✅' : '❌'} ${r.name} | ${r.detail} | ${r.ms} ms |`)
  return [`Synthetic check of ${base}`, '', '| Check | Result | Time |', '| --- | --- | --- |', ...rows].join('\n')
}
