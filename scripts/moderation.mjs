import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import {
  ModerationError,
  activeHolds,
  clearModerationHold,
  hideCommentAsOperator,
  moderationStatus,
  openReports,
  resolveReport,
  reviewVotes,
  slugFromReport,
  takeDownPublication,
  votersOf,
} from '../src/lib/flp-api/moderation.ts'

/**
 * Moderation takedowns (P2). Operators only: it needs the project's
 * secret key. See docs/abuse.md for when to use it.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs status <slug or share link>
 *   … node scripts/moderation.mjs takedown <slug or link> --reason "…" --by "<your name>" [--confirm]
 *   … node scripts/moderation.mjs clear <slug or link> --by "<your name>" [--confirm]
 *   … node scripts/moderation.mjs list
 *   … node scripts/moderation.mjs reports
 *   … node scripts/moderation.mjs dismiss|action <report id> --by "<your name>"
 *   … node scripts/moderation.mjs votes <slug or link>
 *   … node scripts/moderation.mjs hide-comment <comment id> --by "<your name>"
 *
 * reports lists open reports, oldest first; dismiss and action close one
 * (action after a takedown or a word with the owner). votes lists signs
 * of one person voting through several accounts (docs/abuse.md).
 *
 * takedown unpublishes now and stops the owner publishing that design
 * again; clear lets them publish again (it does not republish). Both are
 * dry runs without --confirm.
 */

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reason: { type: 'string' },
    by: { type: 'string' },
    confirm: { type: 'boolean', default: false },
  },
})

const [command, target] = positionals
const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const usage =
  'Usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs status|takedown|clear|list|reports|dismiss|action|votes|hide-comment [<slug, link, report or comment id>] [--reason "…"] [--by "…"] [--confirm]'

if (!url || !secretKey || !['status', 'takedown', 'clear', 'list', 'reports', 'dismiss', 'action', 'votes', 'hide-comment'].includes(command ?? '')) {
  console.error(usage)
  process.exit(1)
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

function describe(status) {
  const hold = status.hold
  const held = hold && !hold.clearedAt
  const lines = [
    `${status.slug}${status.title ? ` "${status.title}"` : ''}: ${status.publication ?? 'no such publication'}`,
  ]

  if (hold) {
    lines.push(
      held
        ? `  held since ${hold.heldAt} by ${hold.heldBy}: ${hold.reason}`
        : `  hold cleared ${hold.clearedAt} by ${hold.clearedBy} (was: ${hold.reason})`,
    )
  }

  return lines.join('\n')
}

try {
  if (command === 'list') {
    const holds = await activeHolds({ admin })
    console.log(holds.length ? holds.map((hold) => `${hold.slug}  ${hold.heldAt}  ${hold.heldBy}: ${hold.reason}`).join('\n') : 'No holds in force.')
    process.exit(0)
  }

  if (command === 'reports') {
    const reports = await openReports({ admin })
    console.log(
      reports.length
        ? reports.map((report) => `${report.id}  ${report.createdAt}  ${report.slug}${report.commentId ? ` comment ${report.commentId}` : ''}  ${report.reason}${report.note ? `: ${report.note}` : ''}`).join('\n')
        : 'No open reports.',
    )
    process.exit(0)
  }

  if (command === 'dismiss' || command === 'action') {
    if (!target || !flags.by?.trim()) {
      console.error(`${command} needs a report id and --by.`)
      process.exit(1)
    }

    await resolveReport({ admin, id: target, status: command === 'dismiss' ? 'dismissed' : 'actioned', resolvedBy: flags.by })
    console.log(`Report ${target} ${command === 'dismiss' ? 'dismissed' : 'marked actioned'}.`)
    process.exit(0)
  }

  if (command === 'hide-comment') {
    if (!target || !flags.by?.trim()) {
      console.error('hide-comment needs a comment id and --by.')
      process.exit(1)
    }

    await hideCommentAsOperator({ admin, commentId: target, hiddenBy: flags.by })
    console.log(`Comment ${target} hidden.`)
    process.exit(0)
  }

  const slug = slugFromReport({ value: target ?? '' })

  if (!slug) {
    console.error(`"${target ?? ''}" is not a share link or slug (16 hex characters).`)
    process.exit(1)
  }

  if (command === 'votes') {
    const { ownerId, voters } = await votersOf({ admin, slug })
    const review = reviewVotes({ ownerId, voters })
    console.log(`${slug}: ${review.total} votes, ${review.flagged.length} with signs worth a look`)

    for (const voter of review.flagged) {
      console.log(`  ${voter.voterId}  account ${voter.accountCreatedAt}  voted ${voter.votedAt}  ${voter.flags.join(', ')}`)
    }

    process.exit(0)
  }

  const before = await moderationStatus({ admin, slug })
  console.log(describe(before))

  if (command === 'status') {
    process.exit(0)
  }

  if (!flags.by?.trim() || (command === 'takedown' && !flags.reason?.trim())) {
    console.error(command === 'takedown' ? 'A takedown needs --reason and --by.' : 'Clearing needs --by.')
    process.exit(1)
  }

  if (!flags.confirm) {
    console.log(
      command === 'takedown'
        ? `Dry run: would unpublish ${slug} and hold it. Rerun with --confirm.`
        : `Dry run: would clear the hold on ${slug}. Rerun with --confirm.`,
    )
    process.exit(0)
  }

  if (command === 'takedown') {
    await takeDownPublication({ admin, slug, reason: flags.reason, heldBy: flags.by })
    console.log(`Taken down. ${slug} is unpublished and cannot be published again until cleared.`)
  } else {
    await clearModerationHold({ admin, slug, clearedBy: flags.by })
    console.log(`Cleared. The owner may publish ${slug} again; it stays unpublished until they do.`)
  }

  console.log(describe(await moderationStatus({ admin, slug })))
} catch (error) {
  console.error(error instanceof ModerationError ? error.message : error)
  process.exit(1)
}
