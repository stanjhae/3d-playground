import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stillsDir = join(root, 'public', 'stills')
const looks = JSON.parse(readFileSync(join(root, 'data/designs.json'), 'utf8'))
const port = 5198
const base = `http://127.0.0.1:${port}`

function findChrome() {
  const fromEnv = process.env.CHROME_PATH

  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv
  }

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]

  return candidates.find((path) => existsSync(path)) ?? ''
}

function startVite() {
  const child = spawn(
    'pnpm',
    ['dev', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KV_REST_API_URL: '',
        KV_REST_API_TOKEN: '',
      },
    },
  )

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('The studio did not open'))
    }, 20000)

    function onChunk(chunk) {
      if (!String(chunk).includes('Local:')) {
        return
      }

      clearTimeout(timer)
      resolve(child)
    }

    child.stdout.on('data', onChunk)
    child.stderr.on('data', onChunk)
    child.on('error', (error) => {
      clearTimeout(timer)
      child.kill('SIGTERM')
      reject(error)
    })
  })
}

async function framedStill({ page }) {
  return page.evaluate(async () => {
    const { captureFramedStill } = await import('/src/lib/capture-still.ts')

    return captureFramedStill({
      canvas: document.querySelector('canvas'),
      type: 'image/png',
    })
  })
}

mkdirSync(stillsDir, { recursive: true })

const chrome = findChrome()

if (!chrome) {
  throw new Error('Chrome is not installed. Set CHROME_PATH.')
}

let vite
let browser

try {
  vite = await startVite()
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: [
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-webgl2',
    ],
  })

  const page = await browser.newPage()
  page.setDefaultTimeout(40000)

  for (const look of looks) {
    await page.goto(`${base}/?design=${encodeURIComponent(look.id)}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('canvas')

    try {
      await page.waitForFunction(
        (title) =>
          document.body.innerText
            .toLowerCase()
            .includes(`remixing ${title}`.toLowerCase()),
        { timeout: 20000 },
        look.title,
      )
    } catch (error) {
      const text = await page.evaluate(() => document.body.innerText)
      throw new Error(
        `Remix for ${look.id} did not land.\n${text.slice(0, 800)}\n${error}`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 3200))

    const dataUrl = await framedStill({ page })

    if (!dataUrl.startsWith('data:image/png')) {
      throw new Error(`The still for ${look.id} did not capture`)
    }

    const path = join(stillsDir, `${look.id}.png`)
    writeFileSync(path, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'))
    console.log('wrote', path)
  }
} finally {
  if (browser) {
    await browser.close()
  }

  vite?.kill('SIGTERM')
}
