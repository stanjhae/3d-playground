// Byte budgets checked after `pnpm build` (R06 #169, P4): all JS and the
// largest chunk (gzip) in dist/assets, and each garment GLB in
// public/models. Limits live in scripts/budgets.json; docs/baseline.md
// records what they were measured against.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'))
const root = new URL('../', import.meta.url)
const kib = (bytes) => bytes / 1024
const failures = []

function check({ label, value, limit }) {
  const line = `${label}: ${value.toFixed(1)} KiB (budget ${limit} KiB)`
  console.log(value > limit ? `OVER  ${line}` : `ok    ${line}`)
  if (value > limit) failures.push(line)
}

const assets = new URL('dist/assets/', root)
const chunks = readdirSync(assets)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, size: kib(gzipSync(readFileSync(new URL(name, assets))).length) }))

if (chunks.length === 0) {
  console.error('::error::No JS in dist/assets. Run `pnpm build` first.')
  process.exit(1)
}

const largest = chunks.reduce((a, c) => (c.size > a.size ? c : a))
check({ label: 'All JS, gzip', value: chunks.reduce((sum, c) => sum + c.size, 0), limit: budgets.jsTotalGzipKiB })
check({ label: `Largest JS chunk, gzip (${largest.name})`, value: largest.size, limit: budgets.jsChunkGzipKiB })

const models = new URL('public/models/', root)
for (const name of readdirSync(models).filter((n) => n.endsWith('.glb')).sort()) {
  check({ label: `GLB ${name}`, value: kib(statSync(new URL(name, models)).size), limit: budgets.glbPerTemplateKiB })
}

if (failures.length > 0) {
  for (const line of failures) console.error(`::error::Over budget: ${line}. See docs/baseline.md.`)
  process.exit(1)
}
