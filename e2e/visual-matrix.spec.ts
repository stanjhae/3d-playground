import { type Browser, type Page, chromium, expect, test, webkit } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * The browser and visual fixture matrix for owner review (Q06 #191, R03
 * #166). Not part of the normal suite: run with VISUAL_MATRIX=1.
 *
 * Four tees (white, black, saturated, check pattern), each with a
 * non-square transparent image, small text, paint and a labelled mark on
 * every panel, are published in Chromium. Then Chromium and WebKit (a
 * stand-in for recent Safari, not a Safari release) screenshot the studio
 * at every camera preset at 1366×768, and the public page at 390 px.
 * Screenshots land in `test-results/visual-matrix/<browser>/`.
 */

test.skip(!process.env.VISUAL_MATRIX, 'visual matrix run only (VISUAL_MATRIX=1)')

const OUT = 'test-results/visual-matrix'
const PRESETS = ['front', 'threeQuarter', 'back', 'left', 'right', 'orbit'] as const
const VARIANTS = [
  { key: 'white', title: 'Matrix white', base: { kind: 'solid', color: '#f7f5f0' }, ink: '#1a1c22' },
  { key: 'black', title: 'Matrix black', base: { kind: 'solid', color: '#16161a' }, ink: '#f4ead4' },
  { key: 'saturated', title: 'Matrix red', base: { kind: 'solid', color: '#c8102e' }, ink: '#ffffff' },
  { key: 'check', title: 'Matrix check', base: { kind: 'check', colors: ['#f4ead4', '#2b3a67'], period: 0.08 }, ink: '#c8102e' },
] as const

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

/** Builds the designs through the app's own client modules, in the page. */
async function createDesigns({ page }: { page: Page }) {
  return page.evaluate(async (variants) => {
    const fixtures = await import('/src/lib/image-fixtures.ts')
    const { uploadAsset } = await import('/src/lib/flp-api/assets.ts')
    const { createOwnedDesign } = await import('/src/lib/flp-api/client.ts')
    const { createEmptyCanonicalDocument } = await import('/src/lib/canonical-document.ts')

    // A 240×120 PNG: an opaque disc and bar on a fully transparent ground.
    const width = 240
    const height = 120
    const stride = 1 + width * 4
    const raw = new Uint8Array(stride * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const disc = (x - 60) ** 2 + (y - 60) ** 2 < 50 ** 2
        const bar = x > 120 && x < 230 && y > 45 && y < 75
        raw.set(disc ? [230, 160, 20, 255] : bar ? [40, 120, 200, 255] : [0, 0, 0, 0], y * stride + 1 + x * 4)
      }
    }
    const png = fixtures.concatBytes([
      fixtures.PNG_SIGNATURE,
      fixtures.pngHeader({ width, height }),
      fixtures.pngChunk({ type: 'IDAT', data: await fixtures.deflate({ bytes: raw }) }),
      fixtures.pngChunk({ type: 'IEND' }),
    ])
    const uploaded = await uploadAsset({ file: new Blob([png], { type: 'image/png' }) })
    if (!uploaded.ok) throw new Error(`upload failed: ${uploaded.message}`)

    const designs: Array<{ key: string; designId: string }> = []
    for (const variant of variants) {
      const content = createEmptyCanonicalDocument()
      content.base = variant.base as typeof content.base
      const mark = (id: string, text: string, y = 0.3) => ({
        id, kind: 'text' as const, visible: true, opacity: 1, content: text, face: 'sans' as const,
        color: variant.ink as `#${string}`, x: 0.5, y, scale: 0.18, rotation: 0,
      })
      content.panels.front.layers = [
        { id: 'img', kind: 'image', visible: true, opacity: 1, assetId: uploaded.data.assetId, aspect: 2, x: 0.5, y: 0.45, scale: 0.32, rotation: 0 },
        { ...mark('front-mark', 'FRONT', 0.25) },
        // Small text: legibility check.
        { ...mark('small', 'small print 12', 0.68), scale: 0.07, face: 'display' },
      ]
      content.panels.back.layers = [
        { id: 'paint', kind: 'paint', visible: true, opacity: 1, strokes: [
          { id: 's1', tool: 'brush', color: variant.ink as `#${string}`, width: 0.03, opacity: 1, points: [0.2, 0.6, 0.4, 0.7, 0.6, 0.6, 0.8, 0.7] },
        ] },
        mark('back-mark', 'BACK', 0.35),
      ]
      content.panels.left.layers = [mark('left-mark', 'L', 0.5)]
      content.panels.right.layers = [mark('right-mark', 'R', 0.5)]
      const created = await createOwnedDesign({
        request: { mutationKey: crypto.randomUUID(), title: variant.title, content },
      })
      if (!created.ok) throw new Error(`create failed: ${created.message}`)
      designs.push({ key: variant.key, designId: created.data.designId })
    }
    return designs
  }, VARIANTS as unknown as Array<{ key: string; title: string; base: unknown; ink: string }>)
}

