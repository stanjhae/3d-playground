import { ModerationError, type OpenReport, hideCommentAsOperator, openReports, resolveReport, takeDownPublication } from '@flv/moderation'
import type { SupabaseClient } from '@supabase/supabase-js'

import hostedSummary from './hosted-summary.gen.json' with { type: 'json' }

/**
 * What each admin panel reads and does. Every function here gets the
 * service-role client, so it must only be called after `requireAdmin`
 * (handlers.ts). Errors are thrown; the handler turns them into answers.
 */

/** How many rows a list answers with at most. */
export const LIST_LIMIT = 50
/** How many accounts are read to search; beta is far below this. */
const USER_SCAN = 1000
const SITE_TIMEOUT_MS = 4000

export class PanelError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function failed(what: string, error: { code?: string; message?: string } | null) {
  return new Error(`${what} failed: ${error?.code ?? error?.message ?? 'unknown'}`)
}

/** Count of rows per owner id, for the owners given. */
async function designCounts({ client, ownerIds }: { client: SupabaseClient; ownerIds: string[] }) {
  const counts = new Map<string, number>()

  if (ownerIds.length === 0) {
    return counts
  }

  const { data, error } = await client.from('designs').select('owner_id').in('owner_id', ownerIds)

  if (error) {
    throw failed('design counts', error)
  }

  for (const row of data as { owner_id: string }[]) {
    counts.set(row.owner_id, (counts.get(row.owner_id) ?? 0) + 1)
  }

  return counts
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type AdminUser = {
  id: string
  email: string | null
  createdAt: string
  lastSignInAt: string | null
  displayName: string | null
  handle: string | null
  designs: number
}

/** Accounts, newest first, whose email, name or handle contains `query`. */
export async function listUsers({ client, query }: { client: SupabaseClient; query: string }) {
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: USER_SCAN })

  if (error) {
    throw failed('user list', error)
  }

  const ids = data.users.map((user) => user.id)
  const profiles = new Map<string, { display_name: string | null; handle: string | null }>()

  if (ids.length > 0) {
    const read = await client.from('profiles').select('owner_id, display_name, handle').in('owner_id', ids)

    if (read.error) {
      throw failed('profiles', read.error)
    }

    for (const row of read.data as { owner_id: string; display_name: string | null; handle: string | null }[]) {
      profiles.set(row.owner_id, row)
    }
  }

  const needle = query.trim().toLowerCase()
  const matches = data.users
    .map((user) => ({ user, profile: profiles.get(user.id) }))
    .filter(({ user, profile }) =>
      !needle ||
      [user.email, profile?.display_name, profile?.handle, user.id].some((value) => value?.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.user.created_at.localeCompare(a.user.created_at))

  const page = matches.slice(0, LIST_LIMIT)
  const counts = await designCounts({ client, ownerIds: page.map(({ user }) => user.id) })

  return {
    total: matches.length,
    users: page.map(({ user, profile }): AdminUser => ({
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      displayName: profile?.display_name ?? null,
      handle: profile?.handle ?? null,
      designs: counts.get(user.id) ?? 0,
    })),
  }
}

// ---------------------------------------------------------------------------
// Designs and publications
// ---------------------------------------------------------------------------

export type AdminDesign = {
  id: string
  title: string
  description: string
  ownerId: string
  ownerEmail: string | null
  visibility: 'private' | 'published'
  versions: number | null
  createdAt: string
  updatedAt: string
  publication: { slug: string; status: 'published' | 'revoked'; publishedAt: string | null; held: boolean } | null
}

type DesignRow = {
  id: string
  owner_id: string
  title: string
  description: string
  visibility: 'private' | 'published'
  head_seq: number | null
  created_at: string
  updated_at: string
}

type PublicationRow = { slug: string; design_id: string; status: 'published' | 'revoked'; published_at: string | null }

/**
 * Designs, last changed first. `query` matches the title or the design id;
 * `published` keeps only live publications.
 */
