import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** My Studio cards: pictures, search, sort and copies (P3). */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('a retried example after a lost response makes one design, not two', async ({ page }) => {
  const email = newEmail({ label: 'example-retry' })
  emails.push(email)
  await signIn({ page, email })

  // The first create reaches the server, but its answer never arrives.
  let lost = false
  await page.route('**/api/flp/designs', async (route) => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true
      await route.fetch()
      await route.abort('connectionreset')
      return
    }
    await route.continue()
  })

  const example = page.getByRole('button', { name: 'Start from an example' })
  await example.click()
  await expect(page.getByRole('status').filter({ hasText: 'The example could not open' })).toBeVisible()
  await example.click()
  await expect(page).toHaveURL(/\/create\?/)
  await expectSaved({ page })

  await page.goto('/studio')
  await expect(page.getByRole('link', { name: 'Example design' })).toHaveCount(1)
})

test('cards show the design, and can be searched, sorted and copied', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'studio-list' })
  emails.push(email)
  await signIn({ page, email })

  await page.getByRole('button', { name: 'Start from an example' }).click()
  await expectSaved({ page })
  await page.goto('/studio')

  // A private design's picture is drawn from its latest saved version.
  const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Example design' }) })
  await expect(card.locator('[data-thumbnail]')).toHaveAttribute('data-thumbnail', 'still')

  await card.getByRole('button', { name: 'Duplicate Example design' }).click()
  await expect(page.getByRole('link', { name: 'Example design copy' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Copied as Example design copy.' })).toBeAttached()

  // The copy is its own design with the same content.
  const ids = await page.getByRole('list').getByRole('link').evaluateAll((links) =>
    links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get('cloud')),
  )
  expect(new Set(ids).size).toBe(2)
  const content = (designId: string) =>
    page.evaluate(async (id) => {
      const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
      const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      return (await response.json()).head.content
    }, designId)
  expect(await content(ids[0]!)).toEqual(await content(ids[1]!))

  // Newest first; by name the original comes first, and that is remembered.
  const titles = () => page.getByRole('list').getByRole('link').allTextContents()
  expect(await titles()).toEqual(['Example design copy', 'Example design'])
  await page.getByLabel('Sort by').selectOption('name')
  expect(await titles()).toEqual(['Example design', 'Example design copy'])
  await page.reload()
  await expect(page.getByLabel('Sort by')).toHaveValue('name')

  const search = page.getByRole('searchbox', { name: 'Search by name' })
  await search.fill('COPY')
  expect(await titles()).toEqual(['Example design copy'])
  await expect(page.getByText('1 of 2 designs')).toBeVisible()
  await search.fill('nothing like this')
  await expect(page.getByText('No designs match “nothing like this”.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear the search' }).click()
  expect(await titles()).toHaveLength(2)
})
