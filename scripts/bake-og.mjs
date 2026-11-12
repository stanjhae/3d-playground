// Bakes public/og-default.png (1200×630), the site's social card: the
// landing's headline beside its hero tee (public/landing/hero-tee-800.webp,
// from `pnpm poster`), in the landing's own fonts and colours. Chrome comes
// from CHROME_PATH or the usual install locations.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import puppeteer from 'puppeteer-core'

const file = (path) => new URL(`../${path}`, import.meta.url)
const base64 = (path) => readFileSync(file(path)).toString('base64')

const chrome = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path))

if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH.')
  process.exit(1)
}

const display = base64('node_modules/@fontsource/inter-tight/files/inter-tight-latin-800-normal.woff2')
const body = base64('node_modules/@fontsource/outfit/files/outfit-latin-400-normal.woff2')
const tee = base64('public/landing/hero-tee-800.webp')

const html = `<!doctype html><html><head><style>
@font-face{font-family:D;src:url(data:font/woff2;base64,${display}) format('woff2');font-weight:800}
@font-face{font-family:B;src:url(data:font/woff2;base64,${body}) format('woff2')}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;font-family:B;color:#0b0d12;
  background:radial-gradient(700px 420px at 85% 40%,rgb(240 101 14/.18),transparent 70%),
  radial-gradient(500px 300px at 0% 0%,rgb(224 20 31/.08),transparent 70%),#fcfcfd}
.grid{position:absolute;inset:0;background-image:linear-gradient(to right,rgb(11 13 18/.05) 1px,transparent 1px),linear-gradient(to bottom,rgb(11 13 18/.05) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(ellipse 70% 70% at 70% 40%,#000 30%,transparent 75%)}
.copy{position:absolute;left:72px;top:64px;width:620px}
.mark{font-family:D;font-size:40px;letter-spacing:-.03em;background:linear-gradient(105deg,#e0141f,#f0650e);-webkit-background-clip:text;color:transparent}
h1{font-family:D;font-size:84px;line-height:.92;letter-spacing:-.045em;margin-top:56px}
.accent{background:linear-gradient(105deg,#e0141f,#f0650e);-webkit-background-clip:text;color:transparent;padding-bottom:.08em;display:block}
p{margin-top:28px;font-size:26px;color:#5b6270}
.card{position:absolute;right:64px;top:55px;width:440px;height:520px;border-radius:36px;overflow:hidden;border:1px solid #e8eaee;background:#fff;box-shadow:0 40px 80px -30px rgb(11 13 18/.35)}
.card img{width:100%;height:100%;object-fit:cover}
</style></head><body><div class="grid"></div>
<div class="copy"><div class="mark">FLV</div><h1>Sketch it.<br>See it in 3D.<span class="accent">Put it to the vote.</span></h1>
<p>Design a T-shirt in your browser. Fashion Leader Vote.</p></div>
<div class="card"><img src="data:image/webp;base64,${tee}"></div></body></html>`

const browser = await puppeteer.launch({ executablePath: chrome, headless: true })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  writeFileSync(file('public/og-default.png'), await page.screenshot({ type: 'png' }))
  console.log('wrote public/og-default.png')
} finally {
  await browser.close()
}
