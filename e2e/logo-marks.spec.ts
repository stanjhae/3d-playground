import { writeFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { chooseTool, deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** The Logos category: its marks list, search finds them, and one lands on the 3D tee. */

const emails: string[] = []
const STAGE = 'canvas[aria-describedby="studio-scene-description"]'

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('the Logos category lists the marks, search finds a crest, and it prints on the tee', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'logos' })
  emails.push(email)
  await signIn({ page, email, pro: true })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await chooseTool({ page, tool: 'Graphics' })
  await page.getByRole('group', { name: 'Graphic categories' }).getByRole('button', { name: 'Logos' }).click()
  await expect(page.locator('[data-graphic-tile^="mark-"]')).toHaveCount(28)

  await page.getByRole('searchbox', { name: 'Search graphics' }).fill('crest')
  const tile = page.locator('[data-graphic-tile="mark-crest-star"]')
  await expect(tile).toBeVisible()
  const stage = page.locator(STAGE)
  const before = await stage.screenshot()
  await tile.click()

  // The studio says where it went, and the 3D tee redraws with it.
  await expect(page.getByRole('status').filter({ hasText: 'Star Crest added to the front' })).toBeVisible()
  await expect.poll(async () => Buffer.compare(await stage.screenshot(), before), { timeout: 20_000 }).not.toBe(0)
  const shot = await stage.screenshot()
  await testInfo.attach('logo-on-tee', { body: shot, contentType: 'image/png' })
  if (process.env.LOGO_EVIDENCE) writeFileSync(process.env.LOGO_EVIDENCE, shot)
})
