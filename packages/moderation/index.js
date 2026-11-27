/**
 * Operator moderation shared by the apps (P2): the open reports queue,
 * closing a report, taking a publication down (and clearing the hold), and
 * hiding a comment. Every function needs a service-role client, so this is
 * server code only. Plain JavaScript (types in index.d.ts), so Node scripts
 * and any app's server functions import it without a build step.
 *
 * A takedown unpublishes the design at once and holds its link, so the
 * owner cannot publish it again until an operator clears the hold
 * (`public.moderation_holds`, 20261116090000_flp_abuse_moderation.sql).
 */

export class ModerationError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

export function holdFromRow(row) {
  return {
    slug: row.slug,
    reason: row.reason,
    heldBy: row.held_by,
    heldAt: row.held_at,
    clearedBy: row.cleared_by,
    clearedAt: row.cleared_at,
  }
}

/** The database's refusal as a ModerationError. */
export function moderationFailure({ error, notFound }) {
  if (error.code === 'FL404') {
    return notFound
  }

  if (error.code === '23514' || error.code === 'FL422') {
    return new ModerationError('A reason and an operator name are needed', 'invalid')
  }

  return new ModerationError(`The database refused: ${error.message}`, 'failed')
}

/** Takes a published (or already unpublished) design down and holds it. */
export async function takeDownPublication({ admin, slug, reason, heldBy }) {
  const { data, error } = await admin
    .rpc('flp_take_down_publication', { p_slug: slug, p_reason: reason, p_held_by: heldBy })
    .single()

  if (error) {
    throw moderationFailure({ error, notFound: new ModerationError(`No publication has the link ${slug}`, 'not_found') })
  }

  return holdFromRow(data)
}

/** Lifts a hold; the owner may publish again, nothing is republished. */
export async function clearModerationHold({ admin, slug, clearedBy }) {
  const { data, error } = await admin.rpc('flp_clear_moderation_hold', { p_slug: slug, p_cleared_by: clearedBy }).single()

  if (error) {
    throw moderationFailure({ error, notFound: new ModerationError(`${slug} has no hold to clear`, 'no_hold') })
  }

  return holdFromRow(data)
}

/** Reports still open, oldest first: the queue an operator works through. */
export async function openReports({ admin }) {
  const { data, error } = await admin
    .from('publication_reports')
    .select('id, slug, comment_id, reason, note, created_at, publication_comments(body, hidden_at)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) {
    throw new ModerationError('Reports could not be listed', 'failed')
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    commentId: row.comment_id,
    comment: row.publication_comments
      ? { body: row.publication_comments.body, hidden: row.publication_comments.hidden_at !== null }
      : null,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
  }))
}

/** Hides a comment for everyone (community). The text is kept for the record. */
export async function hideCommentAsOperator({ admin, commentId, hiddenBy }) {
  const { error } = await admin.rpc('flp_hide_comment_operator', { p_comment_id: commentId, p_operator: hiddenBy })

  if (error) {
    throw moderationFailure({ error, notFound: new ModerationError(`No comment has the id ${commentId}`, 'not_found') })
  }
}

/** Closes a report: `dismissed` (nothing wrong) or `actioned` (taken down, or the owner told). */
export async function resolveReport({ admin, id, status, resolvedBy }) {
  const { error } = await admin.rpc('flp_resolve_report', { p_id: id, p_status: status, p_operator: resolvedBy })

  if (error) {
    throw moderationFailure({ error, notFound: new ModerationError(`No open report has the id ${id}`, 'not_found') })
  }
}
