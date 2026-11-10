import { expect, test } from '@playwright/test'

import { deleteAccounts, newEmail, panelCanvas, savedStrokes, showPanels, signIn, touchStroke } from './helpers'

/**
 * Touch input on a phone-sized and an iPad-sized Chromium (Q2): a finger
 * drawn through CDP touch emulation paints one stroke, and the studio fits
 * the screen. Runs in the `chromium-touch` and `ipad` projects only.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test.beforeEach(({ browserName, hasTouch }) => {
  test.skip(browserName !== 'chromium' || !hasTouch, 'CDP touch emulation: Chromium with hasTouch')
})

test('a finger paints one stroke on the front panel, and the studio fits the screen', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch' })
  emails.push(email)
  await signIn({ page, email })
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  await showPanels({ page })
  const front = panelCanvas({ page, panel: 'Front' })
  await expect(front).toBeVisible()
  await front.scrollIntoViewIfNeeded()

  await touchStroke({ page, panel: 'Front' })
  await expect.poll(() => savedStrokes({ page }), { timeout: 30_000 }).toHaveLength(1)
  const [points] = await savedStrokes({ page })
  expect(points).toBeGreaterThan(4)

  // Nothing runs off the side: the page never scrolls sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
