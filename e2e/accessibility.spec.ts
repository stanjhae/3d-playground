import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Automated accessibility scan of the alpha's pages (Q06 #191). Fails on
 * serious or critical WCAG 2.1 A/AA violations; minor ones are reported.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function expectAccessible({ page, name }: { page: Page; name: string }) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The WebGL canvas and its overlays are covered by the 2D panels.
    .exclude('canvas[data-engine]')
    .analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

  for (const violation of results.violations) {
    console.log(`[axe] ${name}: ${violation.impact} ${violation.id} (${violation.nodes.length}) ${violation.help}`)
  }

  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test('sign-in, My Studio, studio, shared page and privacy have no serious violations', async ({ page, browser }) => {
  // Publishing renders three views in software WebGL on CI runners.
  test.setTimeout(240_000)
  await page.goto('/sign-in')
  await expectAccessible({ page, name: 'sign-in' })

  await page.goto('/privacy')
  await expectAccessible({ page, name: 'privacy' })

  const email = newEmail({ label: 'a11y' })
  emails.push(email)
  await signIn({ page, email })
  await expectAccessible({ page, name: 'studio list' })

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await expectAccessible({ page, name: 'editor' })

  const designId = new URL(page.url()).searchParams.get('cloud')
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })

  const visitor = await browser.newContext()
  const anonymous = await visitor.newPage()
  await anonymous.goto(new URL((await link.getAttribute('href'))!).pathname)
  await expect(anonymous.getByRole('img')).toHaveCount(5)
  await expectAccessible({ page: anonymous, name: 'shared design' })
  await visitor.close()
})

test('the steps over the dark scene keep their header on a solid background', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'dark-steps' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')

  for (const step of ['preview', 'share']) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto(`/create?cloud=${designId}&step=${step}`)
      await expectSaved({ page })
      // Axe can't judge text over a canvas, so check what it can't see first.
      const header = page.getByRole('navigation', { name: 'Create steps' }).locator('..')
      const background = await header.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(background, `${step} @${viewport.width}`).not.toMatch(/transparent|\/ 0(\.\d+)?\)|, 0(\.\d+)?\)$/)
      // The header would hide the garment if the scene ran behind it.
      const headerBox = await header.boundingBox()
      const sceneBox = await page.locator('canvas[data-engine]').boundingBox()
      expect(sceneBox!.y, `${step} @${viewport.width}`).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1)
      await expectAccessible({ page, name: `${step} @${viewport.width}` })
    }
  }
})

test('long names and messages never push the page sideways (#163)', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'overflow' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  // The longest title the API accepts, with no spaces to wrap on.
  const longTitle = 'W'.repeat(80)
  const title = page.getByRole('textbox', { name: 'Design name' })
  await title.fill(longTitle)
  await title.press('Enter')

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(await overflow(), `editor @${viewport.width}`).toBeLessThanOrEqual(0)
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/studio')
  await expect(page.getByRole('listitem').filter({ hasText: longTitle })).toBeVisible()

  // The longest public name, also with nothing to wrap on.
  await page.getByRole('textbox', { name: /Public name/ }).fill('N'.repeat(40))

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(await overflow(), `studio @${viewport.width}`).toBeLessThanOrEqual(0)
  }
})
