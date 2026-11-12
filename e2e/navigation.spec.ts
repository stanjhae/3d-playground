import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** The main tabs say where you are, and Create is not My Studio (tester feedback, Phase 2). */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('Create starts a new design, My Studio is the library, and the current tab is marked', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'navigation' })
  emails.push(email)
  await signIn({ page, email })

  const site = page.getByRole('navigation', { name: 'Site' })
  await expect(site.getByRole('link', { name: 'My Studio' })).toHaveAttribute('aria-current', 'page')
  await expect(site.getByRole('link', { name: 'Create' })).not.toHaveAttribute('aria-current', 'page')

  // Create lands on choosing a garment, not on the saved-designs list.
  await site.getByRole('link', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: 'Start a new design' })).toBeVisible()
  await expect(site.getByRole('link', { name: 'Create' })).toHaveAttribute('aria-current', 'page')
  // Only one tab is current: Create's page is under /studio, but it isn't My Studio.
  await expect(site.getByRole('link', { name: 'My Studio' })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Your designs' })).toHaveCount(0)

  await page.getByRole('radiogroup', { name: 'Garment' }).getByRole('radio', { name: /Hoodie/ }).click()
  await page.getByRole('button', { name: 'Create a hoodie' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })
  await expect(site.getByRole('link', { name: 'Create' })).toHaveAttribute('aria-current', 'page')

  // Vote is in the main nav, with the rankings and the newest designs.
  await site.getByRole('link', { name: 'Vote' }).click()
  await expect(page.getByRole('heading', { name: 'Vote and rankings' })).toBeVisible()
  await expect(site.getByRole('link', { name: 'Vote' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('tab', { name: 'Rankings' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'New' }).click()
  await expect(page.getByRole('tab', { name: 'New' })).toHaveAttribute('aria-selected', 'true')
})

test('Save privately returns to My Studio, where the card offers Edit and Publish later', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'save-privately' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  // The publish step offers both choices, plainly.
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await expect(page.getByRole('button', { name: 'Publish publicly…' })).toBeVisible()
  await page.getByRole('button', { name: 'Save privately' }).click()

  await expect(page).toHaveURL(/\/studio\?saved=true$/)
  await expect(page.getByRole('status').filter({ hasText: 'Saved privately. Only you can see it' })).toBeVisible()

  // Publishing later and editing are buttons on the card, not a link to discover.
  await page.getByRole('link', { name: 'Publish…', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/create\\?cloud=${designId}&step=share`))
  await expect(page.getByRole('button', { name: 'Publish publicly…' })).toBeVisible()

  await page.goto('/studio')
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/create\\?cloud=${designId}&step=design`))
})
