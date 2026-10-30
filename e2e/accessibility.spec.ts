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
  await expect(link).toBeVisible({ timeout: 30_000 })

  const visitor = await browser.newContext()
  const anonymous = await visitor.newPage()
  await anonymous.goto(new URL((await link.getAttribute('href'))!).pathname)
  await expect(anonymous.getByRole('img')).toHaveCount(3)
  await expectAccessible({ page: anonymous, name: 'shared design' })
  await visitor.close()
})
