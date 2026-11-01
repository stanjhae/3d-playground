import type { SupabaseClient } from '@supabase/supabase-js'

// Types for delete-account-runner.mjs (A07 #151).

export function listFilesUnder(options: { admin: SupabaseClient; bucket?: string; prefix: string }): Promise<string[]>

export function runDeleteAccount(options: {
  email: string
  url: string
  secretKey: string
  failAt?: 'storage-remove' | 'account-delete'
}): Promise<{ code: number; output: string }>
