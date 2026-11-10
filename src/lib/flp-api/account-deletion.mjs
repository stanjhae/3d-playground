import { listFilesUnder, removeFiles } from './storage-tree.mjs'

/**
 * Deletes one account and everything it stored (A07 #151, P1). Shared by
 * `scripts/delete-account.mjs` (an operator, by email) and
 * `DELETE /api/flp/account` (the person themself, from My Studio).
 *
 * The database cascades remove designs, history, publications, render and
 * upload rows, the profile (public name, terms acceptance) and rate-limit
 * rows. Files are not rows, so they go first: if anything fails part-way,
 * the account still exists and a rerun finishes the job. Plain JavaScript
 * so the script runs it unbuilt; types are in the .d.mts.
 */

export class AccountDeletionError extends Error {
  /** @param {'files' | 'account'} stage @param {string} message */
  constructor(stage, message) {
    super(message)
    this.name = 'AccountDeletionError'
    this.stage = stage
  }
}

export async function deleteAccountAndFiles({ admin, userId }) {
  if (!userId) {
    throw new AccountDeletionError('account', 'no account given')
  }

  let files

  try {
    files = await listFilesUnder({ admin, prefix: userId })
    await removeFiles({ admin, files })
  } catch (error) {
    throw new AccountDeletionError('files', error instanceof Error ? error.message : String(error))
  }

  const deleted = await admin.auth.admin.deleteUser(userId)

  if (deleted.error) {
    throw new AccountDeletionError('account', deleted.error.message)
  }

  // An upload that was already under way when the files were listed can
  // land after them. The account is gone now, so nothing new can start:
  // one more sweep catches it. A failure here leaves unreachable private
  // files that scripts/cleanup-orphans.mjs removes.
  let late = 0

  try {
    const rest = await listFilesUnder({ admin, prefix: userId })
    await removeFiles({ admin, files: rest })
    late = rest.length
  } catch {
    late = 0
  }

  return { files: files.length + late }
}
