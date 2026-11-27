import type { SupabaseClient } from '@supabase/supabase-js'
import { type HoldRow, type ModerationHold, ModerationError, holdFromRow } from '@flv/moderation'

// The queue, closing reports, takedowns and hiding comments are shared with
// the admin app (packages/moderation); they are re-exported here for the scripts.
export {
  type ModerationHold,
  type OpenReport,
  ModerationError,
  clearModerationHold,
  hideCommentAsOperator,
  openReports,
  resolveReport,
  takeDownPublication,
} from '@flv/moderation'

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

export type ModerationStatus = {
  slug: string
  /** `published` or `revoked`; null when the slug was never a publication. */
  publication: 'published' | 'revoked' | null
  title: string | null
  hold: ModerationHold | null
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

export type VoteAuditRow = {
  slug: string
  voterId: string
  flag: string
  detail: string | null
  createdAt: string
}

/** Recent vote-integrity signs, newest first. Operators only. */
export async function listVoteAudit({ admin, limit = 50 }: { admin: SupabaseClient; limit?: number }) {
  const rows = await admin
    .from('vote_audit')
    .select('slug, voter_id, flag, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Array<{ slug: string; voter_id: string; flag: string; detail: string | null; created_at: string }>>()

  if (rows.error) {
    throw new ModerationError('The vote audit could not be read', 'failed')
  }

  return rows.data.map((row) => ({
    slug: row.slug,
    voterId: row.voter_id,
    flag: row.flag,
    detail: row.detail,
    createdAt: row.created_at,
  }))
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
