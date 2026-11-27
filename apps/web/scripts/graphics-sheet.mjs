// A contact sheet of library graphics, for review and docs/evidence.
//   node scripts/graphics-sheet.mjs [prefix] [out.png]
// defaults to the Logos marks (mark-*) and docs/evidence/graphics-logos-sheet.png.
// Needs Playwright's Chromium (pnpm exec playwright install chromium).
import { readFileSync, readdirSync } from 'node:fs'

import { chromium } from '@playwright/test'

const [prefix = 'mark-', out = '../../docs/evidence/graphics-logos-sheet.png'] = process.argv.slice(2)
const dir = new URL('../public/graphics/', import.meta.url)
const files = readdirSync(dir)
  .filter((name) => name.startsWith(prefix) && name.endsWith('.svg'))
  .sort()

const cell = (name) => {
  const data = readFileSync(new URL(name, dir)).toString('base64')
  return `<figure><div class="art"><img src="data:image/svg+xml;base64,${data}"></div><figcaption>${name.replace('.svg', '')}</figcaption></figure>`
}

const html = `<html><body>
<h1>${files.length} graphics (${prefix}*), drawn by scripts/build-graphics.mjs, CC0</h1>
<div class="grid">${files.map(cell).join('')}</div>
<style>
body{margin:0;background:#f4f1ea;font:13px system-ui;color:#1a1c22}
h1{font-size:20px;margin:20px 24px 4px}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:14px;padding:16px 24px 24px}
figure{margin:0;text-align:center}
.art{background:#fff;border-radius:8px;height:170px;display:flex;align-items:center;justify-content:center}
img{max-width:150px;max-height:150px}
figcaption{margin-top:6px}
</style></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } })
await page.setContent(html)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(`graphics-sheet: ${files.length} graphics → ${out}`)