export async function listDesigns({ client, query, published }: { client: SupabaseClient; query: string; published: boolean }) {
  let read = client
    .from('designs')
    .select('id, owner_id, title, description, visibility, head_seq, created_at, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT)

  const needle = query.trim()

  if (/^[0-9a-f-]{36}$/i.test(needle)) {
    read = read.eq('id', needle)
  } else if (needle) {
    // PostgREST pattern: escape its wildcards so a title search is literal.
    read = read.ilike('title', `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  }

  if (published) {
    read = read.eq('visibility', 'published')
  }

  const { data, error, count } = await read

  if (error) {
    throw failed('design list', error)
  }

  const rows = data as DesignRow[]
  const designIds = rows.map((row) => row.id)
  const publications = new Map<string, PublicationRow>()
  const held = new Set<string>()

  if (designIds.length > 0) {
    const pubs = await client.from('publications').select('slug, design_id, status, published_at').in('design_id', designIds)

    if (pubs.error) {
      throw failed('publications', pubs.error)
    }

    for (const row of pubs.data as PublicationRow[]) {
      publications.set(row.design_id, row)
    }

    const slugs = [...publications.values()].map((row) => row.slug)

    if (slugs.length > 0) {
      const holds = await client.from('moderation_holds').select('slug').in('slug', slugs).is('cleared_at', null)

      if (holds.error) {
        throw failed('holds', holds.error)
      }

      for (const row of holds.data as { slug: string }[]) {
        held.add(row.slug)
      }
    }
  }

  const emails = await ownerEmails({ client, ownerIds: [...new Set(rows.map((row) => row.owner_id))] })

  return {
    total: count ?? rows.length,
    designs: rows.map((row): AdminDesign => {
      const publication = publications.get(row.id)
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        ownerId: row.owner_id,
        ownerEmail: emails.get(row.owner_id) ?? null,
        visibility: row.visibility,
        versions: row.head_seq,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publication: publication
          ? { slug: publication.slug, status: publication.status, publishedAt: publication.published_at, held: held.has(publication.slug) }
          : null,
      }
    }),
  }
}

async function ownerEmails({ client, ownerIds }: { client: SupabaseClient; ownerIds: string[] }) {
  const emails = new Map<string, string | null>()

  await Promise.all(
    ownerIds.map(async (id) => {
      const { data } = await client.auth.admin.getUserById(id)
      emails.set(id, data.user?.email ?? null)
    }),
  )

  return emails
}

/** Withdraws a design's publication now, as its owner could. The owner may publish again. */
export async function unpublishDesign({ client, designId }: { client: SupabaseClient; designId: string }) {
  const { data, error } = await client.from('designs').select('owner_id, visibility').eq('id', designId).maybeSingle<{ owner_id: string; visibility: string }>()

  if (error) {
    throw failed('design read', error)
  }

  if (!data) {
    throw new PanelError(404, 'not_found', 'No design has that id')
  }

  if (data.visibility !== 'published') {
    throw new PanelError(409, 'not_published', 'That design is not published')
  }

  const revoked = await client.rpc('flp_revoke_publication', { p_owner_id: data.owner_id, p_design_id: designId })

  if (revoked.error) {
    throw failed('unpublish', revoked.error)
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type AdminReport = OpenReport & { title: string | null; publication: 'published' | 'revoked' | null }

/** The open reports queue, oldest first, with each design's title and state. */
export async function listReports({ client }: { client: SupabaseClient }): Promise<AdminReport[]> {
  const reports = await openReports({ admin: client })
  const slugs = [...new Set(reports.map((report) => report.slug))]
  const info = new Map<string, { title: string | null; status: 'published' | 'revoked' }>()

  if (slugs.length > 0) {
    const { data, error } = await client.from('publications').select('slug, title, status').in('slug', slugs)

    if (error) {
      throw failed('report designs', error)
    }

    for (const row of data as { slug: string; title: string | null; status: 'published' | 'revoked' }[]) {
      info.set(row.slug, row)
    }
  }

  return reports.map((report) => ({
    ...report,
    title: info.get(report.slug)?.title ?? null,
    publication: info.get(report.slug)?.status ?? null,
  }))
}

export type ReportAction = 'dismiss' | 'action' | 'hide'

/**
 * Closes one report. `dismiss`: nothing wrong. `action`: handled some other
 * way (the owner was told). `hide`: hides the reported comment, or takes the
 * reported design down and holds its link, then closes the report as actioned.
 */
export async function actOnReport({
  client,
  id,
  action,
  operator,
}: {
  client: SupabaseClient
  id: string
  action: ReportAction
  operator: string
}) {
  try {
    if (action === 'hide') {
      const { data, error } = await client.from('publication_reports').select('slug, comment_id, reason, status').eq('id', id).maybeSingle<{
        slug: string
        comment_id: string | null
        reason: string
        status: string
      }>()

      if (error) {
        throw failed('report read', error)
      }

      if (!data || data.status !== 'open') {
        throw new PanelError(404, 'not_found', 'No open report has that id')
      }

      if (data.comment_id) {
        await hideCommentAsOperator({ admin: client, commentId: data.comment_id, hiddenBy: operator })
      } else {
        await takeDownPublication({ admin: client, slug: data.slug, reason: `Report: ${data.reason}`, heldBy: operator })
      }
    }

    await resolveReport({ admin: client, id, status: action === 'dismiss' ? 'dismissed' : 'actioned', resolvedBy: operator })
  } catch (failure) {
    if (failure instanceof ModerationError) {
      throw failure.code === 'not_found' ? new PanelError(404, 'not_found', failure.message) : new PanelError(422, failure.code, failure.message)
    }

    throw failure
  }
}

// ---------------------------------------------------------------------------
// Health and flags
// ---------------------------------------------------------------------------

export type SiteHealth = {
  ok: boolean
  version?: string
  commit?: string
  environment?: string
  supabase?: string
  errorTracking?: string
  flags?: Record<string, boolean>
}

export type HostedSummary = {
  file: string
  verdict: string
  target: string | null
  app: string | null
  run: string | null
  result: string | null
  checks: { id: string; result: string }[]
} | null

export type HealthPanel = {
  siteUrl: string | null
  site: { reached: true; status: number; body: SiteHealth } | { reached: false; message: string }
  hosted: HostedSummary
}

/** The site's own `/api/health`, read from the server; null `siteUrl` when not set. */
export async function readSiteHealth({ siteUrl, fetchImpl = fetch }: { siteUrl: string | null; fetchImpl?: typeof fetch }): Promise<HealthPanel['site']> {
  if (!siteUrl) {
    return { reached: false, message: 'FLV_SITE_URL is not set on the admin server' }
  }

  try {
    const response = await fetchImpl(`${siteUrl.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(SITE_TIMEOUT_MS) })
    const body = (await response.json()) as SiteHealth
    return { reached: true, status: response.status, body }
  } catch {
    return { reached: false, message: 'The site’s health route didn’t answer' }
  }
}

export async function healthPanel({ siteUrl, fetchImpl }: { siteUrl: string | null; fetchImpl?: typeof fetch }): Promise<HealthPanel> {
  return { siteUrl, site: await readSiteHealth({ siteUrl, fetchImpl }), hosted: hostedSummary as HostedSummary }
}

/** The flags the admin shows, read-only. Anything the site didn't report is null (unknown). */
export const FLAG_NAMES = ['VITE_PATTERN_BETA', 'VITE_AI_ASSIST', 'FLP_AI_ASSIST'] as const

export type FlagsPanel = {
  source: string | null
  flags: { name: (typeof FLAG_NAMES)[number]; on: boolean | null }[]
  message: string | null
}

export async function flagsPanel({ siteUrl, fetchImpl }: { siteUrl: string | null; fetchImpl?: typeof fetch }): Promise<FlagsPanel> {
  const site = await readSiteHealth({ siteUrl, fetchImpl })
  const reported = site.reached ? site.body.flags : undefined

  return {
    source: siteUrl,
    flags: FLAG_NAMES.map((name) => ({ name, on: typeof reported?.[name] === 'boolean' ? reported[name] : null })),
    message: !site.reached ? site.message : reported ? null : 'The site’s health route doesn’t report flags yet (deploy the site first)',
  }
}
