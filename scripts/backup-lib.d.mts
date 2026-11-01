import type { SupabaseClient } from '@supabase/supabase-js'

// Types for backup-lib.mjs, used by its tests (Q09 #194).

export const MANIFEST_FORMAT: string
export const RESTORE_DATABASE: string

export function sha256Hex(bytes: string | Uint8Array): string
export function canonicalContentHash(content: unknown): string
export function findDbContainer(): Promise<string>
export function psql(options: { container: string; database?: string; sql: string }): Promise<string>

export type Phase = { name: string; ms: number }

export type BackupObject = { bucket: string; path: string; size: number; sha256: string; contentType: string | null }

export type BackupManifest = {
  format: string
  createdAt: string
  database: { file: string; bytes: number; sha256: string }
  expected: {
    counts: Record<string, number>
    designIds: string[]
    publications: Array<{ slug: string; designId: string | null; status: string; seq: number | null }>
  }
  storage: {
    buckets: Array<{ id: string; public: boolean }>
    objects: BackupObject[]
    missing: Array<{ bucket: string; path: string; reason: string }>
  }
  phases: Phase[]
  totalMs: number
}

export type RestoreIssue = { check: string; message: string; designId?: string; slug?: string }

export type RestoreResult = {
  issues: RestoreIssue[]
  warnings: string[]
  verified: { versions: number; renders: Array<{ slug: string; kind: string }>; assets: number }
  restored: {
    designIds: Set<string>
    publications: Map<string, { status: string; seq: number | null; designId: string | null }>
  }
  restoreBucket: string | null
  phases: Phase[]
  recoveryMs: number
  totalMs: number
}

export function runBackup(options: {
  admin: SupabaseClient
  container: string
  outDir: string
  log?: (line: string) => void
}): Promise<BackupManifest>

export function runRestoreCheck(options: {
  admin: SupabaseClient
  container: string
  backupDir: string
  upload?: boolean
  keep?: boolean
  log?: (line: string) => void
}): Promise<RestoreResult>

export function formatPhases(options: { phases: Phase[]; total: Phase[] }): string

export function makeBackupDir(): Promise<string>
export function removeBackupDir(dir: string): Promise<void>
export function readManifest(dir: string): Promise<BackupManifest>
export function writeManifest(dir: string, manifest: BackupManifest): Promise<void>
export function writeBackupObject(options: {
  dir: string
  bucket: string
  name: string
  bytes: Uint8Array
}): Promise<{ size: number; sha256: string }>