async function publish({ page, designId }: { page: Page; designId: string }) {
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 180_000 })
  return new URL((await link.getAttribute('href'))!).pathname
}

async function shootBrowser({
  name,
  browser,
  baseURL,
  storageState,
  designs,
}: {
  name: string
  browser: Browser
  baseURL: string
  storageState: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>
  designs: Array<{ key: string; designId: string; publicPath: string }>
}) {
  const dir = `${OUT}/${name}`
  await mkdir(dir, { recursive: true })
  const errors: string[] = []
  const studio = await browser.newContext({ baseURL, storageState, viewport: { width: 1366, height: 768 } })
  const page = await studio.newPage()
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))

  for (const design of designs) {
    await page.goto(`/create?cloud=${design.designId}&step=design`)
    await expectSaved({ page })
    for (const preset of PRESETS) {
      await page.evaluate(async (cameraPreset) => {
        const { useEditorStore } = await import('/src/lib/editor-store.ts')
        useEditorStore.getState().setCameraPreset({ cameraPreset })
      }, preset)
      // The camera glides to its seat; give it time on slow renderers.
      await page.waitForTimeout(2_500)
      await page.screenshot({ path: `${dir}/${design.key}-studio-${preset}.png` })
    }
  }
  await studio.close()

  const visitor = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } })
  const anonymous = await visitor.newPage()
  anonymous.on('pageerror', (error) => errors.push(`${name} public: ${error.message}`))
  for (const design of designs) {
    await anonymous.goto(design.publicPath)
    await expect(anonymous.getByRole('img')).toHaveCount(5, { timeout: 30_000 })
    await anonymous.waitForLoadState('networkidle')
    const overflow = await anonymous.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${name} public ${design.key} overflow`).toBeLessThanOrEqual(0)
    await anonymous.screenshot({ path: `${dir}/${design.key}-public-390.png`, fullPage: true })
  }
  await visitor.close()

  return { browser: name, version: browser.version(), errors }
}

test('visual and browser matrix', async ({ page, context, baseURL }) => {
  test.setTimeout(30 * 60_000)
  const email = newEmail({ label: 'matrix' })
  emails.push(email)
  await signIn({ page, email })

  const created = await createDesigns({ page })
  const designs: Array<{ key: string; designId: string; publicPath: string }> = []
  for (const design of created) {
    designs.push({ ...design, publicPath: await publish({ page, designId: design.designId }) })
  }
  const storageState = await context.storageState()

  const record = []
  for (const [name, type] of [['chromium', chromium], ['webkit', webkit]] as const) {
    const browser = await type.launch()
    try {
      record.push(await shootBrowser({ name, browser, baseURL: baseURL!, storageState, designs }))
    } finally {
      await browser.close()
    }
  }

  await writeFile(
    `${OUT}/record.json`,
    JSON.stringify({ when: new Date().toISOString(), platform: process.platform, arch: process.arch, browsers: record, designs }, null, 2),
  )
  expect(record.flatMap((entry) => entry.errors)).toEqual([])
})
