// Draws the FLV brand mark and every file made from it (`pnpm brand`):
//
//   public/brand/flv-mark.svg        the mark in the brand gradient (header, footer)
//   public/brand/flv-mark-mono.svg   one colour, ink, for print and single-colour use
//   public/graphics/logo-flv.svg     the graphics library entry, brand red
//   public/favicon.svg               the mark in white on a gradient tile
//   public/apple-touch-icon.png      180², full bleed (iOS rounds the corners)
//   public/icon-512.png              512², the mark inside the maskable safe zone
//
// The letters sit on one grid, 60 units tall: upright stems 14 wide,
// cross-strokes 13 (a horizontal reads heavier than an upright of the same
// width), and the V's diagonals 14 measured across, so every stroke reads
// the same weight. The V's flat foot matches the stems. The V tucks over the
// L's foot, leaving the same 6-unit gap there as between F and L, so the
// three letters read as one mark.
//
// The PNGs come from Chrome (CHROME_PATH or the usual install locations).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const file = (path) => new URL(`../${path}`, import.meta.url)

export const MARK = {
  width: 112,
  height: 60,
  // F: stem, top arm, middle arm (shorter, as a sign-painter draws it).
  // L: stem and foot. V: one closed shape, both diagonals and the foot.
  path: [
    'M0 0H36V13H14V25H30V38H14V60H0Z',
    'M43 0H57V47H75V60H43Z',
    'M70 0H84L91 30L98 0H112L98 60H84Z',
  ].join(''),
}

export const BRAND_RED = '#e0141f'
export const BRAND_FLARE = '#f0650e'
const INK = '#0b0d12'

function gradient({ id }) {
  // The landing's 105° gradient, red to flare, across the mark.
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.27" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="${BRAND_RED}"/><stop offset="1" stop-color="${BRAND_FLARE}"/></linearGradient>`
}

function markSvg({ fill, defs = '', title = 'FLV' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MARK.width * 2}" height="${MARK.height * 2}" viewBox="0 0 ${MARK.width} ${MARK.height}" role="img" aria-label="${title}">
<title>${title}</title>${defs ? `\n<defs>${defs}</defs>` : ''}
<path fill="${fill}" d="${MARK.path}"/>
</svg>
`
}

/** The mark centred on a square tile, `share` of the tile wide. */
export function tileSvg({ size = 64, radius = 14, share = 0.75 } = {}) {
  const scale = (size * share) / MARK.width
  const x = (size - MARK.width * scale) / 2
  const y = (size - MARK.height * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>${gradient({ id: 'tile' }).replace('y2="0.27"', 'y2="1"')}</defs>
<rect width="${size}" height="${size}" rx="${radius}" fill="url(#tile)"/>
<path fill="#fff" transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})" d="${MARK.path}"/>
</svg>
`
}

function round(value) {
  return Math.round(value * 10_000) / 10_000
}

async function bakePngs() {
  const chrome = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((path) => path && existsSync(path))

  if (!chrome) {
    console.error('No Chrome found for the PNG icons. Set CHROME_PATH.')
    process.exit(1)
  }

  const { default: puppeteer } = await import('puppeteer-core')
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true })

  try {
    const page = await browser.newPage()

    for (const { path, size, share } of [
      { path: 'public/apple-touch-icon.png', size: 180, share: 0.7 },
      // Maskable: the mark's corners stay inside the 40% safe circle.
      { path: 'public/icon-512.png', size: 512, share: 0.62 },
    ]) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
      await page.setContent(
        `<!doctype html><html><body style="margin:0">${tileSvg({ size, radius: 0, share })}</body></html>`,
      )
      writeFileSync(file(path), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } }))
      console.log(`wrote ${path}`)
    }
  } finally {
    await browser.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(file('public/brand'), { recursive: true })
  writeFileSync(file('public/brand/flv-mark.svg'), markSvg({ fill: 'url(#flv)', defs: gradient({ id: 'flv' }) }))
  writeFileSync(file('public/brand/flv-mark-mono.svg'), markSvg({ fill: INK }))
  writeFileSync(file('public/graphics/logo-flv.svg'), markSvg({ fill: BRAND_RED, title: 'FLV Mark' }))
  writeFileSync(file('public/favicon.svg'), tileSvg())
  console.log('wrote public/brand/flv-mark.svg, flv-mark-mono.svg, graphics/logo-flv.svg, favicon.svg')
  await bakePngs()
}
