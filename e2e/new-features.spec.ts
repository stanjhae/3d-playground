import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** The description field, off-panel warning, tool hints and example design. */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function openDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
}

test('the description takes up to 500 characters, says how many, and is there after a reload', async ({ page }) => {
  await openDesign({ page, label: 'describe' })
  await page.getByRole('button', { name: 'Add a description' }).click()
  const box = page.getByRole('textbox', { name: 'Design description' })
  const saved = page.waitForResponse((response) => response.request().method() === 'PATCH')
  await box.fill('x'.repeat(600))
  await expect(box).toHaveValue('x'.repeat(500))
  await expect(page.getByText(/^500 of 500/)).toBeVisible()
  await box.blur()
  expect((await saved).status()).toBe(200)

  await page.reload()
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Description', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Design description' })).toHaveValue('x'.repeat(500))
})
