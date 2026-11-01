import { createClient } from '@supabase/supabase-js'

import { listFilesUnder, removeFiles } from './storage-tree.mjs'

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

// Render files of deleted designs. Deleting a design removes its rows
// first, then its files; if that second step failed, the files are left
// under `<owner>/<design uuid>/` with no design row (A07 #151).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const leftovers = []

async function listAll(prefix) {
  const { data, error: listError } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (listError) throw new Error(`listing ${prefix || '/'} failed: ${listError.message}`)
  return data ?? []
}

for (const owner of (await listAll('')).filter((entry) => !entry.id && UUID.test(entry.name))) {
  // Owners whose account is gone are handled as a whole below.
  const { data: ownerAccount } = await admin.auth.admin.getUserById(owner.name)
  if (!ownerAccount?.user) continue

  const designFolders = (await listAll(owner.name)).filter((entry) => !entry.id && UUID.test(entry.name))
  if (designFolders.length === 0) continue

  const { data: live } = await admin
    .from('designs')
    .select('id')
    .in('id', designFolders.map((entry) => entry.name))
  const liveIds = new Set((live ?? []).map((row) => row.id))

  for (const folder of designFolders.filter((entry) => !liveIds.has(entry.name))) {
    const root = `${owner.name}/${folder.name}`
    const files = []
    for (const entry of await listAll(root)) {
      if (entry.id) files.push(`${root}/${entry.name}`)
      else files.push(...(await listAll(`${root}/${entry.name}`)).filter((f) => f.id).map((f) => `${root}/${entry.name}/${f.name}`))
    }
    if (files.length > 0) leftovers.push({ root, files })
  }
}

// Every file of an account that no longer exists (deleted from the
// dashboard, or by a run that was interrupted) (A07 #151).
const { data: accounts, error: accountsError } = await admin.auth.admin.listUsers({ perPage: 1000 })

if (accountsError) {
  console.error('Listing accounts failed:', accountsError.message)
  process.exit(1)
}

const accountIds = new Set(accounts.users.map((account) => account.id))
const goneOwners = []

for (const owner of (await listAll('')).filter((entry) => !entry.id && UUID.test(entry.name) && !accountIds.has(entry.name))) {
  goneOwners.push({ root: owner.name, files: await listFilesUnder({ admin, prefix: owner.name }) })
}

console.log(`${goneOwners.length} deleted account(s) with files left behind (${goneOwners.reduce((n, owner) => n + owner.files.length, 0)} file(s)).`)

console.log(`${leftovers.length} deleted design(s) with render files left behind.`)
for (const leftover of leftovers) {
  console.log(`${leftover.root}\t${leftover.files.length} file(s)`)
}

if (!remove) {
  console.log('Dry run: nothing deleted. Rerun with --delete to remove them.')
  process.exit(0)
}

for (const leftover of [...leftovers, ...goneOwners]) {
  try {
    await removeFiles({ admin, files: leftover.files })
    console.log(`${leftover.root}: removed ${leftover.files.length} file(s)`)
  } catch (removeError) {
    console.log(`${leftover.root}: not removed (${removeError.message}); the next run retries`)
  }
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
