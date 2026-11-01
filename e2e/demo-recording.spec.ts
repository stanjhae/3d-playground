import { fileURLToPath } from 'node:url'

import { type Page, expect, test } from '@playwright/test'

import { drawStroke, expectSaved, latestCode, panelCanvas } from './helpers'

/**
 * Recorded fallback for the 17 Nov demo (#201). Plays docs/demo.md's
 * five-minute script against the preview build, slowly enough to watch,
 * and saves the video as `demo-fallback.webm` in the repo root (ignored
 * by git). Runs only on request, after `node scripts/demo-reset.mjs`:
 *
 *   RECORD=1 E2E_BASE_URL=http://localhost:4173 pnpm e2e demo-recording
 */

const EMAIL = 'demo@example.test'
const SIZE = { width: 1440, height: 900 }
const OUTPUT = fileURLToPath(new URL('../demo-fallback.webm', import.meta.url))

test.skip(!process.env.RECORD, 'Set RECORD=1 to record the demo fallback video')
test.use({ viewport: SIZE, video: { mode: 'on', size: SIZE } })

/** A pause so a viewer can follow what just happened. */
function beat({ page, ms = 1_200 }: { page: Page; ms?: number }) {
  return page.waitForTimeout(ms)
}

test('demo fallback recording', async ({ page }) => {
  test.setTimeout(300_000)

  // Sign in with the code from Mailpit.
  await page.goto('/sign-in?returnTo=%2Fstudio')
  await beat({ page })
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).pressSequentially(EMAIL, { delay: 60 })
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email: EMAIL, after: requested })
  await beat({ page })
  await page.getByRole('textbox', { name: '6-digit code' }).pressSequentially(code, { delay: 120 })
  await page.getByRole('button', { name: 'Sign in' }).click()

  // My Studio → the draft.
  await expect(page).toHaveURL(/\/studio$/)
  await expect(page.getByRole('link', { name: 'Studio draft' })).toBeVisible()
  await beat({ page, ms: 2_500 })
  await page.getByRole('link', { name: 'Studio draft' }).click()
  await expect(panelCanvas({ page, panel: 'Front' })).toBeVisible()
  await expectSaved({ page })
  await beat({ page, ms: 2_500 })

  // Draw on the front, type on the back, mark a sleeve.
  await drawStroke({ page, panel: 'Front' })
  await beat({ page })
  await page.getByPlaceholder('Type').pressSequentially('HELLO', { delay: 100 })
  await page.getByRole('button', { name: 'Type', exact: true }).click()
  const back = await panelCanvas({ page, panel: 'Back' }).boundingBox()
  await page.mouse.click(back!.x + back!.width / 2, back!.y + back!.height / 4)
  await beat({ page })
  await page.getByRole('button', { name: 'Brush', exact: true }).click()
  await drawStroke({ page, panel: "Wearer's right" })
  await expectSaved({ page })
  await beat({ page, ms: 2_500 })

  // A named checkpoint, then restore the seeded "First pass".
  const history = page.getByRole('complementary', { name: 'Version history' })
  await history.getByRole('button', { name: 'Show' }).click()
  await beat({ page })
  await history.getByRole('button', { name: 'Save checkpoint' }).click()
  await page.getByLabel('Checkpoint name').pressSequentially('Live demo', { delay: 80 })
  await history.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(history.getByText('Live demo')).toBeVisible()
  await beat({ page, ms: 2_000 })
  const firstPass = history.getByRole('listitem').filter({ hasText: 'First pass' })
  await firstPass.scrollIntoViewIfNeeded()
  await beat({ page })
  await firstPass.getByRole('button', { name: 'Restore', exact: true }).click()
  await beat({ page })
  await history.getByRole('dialog', { name: /^Restore version/ }).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(history.getByRole('listitem').first()).toContainText(/restore/i)
  await expectSaved({ page })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await beat({ page, ms: 2_500 })

  // Publish the restored version.
  await page.getByRole('button', { name: /^6\s*Publish$/ }).click()
  await expect(page).toHaveURL(/step=share/)
  await expectSaved({ page })
  await beat({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await beat({ page })
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })
  await beat({ page, ms: 2_500 })
  const shareUrl = (await link.getAttribute('href'))!
  const studioUrl = page.url()

  // The public page. One tab keeps the recording in one file; the page is
  // the same signed in or out.
  await page.goto(shareUrl)
  await expect(page.getByRole('heading', { name: 'Studio draft' })).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(3)
  await beat({ page, ms: 4_000 })

  // Unpublish: the link is gone at once.
  await page.goto(studioUrl)
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()
  await beat({ page })
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('button', { name: 'Publish…' })).toBeVisible()
  await beat({ page, ms: 2_000 })
  await page.goto(shareUrl)
  await expect(page.getByRole('heading', { name: 'This design is not available' })).toBeVisible()
  await beat({ page, ms: 3_000 })

  await page.close()
  await page.video()!.saveAs(OUTPUT)
})
