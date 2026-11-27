// Bakes the landing hero's poster (public/landing/hero-tee-*.webp) from the
// live scene: the dev server's `/?poster=1` bench, photographed on a
// transparent page and encoded by the browser. Re-run (`pnpm poster`)
// whenever the tee, its seat or the demo design changes. Chrome comes from
// CHROME_PATH or the usual install locations, as for `pnpm stills`.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = new URL('../public/landing/', import.meta.url)
const port = 5199
const WIDTHS = [480, 800, 1200]
// The poster's frame, square like the hero stage (src/components/landing/HeroPoster.tsx).
const FRAME = { width: 640, height: 640, scale: 2 }

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  return candidates.find((path) => path && existsSync(path)) ?? ''
}

function startVite() {
  // Vite itself, not through pnpm, so stopping it really stops it.
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('The dev server did not start'))
    }, 30000)
    const onChunk = (chunk) => {
      if (/Error/.test(String(chunk))) console.error(String(chunk))
      if (String(chunk).includes('Local')) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout.on('data', onChunk)
    child.stderr.on('data', onChunk)
  })
}

const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH.')
  process.exit(1)
}

const vite = await startVite()
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
})

try {
  const page = await browser.newPage()
  // The bench page clears its own background with an injected style.
  await page.setBypassCSP(true)
  await page.setViewport({ width: FRAME.width, height: FRAME.height, deviceScaleFactor: FRAME.scale })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.goto(`http://127.0.0.1:${port}/?poster=1`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.addStyleTag({
    content: 'html,body,#root,.flv,main{background:transparent!important}header,footer,a[href="#main-content"]{display:none!important}',
  })
  await page.waitForSelector('[data-poster-ready="true"]', { timeout: 60000 })
  const png = await page.screenshot({ omitBackground: true, type: 'png', encoding: 'base64' })

  // The browser encodes WebP; no image tooling needed here.
  const encoded = await page.evaluate(
    async ({ png, widths, ratio }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      return widths.map((width) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = Math.round(width * ratio)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        return { width, data: canvas.toDataURL('image/webp', 0.86).split(',')[1] }
      })
    },
    { png, widths: WIDTHS, ratio: FRAME.height / FRAME.width },
  )

  mkdirSync(outDir, { recursive: true })
  for (const { width, data } of encoded) {
    const file = new URL(`hero-tee-${width}.webp`, outDir)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`wrote public/landing/hero-tee-${width}.webp (${Math.round(Buffer.from(data, 'base64').length / 1024)} KiB)`)
  }
} finally {
  await browser.close()
  vite.kill('SIGTERM')
}
