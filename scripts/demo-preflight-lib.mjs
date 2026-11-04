/**
 * The checks behind `pnpm demo:preflight`, in the order they depend on each
 * other. A check that can't pass because an earlier one failed is skipped, so
 * the first thing to fix is the first thing shown. Probes are injected, so
 * tests can drive each failure without breaking a real stack.
 */

/** One line a person can act on: what's wrong and exactly what to do. */
const CHECKS = [
  {
    id: 'docker',
    label: 'Docker is running',
    fix: 'Open Docker Desktop and wait for it to start. It may ask for your Mac password, possibly behind other windows.',
    run: ({ probes }) => probes.dockerRunning(),
  },
  {
    id: 'supabase',
    label: 'Supabase is up',
    needs: ['docker'],
    fix: 'Run: supabase start. Pulling images needs a network connection if Docker was reset.',
    run: ({ probes }) => probes.supabaseUp(),
  },
  {
    id: 'mailpit',
    label: 'Mailpit is up',
    needs: ['supabase'],
    fix: 'Run: supabase start. Sign-in codes go to Mailpit.',
    run: ({ probes }) => probes.mailpitUp(),
  },
  {
    id: 'migrations',
    label: 'The database has every migration',
    needs: ['supabase'],
    fix: 'Run: supabase migration up. Never run supabase db reset on demo day; it wipes the database.',
    run: async ({ probes }) => (await probes.migrationsApplied()) === (await probes.migrationFiles()),
  },
  {
    id: 'env',
    label: '.env.local is set for the local stack',
    fix: 'Copy the values from supabase status into .env.local (see .env.example), and leave VITE_FLP_REQUIRE_AUTH unset.',
    run: ({ probes }) => probes.envReady(),
  },
  {
    id: 'build',
    label: 'The production build is up to date',
    fix: 'Run: pnpm build, then restart the preview.',
    run: ({ probes }) => probes.buildCurrent(),
  },
  {
    id: 'preview',
    label: 'The preview serves this build on port 4173',
    needs: ['build'],
    fix: 'Stop any old preview, then run: pnpm preview --port 4173. An old one keeps old API code in memory.',
    run: ({ probes }) => probes.previewServesBuild(),
  },
  {
    id: 'demo-account',
    label: 'The demo account has its three designs, one published',
    needs: ['migrations', 'env', 'preview'],
    fix: 'Run: node scripts/demo-reset.mjs (takes about 30 s).',
    run: async ({ probes }) => {
      const { designs, published } = await probes.demoDesigns()
      return designs >= 3 && published >= 1
    },
  },
  {
    id: 'video',
    label: 'The fallback video is there and recorded on this code',
    fix: 'Record it: node scripts/demo-reset.mjs && RECORD=1 E2E_BASE_URL=http://localhost:4173 pnpm e2e demo-recording, then rerun the reset.',
    run: ({ probes }) => probes.videoCurrent(),
  },
]

export async function runDemoPreflight({ probes }) {
  const results = []

  for (const check of CHECKS) {
    const blockedBy = (check.needs ?? []).find((id) => results.find((result) => result.id === id)?.status !== 'ok')

    if (blockedBy) {
      results.push({ id: check.id, label: check.label, status: 'skipped', blockedBy })
      continue
    }

    let ok = false
    let error

    try {
      ok = Boolean(await check.run({ probes }))
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }

    results.push(
      ok
        ? { id: check.id, label: check.label, status: 'ok' }
        : { id: check.id, label: check.label, status: 'fix', fix: check.fix, ...(error ? { error } : {}) },
    )
  }

  return { ready: results.every((result) => result.status === 'ok'), results }
}

export function formatDemoPreflight({ ready, results }) {
  const lines = results.map((result) => {
    if (result.status === 'ok') {
      return `OK    ${result.label}`
    }

    if (result.status === 'skipped') {
      return `SKIP  ${result.label} (fix ${result.blockedBy} first)`
    }

    return `FIX   ${result.label}\n      ${result.fix}${result.error ? `\n      (${result.error})` : ''}`
  })

  return [...lines, '', ready ? 'Ready for the demo.' : 'Not ready. Fix the first FIX line, then run this again.'].join('\n')
}
