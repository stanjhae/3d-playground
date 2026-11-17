import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Moderation takedowns (P2), for operators only: everything here needs the
 * service-role client, and `scripts/moderation.mjs` is the way in. There is
 * no HTTP route, so nothing public can reach it.
 *
 * A takedown unpublishes the design at once and holds its link, so the
 * owner cannot publish it again until an operator clears the hold
 * (`public.moderation_holds`, 20261116090000_flp_abuse_moderation.sql).
 * The share page then shows its usual "This design is not available".
 */

const SLUG = /^[a-f0-9]{16}$/

export type ModerationHold = {
  slug: string
  reason: string
  heldBy: string
  heldAt: string
  clearedBy: string | null
  clearedAt: string | null
}

export type ModerationStatus = {
  slug: string
  /** `published` or `revoked`; null when the slug was never a publication. */
  publication: 'published' | 'revoked' | null
  title: string | null
  hold: ModerationHold | null
}

type HoldRow = {
  slug: string
  reason: string
  held_by: string
  held_at: string
  cleared_by: string | null
  cleared_at: string | null
}

function holdFromRow(row: HoldRow): ModerationHold {
  return {
    slug: row.slug,
    reason: row.reason,
    heldBy: row.held_by,
    heldAt: row.held_at,
    clearedBy: row.cleared_by,
    clearedAt: row.cleared_at,
  }
}

/**
 * The slug from what a report contains: the slug itself or a share link
 * (`https://…/s/<slug>`, with or without a trailing slash or query).
 */
