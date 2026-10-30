import { expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/** Owner isolation in the browser (A04 #148, S05 #174, Q03 #188). */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test("another account can neither open a design nor see its unsaved local copy", async ({ page }) => {
  const owner = newEmail({ label: 'owner' })
  const other = newEmail({ label: 'other' })
  emails.push(owner, other)

  await signIn({ page, email: owner })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  const designUrl = page.url()
  await expectSaved({ page })

  // Leave an edit that never reaches the cloud, so it exists only locally.
  await page.route('**/api/flp/designs/*/versions', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  )
  await drawStroke({ page, panel: 'Front' })
  await expect(page.getByText('Kept on this device')).toBeVisible()
  await page.unroute('**/api/flp/designs/*/versions')

  // Same browser, different account.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn({ page, email: other })
  await page.goto(designUrl)

  await expect(page.getByText('This design is not available.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recover unsaved changes' })).toHaveCount(0)
  await expect(page.getByText(/changes to this design that never reached the cloud/)).toHaveCount(0)

  // Owner-side recovery is covered by cloud-recovery.test.ts: a second
  // code for the same email within a minute is refused by auth.
})
