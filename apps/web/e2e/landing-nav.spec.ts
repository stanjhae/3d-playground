import { expect, test } from '@playwright/test'

import { LANDING_NAV } from '../src/lib/landing-copy'

/**
 * The header marks the section being read with the red underline, on a
 * laptop and on a tablet (an iPad Air is 820 wide): founder feedback, the
 * underline only showed from 1024 px up.
 */

for (const width of [1280, 820]) {
  test(`the section in view is underlined in the header at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 1000 ? 800 : 1180 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Site' }).first()
    await expect(nav).toBeVisible()

    for (const link of LANDING_NAV) {
      const id = link.href.slice(1)
      // The section's top a little into the reading band (20–40% down the screen).
      await page.locator(`#${id}`).evaluate((section) => {
        window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.22, behavior: 'instant' })
      })
      const current = nav.getByRole('link', { name: link.label, exact: true })
      await expect(current).toHaveAttribute('aria-current', 'location')
      await expect(nav.locator('[aria-current="location"]')).toHaveCount(1)
      // The underline is the accent, not transparent.
      expect(await current.evaluate((element) => getComputedStyle(element).borderBottomColor)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    }
  })
}

test('the underline also works after arriving from another page', async ({ page }) => {
  // On beta the header never marked a section when the landing was reached
  // from another page (or signed in): it looked the sections up once, when
  // it mounted, before they existed.
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/privacy')
  await page.getByRole('link', { name: /Fashion Leader Vote|FLV/ }).first().click()
  await expect(page).toHaveURL(/\/$|\/#/)
  const nav = page.getByRole('navigation', { name: 'Site' }).first()
  await expect(nav).toBeVisible()

  for (const link of LANDING_NAV) {
    const id = link.href.slice(1)
    await page.locator(`#${id}`).evaluate((section) => {
      window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.22, behavior: 'instant' })
    })
    await expect(nav.getByRole('link', { name: link.label, exact: true })).toHaveAttribute('aria-current', 'location')
  }
})

test('a reader who scrolls the prerendered landing keeps their place when it comes alive', async ({ page }) => {
  // Found on beta: on a slow connection a visitor scrolls the prerendered
  // page, then the live one takes over and the router sent them to the top.
  // Holding the app's scripts back stands in for the slow connection.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await route.continue()
  })
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForSelector('#features')
  const prerendered = await page.evaluate(() => Boolean(document.getElementById('flv-static')))
  test.skip(!prerendered, 'Only the production build (E2E_SERVER=preview) serves the prerendered landing')

  const kept = await page.evaluate(() => {
    const section = document.getElementById('features')!
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.22, behavior: 'instant' })
    return window.scrollY
  })
  expect(kept).toBeGreaterThan(500)

  await expect.poll(() => page.evaluate(() => !document.getElementById('flv-static')), { timeout: 30_000 }).toBe(true)
  await page.waitForTimeout(800)
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - kept)).toBeLessThan(4)
  const nav = page.getByRole('navigation', { name: 'Site' }).first()
  await expect(nav.getByRole('link', { name: 'Features', exact: true })).toHaveAttribute('aria-current', 'location')
})
