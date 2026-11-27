import { type Browser, type BrowserContextOptions, type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectNoCspViolations, expectSaved, newEmail, publishWithPlaceholders, signIn, watchCsp } from './helpers'

/**
 * The share page's 3D view: the published version turns in 3D over its
 * front still, after the stills have painted; without WebGL, under reduced
 * motion or when the 3D view fails, the stills are the page. Vote, Copy
 * link, Make your own and Report stay where they were.
 */

const emails: string[] = []
let slug = ''

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

/** CI runners report few cores; pin a capable device so the page loads 3D by itself. */
const CAPABLE_DEVICE = () => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
}

async function visit({ browser, options = {}, init }: { browser: Browser; options?: BrowserContextOptions; init?: () => void }) {
  const context = await browser.newContext(options)
  const violations = await watchCsp({ context })
  await context.addInitScript(CAPABLE_DEVICE)

  if (init) {
    await context.addInitScript(init)
  }

  const page = await context.newPage()
  return { context, page, violations }
}

async function expectStillsAndActions({ page }: { page: Page }) {
  await expect(page.getByRole('heading', { name: '3D share tee' })).toBeVisible()
  // The poster is decorative: the five views are still the page's pictures.
  await expect(page.getByRole('img')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Make your own' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in to vote' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Report this design' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'share-3d' })
  emails.push(email)
  const page = await browser.newPage()
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  const title = page.getByRole('textbox', { name: 'Design name' })
  await title.fill('3D share tee')
  await title.press('Enter')
  await expectSaved({ page })
  slug = await publishWithPlaceholders({ page })
  await page.close()
})

test('the design turns in 3D, and the view buttons glide it round', async ({ browser }) => {
  test.setTimeout(90_000)
  const { context, page, violations } = await visit({ browser, options: { viewport: { width: 1280, height: 800 } } })
  const scene = page.waitForResponse((response) => response.url().includes(`/api/flp/public/${slug}/scene?seq=`))
  await page.goto(`/s/${slug}`)
  const stage = page.getByTestId('share-stage')
  await expect(stage).toHaveAttribute('data-stage', 'ready', { timeout: 60_000 })
  expect((await scene).status()).toBe(200)
  await expectStillsAndActions({ page })

  const canvas = page.getByTestId('share-3d-canvas')
  await expect(canvas).toBeVisible()
  const views = page.getByRole('group', { name: 'Turn to a view' })
  await expect(views.getByRole('button')).toHaveText(['Front', '3/4', 'Back', "Wearer's right", "Wearer's left"])
  await expect(views.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'true')

  await views.getByRole('button', { name: 'Back' }).click()
  await expect(views.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-pressed', 'true')
  await expect(views.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'false')

  // A drag by hand turns it; no view button is current any more.
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(views.getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(stage).toHaveAttribute('data-stage', 'ready')

  expectNoCspViolations({ violations })
  await context.close()
})

test('on a phone it fits the width and lets a vertical swipe scroll the page', async ({ browser }) => {
  test.setTimeout(90_000)
  const { context, page } = await visit({
    browser,
    options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  })
  await page.goto(`/s/${slug}`)
  await expect(page.getByTestId('share-stage')).toHaveAttribute('data-stage', 'ready', { timeout: 60_000 })
  await expect(page.getByTestId('share-3d-canvas')).toHaveCSS('touch-action', 'pan-y')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await expectStillsAndActions({ page })
  await context.close()
})

test('under reduced motion nothing loads until asked', async ({ browser }) => {
  test.setTimeout(90_000)
  const { context, page } = await visit({ browser, options: { reducedMotion: 'reduce' } })
  const scenes: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/scene')) scenes.push(request.url())
  })
  await page.goto(`/s/${slug}`)
  await expectStillsAndActions({ page })
  const stage = page.getByTestId('share-stage')
  await expect(stage).toHaveAttribute('data-stage', 'ask')
  await page.waitForLoadState('networkidle')
  expect(scenes).toEqual([])
  await expect(page.getByTestId('share-3d-canvas')).toHaveCount(0)

  await page.getByRole('button', { name: 'Turn in 3D' }).click()
  await expect(stage).toHaveAttribute('data-stage', 'ready', { timeout: 60_000 })
  await context.close()
})

test('without WebGL the stills are the page', async ({ browser }) => {
  const { context, page } = await visit({
    browser,
    init: () => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return kind.startsWith('webgl') ? null : (original as (...args: unknown[]) => unknown).call(this, kind, ...rest)
      } as typeof original
    },
  })
  await page.goto(`/s/${slug}`)
  await expectStillsAndActions({ page })
  await expect(page.getByTestId('share-3d-mode')).toHaveAttribute('data-mode', 'off')
  await expect(page.getByTestId('share-stage')).toHaveAttribute('data-stage', 'poster')
  await expect(page.getByRole('button', { name: 'Turn in 3D' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Turn to a view' })).toHaveCount(0)
  await context.close()
})

test('when the 3D view cannot load, the stills stay and say so', async ({ browser }) => {
  const { context, page } = await visit({ browser })
  await page.route('**/api/flp/public/*/scene*', (route) => route.fulfill({ status: 404, body: '{}' }))
  await page.goto(`/s/${slug}`)
  await expect(page.getByTestId('share-stage')).toHaveAttribute('data-stage', 'failed', { timeout: 30_000 })
  await expect(page.getByText('The 3D view isn’t available here. The published views are below.')).toBeVisible()
  await expectStillsAndActions({ page })
  await context.close()
})
