import type { SupabaseClient } from '@supabase/supabase-js'

export type ModerationErrorCode = 'not_found' | 'no_hold' | 'invalid' | 'failed'

export class ModerationError extends Error {
  readonly code: ModerationErrorCode
  constructor(message: string, code: ModerationErrorCode)
}

export type ModerationHold = {
  slug: string
  reason: string
  heldBy: string
  heldAt: string
  clearedBy: string | null
  clearedAt: string | null
}

export type HoldRow = {
  slug: string
  reason: string
  held_by: string
  held_at: string
  cleared_by: string | null
  cleared_at: string | null
}

export type OpenReport = {
  id: string
  slug: string
  /** Set when the report is about one comment on the design. */
  commentId: string | null
  /** That comment's text, and whether it's already hidden. */
  comment: { body: string; hidden: boolean } | null
  reason: string
  note: string | null
  createdAt: string
}

export function holdFromRow(row: HoldRow): ModerationHold

export function moderationFailure(options: { error: { code?: string; message: string }; notFound: ModerationError }): ModerationError

export function takeDownPublication(options: { admin: SupabaseClient; slug: string; reason: string; heldBy: string }): Promise<ModerationHold>

export function clearModerationHold(options: { admin: SupabaseClient; slug: string; clearedBy: string }): Promise<ModerationHold>

export function openReports(options: { admin: SupabaseClient }): Promise<OpenReport[]>

export function hideCommentAsOperator(options: { admin: SupabaseClient; commentId: string; hiddenBy: string }): Promise<void>

export function resolveReport(options: {
  admin: SupabaseClient
  id: string
  status: 'dismissed' | 'actioned'
  resolvedBy: string
}): Promise<void>
