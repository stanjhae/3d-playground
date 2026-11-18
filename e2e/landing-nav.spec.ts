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