export function slugFromReport({ value }: { value: string }) {
  const trimmed = value.trim()

  if (SLUG.test(trimmed)) {
    return trimmed
  }

  try {
    const match = new URL(trimmed).pathname.match(/^\/s\/([a-f0-9]{16})\/?$/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export class ModerationError extends Error {
  readonly code: 'not_found' | 'no_hold' | 'invalid' | 'failed'

  // No parameter properties: scripts load this file with Node's type stripping.
  constructor(message: string, code: ModerationError['code']) {
    super(message)
    this.code = code
  }
}

function failure({ error, notFound }: { error: { code?: string; message: string }; notFound: ModerationError }) {
  if (error.code === 'FL404') {
    return notFound
  }

  if (error.code === '23514') {
    return new ModerationError('A reason and an operator name are needed', 'invalid')
  }

  return new ModerationError(`The database refused: ${error.message}`, 'failed')
}

/** Takes a published (or already unpublished) design down and holds it. */
export async function takeDownPublication({
  admin,
  slug,
  reason,
  heldBy,
}: {
  admin: SupabaseClient
  slug: string
  reason: string
  heldBy: string
}): Promise<ModerationHold> {
  const { data, error } = await admin
    .rpc('flp_take_down_publication', { p_slug: slug, p_reason: reason, p_held_by: heldBy })
    .single<HoldRow>()

  if (error) {
    throw failure({ error, notFound: new ModerationError(`No publication has the link ${slug}`, 'not_found') })
  }

  return holdFromRow(data)
}

/** Lifts a hold; the owner may publish again, nothing is republished. */
export async function clearModerationHold({
  admin,
  slug,
  clearedBy,
}: {
  admin: SupabaseClient
  slug: string
  clearedBy: string
}): Promise<ModerationHold> {
  const { data, error } = await admin
    .rpc('flp_clear_moderation_hold', { p_slug: slug, p_cleared_by: clearedBy })
    .single<HoldRow>()

  if (error) {
    throw failure({ error, notFound: new ModerationError(`${slug} has no hold to clear`, 'no_hold') })
  }

  return holdFromRow(data)
}

/** What the public sees for a link, and any hold on it. */
export async function moderationStatus({
  admin,
  slug,
}: {
  admin: SupabaseClient
  slug: string
}): Promise<ModerationStatus> {
  const [publication, hold] = await Promise.all([
    admin.from('publications').select('status, title').eq('slug', slug).maybeSingle(),
    admin.from('moderation_holds').select('*').eq('slug', slug).maybeSingle<HoldRow>(),
  ])

  if (publication.error || hold.error) {
    throw new ModerationError('The status could not be read', 'failed')
  }

  return {
    slug,
    publication: (publication.data?.status as ModerationStatus['publication']) ?? null,
    title: (publication.data?.title as string | null) ?? null,
    hold: hold.data ? holdFromRow(hold.data) : null,
  }
}

/** Holds still in force, newest first. */
export async function activeHolds({ admin }: { admin: SupabaseClient }): Promise<ModerationHold[]> {
  const { data, error } = await admin
    .from('moderation_holds')
    .select('*')
    .is('cleared_at', null)
    .order('held_at', { ascending: false })
    .returns<HoldRow[]>()

  if (error) {
    throw new ModerationError('Holds could not be listed', 'failed')
  }

  return data.map(holdFromRow)
}

// ---------------------------------------------------------------------------
// Reports (`public.publication_reports`, 20261122090000)
// ---------------------------------------------------------------------------

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

/** Reports still open, oldest first: the queue an operator works through. */
export async function openReports({ admin }: { admin: SupabaseClient }): Promise<OpenReport[]> {
  const { data, error } = await admin
    .from('publication_reports')
    .select('id, slug, comment_id, reason, note, created_at, publication_comments(body, hidden_at)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .returns<
      Array<{
        id: string
        slug: string
        comment_id: string | null
        reason: string
        note: string | null
        created_at: string
        publication_comments: { body: string; hidden_at: string | null } | null
      }>
    >()

  if (error) {
    throw new ModerationError('Reports could not be listed', 'failed')
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    commentId: row.comment_id,
    comment: row.publication_comments ? { body: row.publication_comments.body, hidden: row.publication_comments.hidden_at !== null } : null,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
  }))
}

/** Hides a comment for everyone (community). The text is kept for the record. */
export async function hideCommentAsOperator({ admin, commentId, hiddenBy }: { admin: SupabaseClient; commentId: string; hiddenBy: string }) {
  const { error } = await admin.rpc('flp_hide_comment_operator', { p_comment_id: commentId, p_operator: hiddenBy })

  if (error) {
    throw failure({ error, notFound: new ModerationError(`No comment has the id ${commentId}`, 'not_found') })
  }
}

/** Closes a report: `dismissed` (nothing wrong) or `actioned` (taken down, or the owner told). */
export async function resolveReport({
  admin,
  id,
  status,
  resolvedBy,
}: {
  admin: SupabaseClient
  id: string
  status: 'dismissed' | 'actioned'
  resolvedBy: string
}) {
  const { error } = await admin.rpc('flp_resolve_report', { p_id: id, p_status: status, p_operator: resolvedBy })

  if (error) {
    throw failure({ error, notFound: new ModerationError(`No open report has the id ${id}`, 'not_found') })
  }
}

// ---------------------------------------------------------------------------
// Vote review: signs of one person voting through several accounts
// ---------------------------------------------------------------------------

export type VoterRecord = {
  voterId: string
  accountCreatedAt: string
  votedAt: string
  /** Owners of every design this account voted for, this one's owner included. */
  votedOwners: readonly string[]
}

export type VoteFlag = 'same-hour-accounts' | 'votes-only-this-owner' | 'voted-on-signup'

const HOUR_MS = 3_600_000

/**
 * What looks like vote-ring behaviour among a design's voters. Signs, not
 * proof: an operator reads them with the accounts' emails before acting.
 * - same-hour-accounts: three or more voters whose accounts were made
 *   within the same hour;
 * - votes-only-this-owner: the account voted for nobody else;
 * - voted-on-signup: the vote came within ten minutes of the account.
 */
export function reviewVotes({ ownerId, voters }: { ownerId: string; voters: readonly VoterRecord[] }) {
  const created = voters.map((voter) => Date.parse(voter.accountCreatedAt))
  const flags = new Map<string, Set<VoteFlag>>(voters.map((voter) => [voter.voterId, new Set<VoteFlag>()]))

  voters.forEach((voter, index) => {
    const sameHour = created.filter((time) => Math.abs(time - created[index]!) <= HOUR_MS).length

    if (sameHour >= 3) flags.get(voter.voterId)!.add('same-hour-accounts')
    if (voter.votedOwners.length > 0 && voter.votedOwners.every((owner) => owner === ownerId)) {
      flags.get(voter.voterId)!.add('votes-only-this-owner')
    }
    if (Date.parse(voter.votedAt) - created[index]! <= 10 * 60_000) flags.get(voter.voterId)!.add('voted-on-signup')
  })

  const flagged = voters.filter((voter) => flags.get(voter.voterId)!.size > 0)
  return {
    total: voters.length,
    flagged: flagged.map((voter) => ({ ...voter, flags: [...flags.get(voter.voterId)!].sort() })),
  }
}

/** Reads a design's voters for `reviewVotes`. Operators only. */
export async function votersOf({ admin, slug }: { admin: SupabaseClient; slug: string }) {
  const publication = await admin.from('publications').select('owner_id').eq('slug', slug).maybeSingle<{ owner_id: string }>()

  if (publication.error || !publication.data) {
    throw new ModerationError(`No publication has the link ${slug}`, 'not_found')
  }

  const votes = await admin
    .from('publication_votes')
    .select('voter_id, created_at')
    .eq('slug', slug)
    .returns<Array<{ voter_id: string; created_at: string }>>()

  if (votes.error) {
    throw new ModerationError('Votes could not be read', 'failed')
  }

  const voterIds = votes.data.map((vote) => vote.voter_id)
  const theirVotes = voterIds.length
    ? await admin
        .from('publication_votes')
        .select('voter_id, publications!inner(owner_id)')
        .in('voter_id', voterIds)
        .returns<Array<{ voter_id: string; publications: { owner_id: string } }>>()
    : { data: [], error: null }

  if (theirVotes.error) {
    throw new ModerationError('Votes could not be read', 'failed')
  }

  // Accounts in batches of 20 at a time rather than one after another.
  const voters: VoterRecord[] = []

  for (let start = 0; start < votes.data.length; start += 20) {
    const batch = votes.data.slice(start, start + 20)
    const users = await Promise.all(batch.map((vote) => admin.auth.admin.getUserById(vote.voter_id)))

    batch.forEach((vote, index) => {
      voters.push({
        voterId: vote.voter_id,
        accountCreatedAt: users[index]!.data.user?.created_at ?? vote.created_at,
        votedAt: vote.created_at,
        votedOwners: theirVotes.data.filter((row) => row.voter_id === vote.voter_id).map((row) => row.publications.owner_id),
      })
    })
  }

  return { ownerId: publication.data.owner_id, voters }
}
