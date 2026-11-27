import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('Create shows the pieces still to come as Coming soon, and none of them can be picked', async ({ page }) => {
  const email = newEmail({ label: 'picker-soon' })
  emails.push(email)
  await signIn({ page, email, returnTo: '/studio?new=1' })

  const garments = page.getByRole('radiogroup', { name: 'Garment' })
  for (const name of ['Cap, coming soon', 'Tote bag, coming soon', 'Beanie, coming soon']) {
    const tile = garments.getByRole('radio', { name })
    await expect(tile).toBeDisabled()
    await expect(tile).toContainText('Coming soon')
  }
  // The garment you can make stays the one chosen.
  await expect(garments.getByRole('radio', { checked: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Create a tee' })).toBeEnabled()
})

test('in a saved design, Accessories shows Coming soon tiles and the other garments say why they are locked', async ({ page }) => {
  const email = newEmail({ label: 'picker-locked' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+/)
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!
  await page.goto(`/create?cloud=${designId}&step=select`)
  await expectSaved({ page })

  const gallery = page.getByRole('navigation', { name: 'Garment gallery' })
  await expect(gallery.getByRole('button', { name: /Tee/, pressed: true })).toBeVisible()

  // Another garment: locked, with a lock, and the reason on hover and on focus.
  const hoodie = gallery.getByRole('button', { name: /Hoodie/ })
  await expect(hoodie).toHaveAttribute('aria-disabled', 'true')
  await expect(hoodie.getByLabel('Locked')).toBeVisible()
  await expect(hoodie).toHaveAccessibleDescription('Saved designs keep their garment. Start a new design to switch.')
  const hint = hoodie.locator('xpath=..').locator('[data-locked-hint]')
  await expect(hint).toBeHidden()
  await hoodie.hover()
  await expect(hint).toBeVisible()
  await expect(hint).toContainText('Saved designs keep their garment. Start a new design to switch.')
  await hoodie.click({ force: true })
  // Clicking it changes nothing: the design is still a tee.
  await expect(gallery.getByRole('button', { name: /Tee/, pressed: true })).toBeVisible()
  await page.mouse.move(0, 0)
  await hoodie.focus()
  await expect(hint).toBeVisible()
  await expect(hint.getByRole('link', { name: 'Start a new design' })).toHaveAttribute('href', /^\/studio\?new=/)

  // Accessories is offered, with its pieces coming soon and unpickable.
  await page.getByRole('button', { name: 'Accessories' }).click()
  for (const name of ['Cap, coming soon', 'Tote bag, coming soon', 'Beanie, coming soon']) {
    const tile = gallery.getByRole('button', { name })
    await expect(tile).toBeDisabled()
    await expect(tile).toContainText('Coming soon')
  }

  // The note's link starts a new design.
  await page.getByRole('note').getByRole('link', { name: 'Start a new design' }).click()
  await expect(page.getByRole('heading', { name: 'Start a new design' })).toBeVisible()
})
