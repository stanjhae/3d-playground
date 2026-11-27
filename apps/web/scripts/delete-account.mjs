import { createClient } from '@supabase/supabase-js'

import { AccountDeletionError, deleteAccountAndFiles } from '../src/lib/flp-api/account-deletion.mjs'
import { listFilesUnder } from './storage-tree.mjs'

/**
 * Deletes one account and everything it stored (A07 #151). The database
 * cascades remove designs, history, publications and upload rows; this
 * removes the account's files first, which the database cannot.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/delete-account.mjs someone@example.com
 *   … node scripts/delete-account.mjs someone@example.com --confirm
 *
 * Without --confirm it only reports what would go. Safe to rerun: a run
 * interrupted after the files were removed finishes the account next time.
 * People can also delete their own account from My Studio (P1); both use
 * src/lib/flp-api/account-deletion.mjs.
 */

const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.toLowerCase()
const confirm = process.argv.includes('--confirm')

if (!url || !secretKey || !email) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/delete-account.mjs <email> [--confirm]')
  process.exit(1)
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })

if (error) {
  console.error('Listing accounts failed:', error.message)
  process.exit(1)
}

const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email)

if (!user) {
  console.log(`No account for ${email}. Run cleanup-orphans.mjs to clear files of accounts already deleted.`)
  process.exit(0)
}

const files = await listFilesUnder({ admin, prefix: user.id })
const { count } = await admin.from('designs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
console.log(`${email} (${user.id}): ${count ?? 0} design(s), ${files.length} stored file(s).`)

if (!confirm) {
  console.log('Dry run: nothing deleted. Rerun with --confirm to delete the account and its files.')
  process.exit(0)
}

let result

try {
  result = await deleteAccountAndFiles({ admin, userId: user.id })
} catch (failure) {
  if (failure instanceof AccountDeletionError && failure.stage === 'account') {
    console.error(`Files removed, but the account was not deleted (${failure.message}). Rerun to finish.`)
    process.exit(1)
  }

  throw failure
}

console.log(`Deleted ${email}: account, designs, history, publications, uploads and ${result.files} file(s).`)
