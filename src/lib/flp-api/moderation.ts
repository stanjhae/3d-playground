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
