import type { SupabaseClient } from '@supabase/supabase-js'

// Types for storage-tree.mjs.

export function listFilesUnder(options: { admin: SupabaseClient; bucket?: string; prefix: string }): Promise<string[]>

export function removeFiles(options: { admin: SupabaseClient; bucket?: string; files: string[] }): Promise<void>
