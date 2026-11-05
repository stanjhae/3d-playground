import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn, chooseTool } from './helpers'

/**
 * R04: an image that can't load stops publishing, instead of a placeholder
 * reaching the public page. Once it loads, the same design publishes.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('an image that fails to load blocks publishing, with a reason', async ({ page }) => {
  test.setTimeout(240_000)
  const email = newEmail({ label: 'missingimage' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await chooseTool({ page, tool: 'Graphics' })
  await page.getByRole('button', { name: 'Gothic Cross' }).click()
  await expectSaved({ page })

  const url = new URL(page.url())
  url.searchParams.set('step', 'share')
  await page.route('**/graphics/**', (route) => route.abort())
  await page.goto(url.toString())
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByText(/would publish as a placeholder/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })).toHaveCount(0)

  await page.unroute('**/graphics/**')
  await page.goto(url.toString())
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })

  // The public page and its images ask crawlers not to index them.
  const shareUrl = (await link.getAttribute('href'))!
  const share = await page.request.get(shareUrl)
  expect(share.headers()['x-robots-tag']).toBe('noindex')
  expect(await share.text()).toContain('<meta name="robots" content="noindex" />')
})
