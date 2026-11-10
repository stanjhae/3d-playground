import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

import { formatDemoPreflight, runDemoPreflight } from './demo-preflight-lib.mjs'

/**
 * Is this laptop ready for the demo? Reads only, changes nothing, and says
 * exactly what to do about anything wrong. Exits non-zero if it isn't ready.
 *
 *   pnpm demo:preflight
 */

const env = { ...loadEnv('development', process.cwd(), ['SUPABASE_', 'VITE_']), ...process.env }
const PREVIEW = 'http://localhost:4173'
const DEMO_EMAIL = 'demo@example.test'
const VIDEO = 'demo-fallback.webm'
const VIDEO_MIN_BYTES = 1_000_000

const reachable = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  return response.status < 500
}
const sql = (query) =>
  execFileSync('docker', ['exec', 'supabase_db_3d-playground', 'psql', '-U', 'postgres', '-tAc', query], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
const lastCommitMs = () =>
  Number(execFileSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim()) * 1000
/** The entry script's hashed name, which changes with every build. */
const entryScript = (html) => html.match(/\/assets\/index-[^"]+\.js/)?.[0] ?? null

const report = await runDemoPreflight({
  probes: {
    dockerRunning: () => {
      execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 })
      return true
    },
    supabaseUp: () => reachable('http://127.0.0.1:54321/auth/v1/health'),
    mailpitUp: () => reachable('http://127.0.0.1:54324/'),
    migrationsApplied: () => Number(sql('select count(*) from supabase_migrations.schema_migrations')),
    migrationFiles: () => readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).length,
    envReady: () =>
      Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) &&
      /127\.0\.0\.1|localhost/.test(env.SUPABASE_URL) &&
      !env.VITE_FLP_REQUIRE_AUTH &&
      Boolean(env.VITE_FLP_CONTACT_EMAIL?.trim()),
    demoDesigns: async () => {
      const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const user = data?.users.find((entry) => entry.email === DEMO_EMAIL)

      if (!user) {
        return { designs: 0, published: 0 }
      }

      const { data: designs } = await admin.from('designs').select('visibility').eq('owner_id', user.id)
      return {
        designs: designs?.length ?? 0,
        published: designs?.filter((design) => design.visibility !== 'private').length ?? 0,
      }
    },
    buildCurrent: () => existsSync('dist/index.html') && statSync('dist/index.html').mtimeMs >= lastCommitMs(),
    previewServesBuild: async () => {
      const response = await fetch(PREVIEW, { signal: AbortSignal.timeout(5_000) })
      const served = entryScript(await response.text())
      return Boolean(served) && served === entryScript(readFileSync('dist/index.html', 'utf8'))
    },
    videoCurrent: () =>
      existsSync(VIDEO) && statSync(VIDEO).size >= VIDEO_MIN_BYTES && statSync(VIDEO).mtimeMs >= lastCommitMs(),
  },
})

console.log(formatDemoPreflight(report))
process.exitCode = report.ready ? 0 : 1
