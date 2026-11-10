import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, publishWithPlaceholders, signIn, visualMasks } from './helpers'

/**
 * Visual baselines (Q2) for the studio chrome and the public share page.
 * The 3D view and paint panels are masked (software WebGL never draws the
 * same pixels twice), as is anything that names the random test account.
 * Baselines live in e2e/__screenshots__/<platform>/; CI compares Linux.
 * Update with `--update-snapshots` (see docs/e2e.md).
 */

// A deployment may differ on purpose (banner, data); baselines are for the local build.
test.skip(Boolean(process.env.E2E_BASE_URL), 'baselines are for the local build')

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const shot = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } as const

test('studio chrome and share page match their baselines', async ({ page, browser }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'visual' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  const title = page.getByRole('textbox', { name: 'Design name' })
  await title.fill('Visual tee')
  await title.press('Enter')
  await expectSaved({ page })
  await expect(page.getByRole('img', { name: '3D preview' })).toBeAttached({ timeout: 30_000 })
  // Let the save status and focus settle before the picture.
  await page.locator('body').click({ position: { x: 1, y: 1 } })

  const account = page.getByText(email, { exact: true })
  await expect(page).toHaveScreenshot('studio-chrome.png', { ...shot, mask: [...(await visualMasks({ page })), account] })

  const slug = await publishWithPlaceholders({ page })
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const share = await visitor.newPage()
  await share.goto(`/s/${slug}`)
  await expect(share.getByRole('heading', { name: 'Visual tee' })).toBeVisible()
  await expect(share.getByRole('img')).toHaveCount(5)
  // The vote count loads after the page (V1); wait so the picture is stable.
  await expect(share.getByTestId('vote-count')).toHaveText('0 votes')
  // The publish date changes every day.
  const published = share.getByText(/published \d/)
  await expect(share).toHaveScreenshot('share-page.png', { ...shot, fullPage: true, mask: [...(await visualMasks({ page: share })), published] })
  await visitor.close()
})
