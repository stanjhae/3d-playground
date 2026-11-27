import { type FormEvent, useState } from 'react'

import type { Overview } from './server/handlers.ts'
import type { AdminDesign, AdminReport, AdminUser, FlagsPanel, HealthPanel, ReportAction } from './server/panels.ts'
import { adminPost } from './supabase.ts'
import { Badge, Loaded, PanelTitle, button, card, formatDate, input, muted, quietButton, useAdminGet } from './ui.tsx'

export type Links = { siteUrl: string | null; posthogUrl: string | null }

const shareLink = (siteUrl: string | null, slug: string) => (siteUrl ? `${siteUrl}/s/${slug}` : null)

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
      {children}
    </a>
  )
}

/** A search box that sends its value when submitted. */
function Search({ label, onSearch, children }: { label: string; onSearch: (value: string) => void; children?: React.ReactNode }) {
  const [value, setValue] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch(value.trim())
  }

  return (
    <form role="search" className="mb-4 flex flex-wrap items-end gap-3" onSubmit={submit}>
      <label className="block min-w-60 flex-1 space-y-1 text-sm">
        <span>{label}</span>
        <input className={input} type="search" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      {children}
      <button className={button}>Search</button>
    </form>
  )
}

// ---------------------------------------------------------------------------

export function OverviewPanel({ links }: { links: Links }) {
  const { result, reload } = useAdminGet<Overview>('/api/overview')

  return (
    <section>
      <PanelTitle aside={links.posthogUrl ? <ExternalLink href={links.posthogUrl}>Open PostHog dashboards</ExternalLink> : <span className={`text-sm ${muted}`}>Set FLV_POSTHOG_URL to link PostHog</span>}>
        Overview
      </PanelTitle>
      <Loaded result={result} reload={reload}>
        {(overview) => (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                ['Accounts', overview.users],
                ['Designs', overview.designs],
                ['Published', overview.publications],
                ['Open reports', overview.openReports],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className={card}>
                <dt className={`text-sm ${muted}`}>{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
      </Loaded>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function UsersPanel() {
  const [query, setQuery] = useState('')
  const { result, reload } = useAdminGet<{ total: number; users: AdminUser[] }>(`/api/users?q=${encodeURIComponent(query)}`)

  return (
    <section>
      <PanelTitle>Users</PanelTitle>
      <Search label="Email, name, handle or id" onSearch={setQuery} />
      <Loaded result={result} reload={reload}>
        {({ total, users }) => (
          <>
            <p className={`mb-2 text-sm ${muted}`}>
              {total === users.length ? `${total} ${total === 1 ? 'account' : 'accounts'}` : `Showing ${users.length} of ${total}`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className={muted}>
                  <tr>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Signed up</th>
                    <th className="py-2 pr-4 font-medium">Last sign-in</th>
                    <th className="py-2 text-right font-medium">Designs</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="py-2 pr-4 [overflow-wrap:anywhere]">{user.email ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {user.displayName ?? '—'}
                        {user.handle ? <span className={muted}> @{user.handle}</span> : null}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(user.lastSignInAt)}</td>
                      <td className="py-2 text-right tabular-nums">{user.designs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Loaded>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function DesignsPanel({ links }: { links: Links }) {
  const [query, setQuery] = useState('')
  const [published, setPublished] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { result, reload } = useAdminGet<{ total: number; designs: AdminDesign[] }>(
    `/api/designs?q=${encodeURIComponent(query)}${published ? '&published=1' : ''}`,
  )

  async function unpublish(design: AdminDesign) {
    if (!window.confirm(`Unpublish “${design.title}”? It leaves the board and its link stops working. The owner can publish it again.`)) return
    setBusy(design.id)
    const done = await adminPost('/api/designs', { action: 'unpublish', designId: design.id })
    setBusy(null)
    setMessage(done.ok ? `Unpublished “${design.title}”.` : done.message)
    reload()
  }

  return (
    <section>
      <PanelTitle>Designs and publications</PanelTitle>
      <Search label="Title or design id" onSearch={setQuery}>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          Published only
        </label>
      </Search>
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      <Loaded result={result} reload={reload}>
        {({ total, designs }) => (
          <>
            <p className={`mb-2 text-sm ${muted}`}>
              {total === designs.length ? `${total} ${total === 1 ? 'design' : 'designs'}` : `Showing ${designs.length} of ${total}, last changed first`}
            </p>
            <ul className="space-y-2">
              {designs.map((design) => {
                const link = design.publication ? shareLink(links.siteUrl, design.publication.slug) : null
                const expanded = open === design.id
                return (
                  <li key={design.id} className={card}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button type="button" className="text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : design.id)}>
                        <span className="font-medium [overflow-wrap:anywhere]">{design.title}</span>
                        <span className={`block text-sm ${muted}`}>
                          {design.ownerEmail ?? design.ownerId} · changed {formatDate(design.updatedAt)}
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        {design.visibility === 'published' ? <Badge tone="good">Published</Badge> : <Badge tone="neutral">Private</Badge>}
                        {design.publication?.held ? <Badge tone="bad">Held</Badge> : null}
                        {link ? <ExternalLink href={link}>View</ExternalLink> : null}
                        {design.visibility === 'published' ? (
                          <button type="button" className={quietButton} disabled={busy === design.id} onClick={() => unpublish(design)}>
                            Unpublish
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {expanded ? (
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        <dt className={muted}>Design id</dt>
                        <dd className="font-mono text-xs [overflow-wrap:anywhere]">{design.id}</dd>
                        <dt className={muted}>Description</dt>
                        <dd className="[overflow-wrap:anywhere]">{design.description || '—'}</dd>
                        <dt className={muted}>Versions</dt>
                        <dd>{design.versions ?? 0}</dd>
                        <dt className={muted}>Created</dt>
                        <dd>{formatDate(design.createdAt)}</dd>
                        <dt className={muted}>Publication</dt>
                        <dd>
                          {design.publication
                            ? `${design.publication.slug} · ${design.publication.status}${design.publication.publishedAt ? ` · since ${formatDate(design.publication.publishedAt)}` : ''}`
                            : 'Never published'}
                        </dd>
                      </dl>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Loaded>
    </section>
  )
}

// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<ReportAction, string> = { dismiss: 'Dismiss', action: 'Resolve', hide: 'Hide content' }

export function ReportsPanel({ links }: { links: Links }) {
  const { result, reload } = useAdminGet<{ reports: AdminReport[] }>('/api/reports')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function act(report: AdminReport, action: ReportAction) {
    const what = report.commentId ? 'the comment for everyone' : 'the design: unpublish it and hold its link so the owner can’t publish it again'
    if (action === 'hide' && !window.confirm(`Hide ${what}?`)) return
    setBusy(report.id)
    const done = await adminPost('/api/reports', { id: report.id, action })
    setBusy(null)
    setMessage(done.ok ? `${ACTION_LABELS[action]}: done.` : done.message)
    reload()
  }

  return (
    <section>
      <PanelTitle aside={<span className={`text-sm ${muted}`}>Oldest first. Resolve: handled another way, e.g. the owner was told.</span>}>
        Reports
      </PanelTitle>
      {message ? <p role="status" className="mb-3 text-sm">{message}</p> : null}
      <Loaded result={result} reload={reload}>
        {({ reports }) =>
          reports.length === 0 ? (
            <p className={muted}>No open reports.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((report) => {
                const link = shareLink(links.siteUrl, report.slug)
                return (
                  <li key={report.id} className={card}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">
                          <Badge tone="bad">{report.reason}</Badge> {report.commentId ? 'A comment on ' : ''}
                          <span className="[overflow-wrap:anywhere]">{report.title ?? report.slug}</span>
                          {report.publication === 'revoked' ? <span className={muted}> (unpublished)</span> : null}
                        </p>
                        {report.comment ? (
                          <blockquote className="border-l-2 border-neutral-300 pl-3 text-sm [overflow-wrap:anywhere] dark:border-neutral-700">
                            {report.comment.body}
                            {report.comment.hidden ? <span className={muted}> (already hidden)</span> : null}
                          </blockquote>
                        ) : null}
                        {report.note ? <p className="text-sm [overflow-wrap:anywhere]">“{report.note}”</p> : null}
                        <p className={`text-sm ${muted}`}>
                          Reported {formatDate(report.createdAt)}
                          {link ? (
                            <>
                              {' · '}
                              <ExternalLink href={link}>View</ExternalLink>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(['hide', 'action', 'dismiss'] as const).map((action) => (
                          <button key={action} type="button" className={quietButton} disabled={busy === report.id} onClick={() => act(report, action)}>
                            {ACTION_LABELS[action]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        }
      </Loaded>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function HealthPanelView() {
  const { result, reload } = useAdminGet<HealthPanel>('/api/health')

  return (
    <section>
      <PanelTitle aside={<button type="button" className={quietButton} onClick={reload}>Check again</button>}>Health</PanelTitle>
      <Loaded result={result} reload={reload}>
        {({ siteUrl, site, hosted }) => (
          <div className="grid gap-4 md:grid-cols-2">
            <div className={card}>
              <h3 className="mb-2 font-medium">
                Site <code className="text-sm">/api/health</code>
              </h3>
              {site.reached ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className={muted}>State</dt>
                  <dd>{site.body.ok ? <Badge tone="good">OK</Badge> : <Badge tone="bad">Failing ({site.status})</Badge>}</dd>
                  <dt className={muted}>Supabase</dt>
                  <dd>{site.body.supabase ?? '—'}</dd>
                  <dt className={muted}>Version</dt>
                  <dd>
                    {site.body.version ?? '—'} {site.body.commit ? <span className={muted}>at {site.body.commit}</span> : null}
                  </dd>
                  <dt className={muted}>Environment</dt>
                  <dd>{site.body.environment ?? '—'}</dd>
                  <dt className={muted}>Error tracking</dt>
                  <dd>{site.body.errorTracking ?? '—'}</dd>
                </dl>
              ) : (
                <p role="alert" className="text-sm">
                  <Badge tone="bad">Unreachable</Badge> {site.message}
                </p>
              )}
              {siteUrl ? <p className={`mt-2 text-xs ${muted}`}>{siteUrl}</p> : null}
            </div>
            <div className={card}>
              <h3 className="mb-2 font-medium">Latest hosted check</h3>
              {hosted ? (
                <>
                  <p className="mb-2 text-sm">
                    <Badge tone={hosted.verdict.startsWith('PASS') ? 'good' : 'bad'}>{hosted.verdict}</Badge> {hosted.result}
                  </p>
                  <p className={`text-sm ${muted}`}>
                    {formatDate(hosted.run)} · {hosted.target}
                  </p>
                  <p className={`text-sm ${muted}`}>{hosted.app}</p>
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {hosted.checks
                      .filter((check) => !check.result.startsWith('PASS'))
                      .map((check) => (
                        <li key={check.id}>
                          <code>{check.id}</code>: {check.result}
                        </li>
                      ))}
                  </ul>
                  <p className={`mt-2 text-xs ${muted}`}>{hosted.file}, as of this admin’s deploy</p>
                </>
              ) : (
                <p className={muted}>No hosted-check record is committed yet.</p>
              )}
            </div>
          </div>
        )}
      </Loaded>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function FlagsPanelView() {
  const { result, reload } = useAdminGet<FlagsPanel>('/api/flags')

  return (
    <section>
      <PanelTitle aside={<span className={`text-sm ${muted}`}>Read-only. Change them in the site’s Vercel project, then redeploy.</span>}>Flags</PanelTitle>
      <Loaded result={result} reload={reload}>
        {({ flags, message, source }) => (
          <>
            {message ? <p role="alert" className="mb-3 text-sm">{message}</p> : null}
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {flags.map((flag) => (
                <li key={flag.name} className="flex items-center justify-between px-4 py-3 text-sm">
                  <code>{flag.name}</code>
                  {flag.on === null ? <Badge tone="neutral">Unknown</Badge> : flag.on ? <Badge tone="good">On</Badge> : <Badge tone="neutral">Off</Badge>}
                </li>
              ))}
            </ul>
            {source ? <p className={`mt-2 text-xs ${muted}`}>As the site at {source} reports them.</p> : null}
          </>
        )}
      </Loaded>
    </section>
  )
}
