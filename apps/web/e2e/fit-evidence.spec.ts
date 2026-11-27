import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Try-on fit evidence, not a check: puts the tee on each figure and saves a
 * picture to `../../docs/evidence/fit-<figure>-<FIT_EVIDENCE>.png`. Off unless
 * `FIT_EVIDENCE` is set (`before` or `after`); the fit itself is checked
 * in `avatars.test.ts`.
 *
 *   FIT_EVIDENCE=after pnpm e2e --project=chromium fit-evidence
 */

const LABEL = process.env.FIT_EVIDENCE
const FIGURES = [
  { label: 'Tall · Male', file: 'tall-male' },
  { label: 'Tall · Female', file: 'tall-female' },
  { label: 'House', file: 'house' },
  { label: 'Soft · Female', file: 'soft-female' },
]

const emails: string[] = []

test.skip(!LABEL, 'evidence only: set FIT_EVIDENCE=before|after')

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function shot({ page, file, view }: { page: Page; file: string; view: string }) {
  await page.getByRole('radiogroup', { name: 'Camera' }).getByRole('radio', { name: view, exact: true }).click()
  await page.waitForTimeout(2_500)
  await expect(page.getByRole('status').filter({ hasText: /still loading/ })).toHaveCount(0, { timeout: 20_000 })
  const box = (await page.locator('canvas[data-engine]').boundingBox())!
  const clip = { x: box.x + box.width * 0.25, y: box.y, width: box.width * 0.5, height: box.height - 96 }
  await page.screenshot({ clip, path: `../../docs/evidence/fit-${file}-${LABEL}.png` })
}

test('the tee on each figure', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'fit-evidence' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const url = new URL(page.url())
  url.searchParams.set('step', 'share')
  await page.goto(url.toString())
  await expectSaved({ page })

  for (const figure of FIGURES) {
    await page.getByRole('button', { name: figure.label, exact: true }).click()
    await expect(page.getByRole('button', { name: figure.label, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await shot({ page, file: figure.file, view: '3/4' })
  }
})
