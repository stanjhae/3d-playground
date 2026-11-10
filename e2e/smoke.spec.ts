import { expect, test } from '@playwright/test'

import { deleteAccounts, newEmail, panelCanvas, showPanels, signIn } from './helpers'

/**
 * A short pass through every browser project (Q2): sign in, create a tee,
 * and the 3D view gets a WebGL2 context. WebKit runs only this, and is
 * non-blocking in CI until WebGL2 is proven in WebKit on Linux.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('sign in, create a tee, and the studio draws in WebGL2', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'smoke' })
  emails.push(email)
  await signIn({ page, email })

  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))
  test.info().annotations.push({ type: 'webgl2', description: String(webgl2) })
  expect(webgl2, 'WebGL2 context').toBe(true)

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  await expect(page.getByRole('img', { name: '3D preview' })).toBeAttached({ timeout: 30_000 })
  await expect(page.getByText('3D preview unavailable')).toHaveCount(0)
  await showPanels({ page })
  await expect(panelCanvas({ page, panel: 'Front' })).toBeVisible()
})
