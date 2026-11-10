import { appendFileSync, writeFileSync } from 'node:fs'

import { resultTable, runSyntheticChecks } from '../src/lib/synthetic-check.ts'

/**
 * Synthetic check (O1): read-only GETs of the hosted site's home page,
 * `/api/health` and a missing share link. Exits 1 when any check fails
 * twice. See docs/alerts.md.
 *
 *   SYNTHETIC_BASE_URL=https://beta.fashionleadervote.com node scripts/synthetic-check.mjs
 *
 * Writes the result table to $GITHUB_STEP_SUMMARY and, with
 * SYNTHETIC_REPORT set, to that file (the alert issue's body).
 */

const base = process.env.SYNTHETIC_BASE_URL || 'https://beta.fashionleadervote.com'
const results = await runSyntheticChecks({ base })
const table = resultTable({ base, results })

console.log(table)

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)
}

if (process.env.SYNTHETIC_REPORT) {
  writeFileSync(process.env.SYNTHETIC_REPORT, `${table}\n`)
}

process.exit(results.every((r) => r.ok) ? 0 : 1)
