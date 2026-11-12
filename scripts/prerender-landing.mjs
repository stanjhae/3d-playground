// Writes the landing as real HTML after `vite build` (docs/deploy.md):
//   dist/app.html    the plain app shell, served for every other page
//   dist/index.html  the shell with the landing's head and prerendered body
//   dist/robots.txt, dist/sitemap.xml
// The renderer is built with Vite's SSR mode into .flv-prerender/, outside
// dist/, so it never ships or counts against the JS budgets. It refuses to
// write a landing that makes a claim the alpha can't back, carries inline
// styles (blocked by the CSP) or lost the page's CSP meta.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build, loadEnv } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = new URL('../dist/', import.meta.url)
const outDir = new URL('../.flv-prerender/', import.meta.url)
const mode = process.env.MODE ?? 'production'

await build({
  root,
  mode,
  logLevel: 'warn',
  build: {
    ssr: 'src/prerender/landing.tsx',
    outDir: fileURLToPath(outDir),
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: { output: { entryFileNames: 'landing.mjs' } },
  },
})

const landing = await import(pathToFileURL(fileURLToPath(new URL('landing.mjs', outDir))).href)
const env = { ...process.env, ...loadEnv(mode, root, 'VITE_') }
const origin = landing.siteOrigin({ env })
const indexable = landing.siteIndexable({ env })

const shell = readFileSync(new URL('index.html', dist), 'utf8')
const failures = []

if (shell.includes('id="flv-static"')) {
  failures.push('dist/index.html is already prerendered: run `vite build` first')
}

const { head, body } = landing.renderLanding({ origin })
const poster = landing.HERO_POSTER
const preload = `    <link rel="preload" as="image" href="${poster.src(800)}" imagesrcset="${landing.heroPosterSrcSet()}" imagesizes="${poster.sizes}" fetchpriority="high" />`
const html = landing.injectBeforeRoot({
  shell: landing.replaceSiteHead({ shell, head: `${head}\n${preload}` }),
  html: body,
})

// Guards: what the page says and how it is built.
const text = body
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, '&')
for (const value of [text, ...landing.allLandingStrings()]) {
  const found = landing.findForbiddenClaim({ text: value })
  if (found) failures.push(`forbidden claim (${found.what}): "${found.match}"`)
}
if (/\sstyle="/.test(body)) failures.push('inline style attribute in the prerendered body (blocked by the CSP)')
if (/<canvas\b/.test(body)) failures.push('a canvas in the prerendered body')
if (/\/stills\//.test(body)) failures.push('an uncleared still in the prerendered body')
if ((body.match(/<h1\b/g) ?? []).length !== 1) failures.push('the landing must have exactly one h1')
if (/http-equiv="Content-Security-Policy"/.test(shell) && !/http-equiv="Content-Security-Policy"/.test(html)) {
  failures.push('the CSP meta was lost')
}
const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
try {
  JSON.parse(ld?.[1] ?? '')
} catch {
  failures.push('the JSON-LD does not parse')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::prerender-landing: ${failure}`)
  process.exit(1)
}

writeFileSync(new URL('app.html', dist), shell)
writeFileSync(new URL('index.html', dist), html)
writeFileSync(new URL('robots.txt', dist), landing.robotsTxt({ origin, indexable }))
writeFileSync(new URL('sitemap.xml', dist), landing.sitemapXml({ origin }))
rmSync(outDir, { recursive: true, force: true })

console.log(`prerender-landing: ${Math.round(html.length / 1024)} KiB landing for ${origin}${indexable ? '' : ' (not indexable)'}`)
