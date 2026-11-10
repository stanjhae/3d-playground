import type { SupabaseClient } from '@supabase/supabase-js'

// Types for account-deletion.mjs (A07 #151, P1).

export class AccountDeletionError extends Error {
  stage: 'files' | 'account'
  constructor(stage: 'files' | 'account', message: string)
}

/** Removes the account's files, then the account; its rows go by cascade. */
export function deleteAccountAndFiles(options: { admin: SupabaseClient; userId: string }): Promise<{ files: number }>
