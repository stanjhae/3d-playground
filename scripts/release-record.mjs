import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { CANONICAL_SCHEMA_VERSION } from '../src/lib/canonical-document.ts'
import { CURRENT_TEMPLATE } from '../src/lib/template-manifest.ts'

/**
 * The release record for a candidate (Q07 #192, V06 #201): what exactly
 * ships, printed and written to docs/evidence/release-<version>.md.
 *
 *   node scripts/release-record.mjs \
 *     [--suite "pnpm test=605 passed"] [--suite "pnpm e2e=14 passed"] \
 *     [--hosted docs/evidence/hosted-2026-11-10.md] [--commit <sha>]
 *
 * Suite results can also come from RELEASE_SUITES, separated by `;`
 * ("pnpm test=605 passed;supabase test db=PASS").
 */

const { values: flags } = parseArgs({
  options: {
    suite: { type: 'string', multiple: true, default: [] },
    hosted: { type: 'string' },
    commit: { type: 'string', default: 'HEAD' },
  },
})

const root = new URL('..', import.meta.url)

function run(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const read = (path) => readFileSync(new URL(path, root), 'utf8')
const version = JSON.parse(read('package.json')).version
const commit = run('git', ['rev-parse', flags.commit])

if (!commit) {
  console.error(`release-record: ${flags.commit} is not a commit`)
  process.exit(2)
}

const subject = run('git', ['log', '-1', '--format=%s (%cs)', commit])
const tags = run('git', ['tag', '--points-at', commit]).split('\n').filter(Boolean)
const dirty = flags.commit === 'HEAD' && run('git', ['status', '--porcelain', '--untracked-files=no'])

// Migrations in apply order, with checksums to compare against
// `supabase migration list` on the linked project.
const migrations = readdirSync(new URL('supabase/migrations/', root))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({
    name,
    sha256: createHash('sha256').update(readFileSync(new URL(`supabase/migrations/${name}`, root))).digest('hex'),
  }))

// The latest CI runs for this exact commit.
let ci

try {
  ci = JSON.parse(
    run('gh', ['run', 'list', '--commit', commit, '--limit', '10', '--json', 'workflowName,status,conclusion,url,event,createdAt']) ||
      '[]',
  )
} catch {
  ci = []
}

const latestByWorkflow = [...new Map(ci.map((each) => [each.workflowName, each])).values()]

const suites = [...flags.suite, ...(process.env.RELEASE_SUITES ?? '').split(';')]
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const at = entry.indexOf('=')
    return at < 0 ? { name: entry, result: '' } : { name: entry.slice(0, at).trim(), result: entry.slice(at + 1).trim() }
  })

let hosted = null

if (flags.hosted) {
  if (!existsSync(new URL(flags.hosted, root))) {
    console.error(`release-record: ${flags.hosted} does not exist`)
    process.exit(2)
  }

  hosted = { path: flags.hosted, verdict: read(flags.hosted).match(/^# Hosted check: (.+)$/m)?.[1] ?? 'unknown' }
}

/**
 * The "Known limits" section of this version's CHANGELOG entry, or of the
 * newest entry that has one.
 */
function knownLimits() {
  const entries = read('CHANGELOG.md').split(/^(?=## )/m).slice(1)
  const withLimits = entries
    .map((entry) => ({
      heading: entry.split('\n')[0].replace(/^## /, ''),
      limits: entry.match(/^### Known limits[^\n]*\n([\s\S]*?)(?=^##|$(?![\s\S]))/m)?.[1].trim(),
    }))
    .filter((entry) => entry.limits)
  const own = withLimits.find((entry) => entry.heading.includes(version))
  return own ?? withLimits[0] ?? null
}

const limits = knownLimits()
const ciRows = latestByWorkflow.length
  ? latestByWorkflow
      .map((each) => `| ${each.workflowName} | ${each.conclusion || each.status} | ${each.createdAt} | ${each.url} |`)
      .join('\n')
  : '| (none found for this commit; is it pushed?) | | | |'

const record = `# Release record: ${version}

| | |
| --- | --- |
| Version | \`${version}\` (package.json) |
| Tag | ${tags.length ? tags.map((tag) => `\`${tag}\``).join(', ') : `none yet (expected \`v${version}\`)`} |
| Commit | \`${commit}\`${dirty ? ' **(uncommitted changes in the working tree)**' : ''} |
| Subject | ${subject} |
| Template | \`${CURRENT_TEMPLATE.id}@${CURRENT_TEMPLATE.version}\` (src/lib/template-manifest.ts) |
| Canonical schema | v${CANONICAL_SCHEMA_VERSION} (src/lib/canonical-document.ts) |
| Recorded | ${new Date().toISOString()} |

## Migrations

${migrations.length} files in \`supabase/migrations/\`, in apply order. Compare with \`supabase migration list --linked\`.

| Migration | SHA-256 |
| --- | --- |
${migrations.map((each) => `| \`${each.name}\` | \`${each.sha256}\` |`).join('\n')}

## CI

| Workflow | Result | Started | Run |
| --- | --- | --- | --- |
${ciRows}

## Suites

${
  suites.length || hosted
    ? `| Suite | Result |\n| --- | --- |\n${suites.map((each) => `| ${each.name} | ${each.result} |`).join('\n')}${
        hosted ? `${suites.length ? '\n' : ''}| \`pnpm hosted:check\` | ${hosted.verdict} ([${hosted.path}](../../${hosted.path})) |` : ''
      }`
    : 'None recorded. Pass `--suite "name=result"` (or `RELEASE_SUITES`) and `--hosted <evidence file>`.'
}

## Known limits

${limits ? `From CHANGELOG.md, ${limits.heading}:\n\n${limits.limits}` : 'CHANGELOG.md has no "Known limits" section.'}
`

console.log(record)
const out = new URL(`docs/evidence/release-${version}.md`, root)
mkdirSync(new URL('.', out), { recursive: true })
writeFileSync(out, record)
console.error(`wrote docs/evidence/release-${version}.md`)
