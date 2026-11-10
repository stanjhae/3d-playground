import path from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { findDbContainer, formatPhases, runBackup } from './backup-lib.mjs'

/**
 * Backs up the database and private storage (Q09 #194, P1).
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/backup.mjs [out-dir]
 *   … SUPABASE_DB_URL=postgresql://… node scripts/backup.mjs [out-dir]   (hosted)
 *
 * Without SUPABASE_DB_URL it dumps the local stack's container. With it,
 * the local `pg_dump` (same major version as the server, or newer) dumps
 * the FLP schemas over that connection; the scheduled backup workflow
 * (`.github/workflows/backup.yml`) runs it this way.
 *
 * Writes `database.dump` (pg_dump custom format, taken inside the running
 * supabase_db_* container), every storage object under `storage/<bucket>/`
 * and `manifest.json` with each object's path, size and SHA-256. Storage
 * is backed up object by object; the dump holds no file bytes. The folder
 * holds private user data: keep it off shared drives and out of git.
 * Default folder: backups/flp-<timestamp>. Check it with restore-check.mjs.
 */

const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/backup.mjs [out-dir]')
  process.exit(1)
}

const outDir = process.argv[2] ?? path.join('backups', `flp-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const dbUrl = process.env.SUPABASE_DB_URL || undefined
const container = dbUrl ? undefined : await findDbContainer()

console.log(`Backing up ${container ?? `the database at ${new URL(dbUrl).host}`} and ${url} storage to ${outDir}`)
const manifest = await runBackup({ admin, container, dbUrl, outDir, log: (line) => console.log(`  ${line}`) })

console.log(`\nPhases:\n${formatPhases({ phases: manifest.phases, total: [{ name: 'total', ms: manifest.totalMs }] })}`)

if (manifest.storage.missing.length > 0) {
  console.log(`\n${manifest.storage.missing.length} object(s) were deleted before they could be downloaded (listed in the manifest).`)
}
