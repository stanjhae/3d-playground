import { createClient } from '@supabase/supabase-js'

import { RESTORE_DATABASE, findDbContainer, formatPhases, runRestoreCheck } from './backup-lib.mjs'

/**
 * Restore rehearsal for a backup made by backup.mjs (Q09 #194).
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/restore-check.mjs <backup-dir>
 *   … node scripts/restore-check.mjs <backup-dir> --verify-only   (no re-upload)
 *   … node scripts/restore-check.mjs <backup-dir> --keep          (leave the copy for inspection)
 *
 * With SUPABASE_DB_URL set, it restores over that connection instead of
 * into the local container (the hosted rehearsal, docs/backup-restore.md).
 *
 * Restores the dump into a separate `flp_restore` database on the same
 * server and re-uploads every object into a new private bucket
 * (`flp-restore-<id>`); live tables and the live bucket are never written.
 * Then checks: (a) every head and version has its content and uploads,
 * (b) published render bytes match render_artifacts.sha256, (c) revoked
 * publications stay revoked, (d) deleted designs do not reappear. Both
 * copies are dropped at the end. Exits 1 if any check fails.
 */

const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const backupDir = process.argv.slice(2).find((arg) => !arg.startsWith('--'))

if (!url || !secretKey || !backupDir) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/restore-check.mjs <backup-dir> [--verify-only] [--keep]')
  process.exit(1)
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const dbUrl = process.env.SUPABASE_DB_URL || undefined
const container = dbUrl ? undefined : await findDbContainer()
const keep = process.argv.includes('--keep')

console.log(`Restoring ${backupDir} into ${container ?? new URL(dbUrl).host}/${RESTORE_DATABASE}`)
const result = await runRestoreCheck({
  admin,
  container,
  dbUrl,
  backupDir,
  upload: !process.argv.includes('--verify-only'),
  keep,
  log: (line) => console.log(`  ${line}`),
})

for (const warning of result.warnings) console.log(`warning: ${warning}`)

const labels = { a: 'content', b: 'renders', c: 'publications', d: 'deleted designs' }
for (const found of result.issues) {
  const where = [found.designId && `design ${found.designId}`, found.slug && `slug ${found.slug}`].filter(Boolean).join(', ')
  console.log(`FAIL (${labels[found.check] ?? found.check}) ${where ? `${where}: ` : ''}${found.message}`)
}

console.log(
  `\nPhases:\n${formatPhases({
    phases: result.phases,
    total: [
      { name: 'recovery time', ms: result.recoveryMs },
      { name: 'total', ms: result.totalMs },
    ],
  })}`,
)
console.log('  (recovery time = create + restore database + restore storage + verify)')

if (keep) console.log(`\nKept ${RESTORE_DATABASE}${result.restoreBucket ? ` and bucket ${result.restoreBucket}` : ''}; drop them when done.`)

if (result.issues.length > 0) {
  console.log(`\n${result.issues.length} check(s) failed.`)
  process.exit(1)
}

console.log('\nAll checks passed: content, published renders, revoked publications, deleted designs.')
