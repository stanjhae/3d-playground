import { createClient } from '@supabase/supabase-js'

/**
 * Orphaned upload cleanup (S09 #178). Lists uploaded images that no saved
 * version of their owner's designs references, older than the grace
 * window. Dry run by default; `--delete` removes their files and rows.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/cleanup-orphans.mjs
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/cleanup-orphans.mjs --delete
 *
 * Safe to rerun: each asset is re-checked by the listing, and a file that
 * is already gone does not stop the row from being removed.
 */

const BUCKET = 'design-assets'
const GRACE = '24 hours'

const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const remove = process.argv.includes('--delete')

if (!url || !secretKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.')
  process.exit(1)
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: orphans, error } = await admin.rpc('flp_orphan_assets', { p_grace: GRACE })

if (error) {
  console.error('Listing failed:', error.message)
  process.exit(1)
}

const totalBytes = orphans.reduce((sum, row) => sum + (row.byte_size ?? 0), 0)
console.log(`${orphans.length} orphaned upload(s), ${(totalBytes / 1048576).toFixed(1)} MB, older than ${GRACE}.`)

for (const row of orphans) {
  console.log(`${row.id}\t${row.owner_id}\t${row.status}\t${row.byte_size ?? '-'}\t${row.created_at}`)
}

if (!remove) {
  console.log('Dry run: nothing deleted. Rerun with --delete to remove them.')
  process.exit(0)
}

let deleted = 0

for (const row of orphans) {
  // Normalized copy plus any original left by an unfinished upload.
  const prefix = `${row.owner_id}/${row.id}`
  const files = [`${prefix}/normalized`, `${prefix}/original`]
  const removed = await admin.storage.from(BUCKET).remove(files)

  if (removed.error) {
    console.error(`${row.id}: files not removed (${removed.error.message}); row kept for the next run.`)
    continue
  }

  const { error: rowError } = await admin.from('assets').delete().eq('id', row.id).eq('owner_id', row.owner_id)

  if (rowError) {
    console.error(`${row.id}: row not removed (${rowError.message}).`)
    continue
  }

  deleted += 1
}

console.log(`Deleted ${deleted} of ${orphans.length}.`)
