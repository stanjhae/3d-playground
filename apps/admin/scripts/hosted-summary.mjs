import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

/**
 * Bakes the latest committed hosted-check record (docs/evidence/hosted-<date>.md,
 * written by `pnpm hosted:check`) into a small JSON file the admin's health
 * route serves. Run before every dev and build, so the admin shows the newest
 * record as of its deploy. Local runs (`-local`) and the sample are skipped;
 * the Supabase URL in the record is left out.
 */

const evidence = new URL('../../../docs/evidence/', import.meta.url)
const out = new URL('../src/server/hosted-summary.gen.json', import.meta.url)

export function parseHostedRecord(text) {
  const verdict = /^# Hosted check: (.+)$/m.exec(text)?.[1]?.trim() ?? 'unknown'
  const field = (name) => new RegExp(`^\\| ${name} \\| (.+?) \\|$`, 'm').exec(text)?.[1]?.replaceAll('`', '').trim() ?? null
  const checks = [...text.matchAll(/^\| `([a-z0-9-]+)` \| [^|]* \| (.+?) \|$/gm)].map(([, id, result]) => ({ id, result: result.trim() }))
  return { verdict, target: field('Target'), app: field('App'), run: field('Run'), result: field('Result'), checks }
}

const files = readdirSync(evidence)
  .filter((name) => /^hosted-\d{4}-\d{2}-\d{2}\.md$/.test(name))
  .sort()
const latest = files.at(-1)
const summary = latest ? { file: `docs/evidence/${latest}`, ...parseHostedRecord(readFileSync(new URL(latest, evidence), 'utf8')) } : null

writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`)
