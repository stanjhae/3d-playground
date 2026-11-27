import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** Guided is the default: a first design walks the steps with the expert controls tucked away. */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function savedSeq({ page }: { page: Page }) {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return ((await response.json()) as { head: { seq: number } }).head.seq
  }, designId)
}

test('a new design starts on the garment and keeps expert controls out of the way until Pro is on', async ({ page }) => {
  const email = newEmail({ label: 'guided' })
  emails.push(email)
  await page.setViewportSize({ width: 1366, height: 768 })
  await signIn({ page, email, pro: false })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await expect(page).toHaveURL(/step=select/)
  await page.getByRole('button', { name: 'Use this garment' }).click()
  await expect(page).toHaveURL(/step=color/)
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/step=design/)

  // Guided: one way to set the brush, no checkpoints, no numeric placement.
  await expect(page.getByRole('button', { name: 'Line' })).toBeVisible()
  for (const name of ['Size', 'Opacity', 'Hardness']) {
    await expect(page.getByRole('slider', { name, exact: true })).toHaveCount(0)
  }
  await page.getByRole('radiogroup', { name: 'Tools' }).getByRole('radio', { name: 'Text' }).click()
  await page.getByPlaceholder('Your text').fill('HI')
  await page.getByPlaceholder('Your text').press('Enter')
  await expectSaved({ page })
  await expect(page.getByRole('slider', { name: 'Rotate', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Position X, percent of panel' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mirror to other side' })).toHaveCount(0)
  const history = page.getByRole('complementary', { name: 'Version history' })
  await history.getByRole('button', { name: 'Show' }).click()
  await expect(history.getByRole('button', { name: 'Save checkpoint' })).toHaveCount(0)

  // Pro adds them, and switching changes only what is shown.
  const before = await savedSeq({ page })
  const pro = page.getByRole('switch', { name: 'Pro tools' })
  await pro.click()
  await expect(pro).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('textbox', { name: 'Position X, percent of panel' })).toBeVisible()
  await expect(history.getByRole('button', { name: 'Save checkpoint' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Hint' })).toHaveCount(0)
  await page.getByRole('radiogroup', { name: 'Tools' }).getByRole('radio', { name: 'Draw' }).click()
  await expect(page.getByRole('slider', { name: 'Hardness', exact: true })).toBeVisible()

  // Remembered on this device; still the same saved design.
  await page.reload()
  await expectSaved({ page })
  await expect(page.getByRole('switch', { name: 'Pro tools' })).toHaveAttribute('aria-checked', 'true')
  expect(await savedSeq({ page })).toBe(before)
})
