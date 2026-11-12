import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn, chooseTool } from './helpers'

/**
 * The 3D preview says when it isn't the whole design, and publishing doesn't
 * photograph it until it is (R01 #164).
 */

const emails: string[] = []
const GRAPHIC = '**/graphics/cross-simple.svg'
const LOADING = 'Artwork is still loading'
const FAILED = 'Some artwork could not load'

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function designWithGraphic({ page, label }: { page: import('@playwright/test').Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Graphics' })
  await page.getByRole('button', { name: 'Simple Cross' }).click()
  await expectSaved({ page })
  return new URL(page.url())
}

test('a slow image shows the note until it arrives, then the note goes', async ({ page }) => {
  test.setTimeout(120_000)
  await designWithGraphic({ page, label: 'atlasslow' })
  await expect(page.getByText(LOADING)).toHaveCount(0)

  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(GRAPHIC, async (route) => {
    await held
    await route.continue()
  })
  await page.reload()
  await expectSaved({ page })
  await expect(page.getByText(LOADING)).toBeVisible()

  release()
  await expect(page.getByText(LOADING)).toHaveCount(0)
  await expect(page.getByText(FAILED)).toHaveCount(0)
})

test('an image that fails says so in the preview, and publishing stops', async ({ page }) => {
  test.setTimeout(120_000)
  const url = await designWithGraphic({ page, label: 'atlasfail' })
  await page.route(GRAPHIC, (route) => route.abort())
  url.searchParams.set('step', 'share')
  await page.goto(url.toString())
  await expectSaved({ page })
  await expect(page.getByText(FAILED)).toBeVisible()

  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByRole('status').filter({ hasText: /hasn.t loaded|could not load/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })).toHaveCount(0)
})

test('publishing waits for a slow image, then includes it', async ({ page }) => {
  test.setTimeout(180_000)
  const url = await designWithGraphic({ page, label: 'atlaswait' })
  let requests = 0
  let uploads = 0
  page.on('request', (request) => {
    uploads += request.method() === 'POST' && request.url().endsWith('/renders') ? 1 : 0
  })
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(GRAPHIC, async (route) => {
    requests += 1
    await held
    await route.continue()
  })
  url.searchParams.set('step', 'share')
  await page.goto(url.toString())
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()

  // No pictures go up while the image is held, for longer than a capture takes.
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await page.waitForTimeout(15_000)
  expect(uploads).toBe(0)
  await expect(link).toHaveCount(0)
  expect(requests).toBeGreaterThan(0)

  release()
  await expect(link).toBeVisible({ timeout: 120_000 })

  // The dark cross is in the published front picture, not left out.
  const slug = (await link.getAttribute('href'))!.split('/s/')[1]!
  const payload = (await (await page.request.get(`/api/flp/public/${slug}`)).json()) as { renders: Record<string, string> }
  const picture = await page.request.get(payload.renders.view_front!)
  const dark = await page.evaluate(
    async ({ data, type }) => {
      const image = new Image()
      image.src = `data:${type};base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      // The whole picture: the backdrop is light, so only the cross is dark,
      // wherever the garment's own framing puts it.
      const { data: pixels } = context.getImageData(0, 0, image.width, image.height)
      let count = 0

      for (let at = 0; at < pixels.length; at += 4) {
        count += pixels[at]! < 70 && pixels[at + 1]! < 70 && pixels[at + 2]! < 70 ? 1 : 0
      }

      return count
    },
    { data: (await picture.body()).toString('base64'), type: picture.headers()['content-type']! },
  )
  expect(dark).toBeGreaterThan(20)
})

// Sets the atlas state through dev-server modules: `@dev-server` runs it there.
test('publishing never photographs an atlas that is still settling, and says why', { tag: '@dev-server' }, async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), 'sets the atlas state through dev-server modules')
  test.setTimeout(120_000)
  const url = await designWithGraphic({ page, label: 'atlasgate' })
  let uploads = 0
  page.on('request', (request) => {
    uploads += request.method() === 'POST' && request.url().endsWith('/renders') ? 1 : 0
  })
  url.searchParams.set('step', 'share')
  await page.goto(url.toString())
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()

  // Stands in for a word whose font is loading, which no image check can see.
  await page.evaluate(async () => {
    const { useAtlasBuild } = await import('/src/lib/atlas-status.ts')
    const { build } = useAtlasBuild.getState()
    useAtlasBuild.setState({ build: { ...build!, state: 'loading' } })
  })
  await page.getByRole('button', { name: 'Confirm publish' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Artwork on this design is still loading' })).toBeVisible({ timeout: 30_000 })
  expect(uploads).toBe(0)
  await expect(page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })).toHaveCount(0)
})
