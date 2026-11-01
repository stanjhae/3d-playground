import { expect, test } from '@playwright/test'

import {
  deleteAccounts,
  drawStroke,
  expectNoCspViolations,
  expectSaved,
  newEmail,
  panelCanvas,
  signIn,
  watchCsp,
} from './helpers'

/**
 * The alpha journey end to end (Q04 #189): sign in, create, edit, save,
 * reload, rename, checkpoint and restore, publish, view signed out,
 * unpublish, delete. Every page runs under the enforced CSP and the
 * journey fails on any violation (Q02 #187).
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('create → edit → save → publish → view signed out → unpublish → delete', async ({ page, context, browser }) => {
  // CI runners render WebGL in software, so capturing the three views of a
  // drawn design takes far longer than on a laptop.
  test.setTimeout(240_000)
  const violations = await watchCsp({ context })
  const email = newEmail({ label: 'journey' })
  emails.push(email)
  await signIn({ page, email })

  // Create a tee from My Studio.
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  const designId = new URL(page.url()).searchParams.get('cloud')!
  await expect(panelCanvas({ page, panel: 'Front' })).toBeVisible()

  // Draw on the front, type on the back.
  await drawStroke({ page, panel: 'Front' })
  await page.getByPlaceholder('Type').fill('E2E')
  await page.getByRole('button', { name: 'Type', exact: true }).click()
  const back = await panelCanvas({ page, panel: 'Back' }).boundingBox()
  await page.mouse.click(back!.x + back!.width / 2, back!.y + back!.height / 3)
  await expectSaved({ page })

  // A reload brings the same design back from the cloud.
  await page.reload()
  await expectSaved({ page })
  await expect(page.getByText('E2E', { exact: true }).first()).toBeVisible()

  // Rename in place.
  const title = page.getByRole('textbox', { name: 'Design name' })
  await title.fill('E2E tee')
  await title.press('Enter')

  // Named checkpoint, another edit, then restore the checkpoint.
  const history = page.getByRole('complementary', { name: 'Version history' })
  await history.getByRole('button', { name: 'Show' }).click()
  await history.getByRole('button', { name: 'Save checkpoint' }).click()
  await page.getByLabel('Checkpoint name').fill('Before restore')
  await history.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(history.getByText('Before restore')).toBeVisible()
  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })
  const checkpoint = history.getByRole('listitem').filter({ hasText: 'Before restore' })
  await checkpoint.getByRole('button', { name: 'Restore', exact: true }).click()
  await history.getByRole('dialog', { name: /^Restore version/ }).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(history.getByRole('listitem').first()).toContainText(/restore/i)
  await expectSaved({ page })

  // Publish the saved version.
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })
  const shareUrl = (await link.getAttribute('href'))!
  const slug = shareUrl.split('/s/')[1]!

  // A signed-out visitor sees the views and nothing private.
  const visitor = await browser.newContext()
  await watchCsp({ context: visitor, violations })
  const anonymous = await visitor.newPage()
  // The share page embeds the public payload in its HTML (#182); read it
  // as a visitor receives it, and check the whole page leaks nothing.
  const pageHtml = await (await anonymous.request.get(`/s/${slug}`)).text()
  const embedded = pageHtml.match(/<script type="application\/json" id="flp-public">([\s\S]*?)<\/script>/)?.[1]
  expect(embedded, 'embedded public payload').toBeTruthy()
  const payload = JSON.parse(embedded!)
  expect(pageHtml).not.toContain(designId)
  expect(pageHtml).not.toContain(email)
  expect(pageHtml).toContain(`rel="preload" as="image" href="${payload.renders.view_front}"`)
  await anonymous.goto(`/s/${slug}`)
  await expect(anonymous.getByRole('heading', { name: 'E2E tee' })).toBeVisible()
  await expect(anonymous.getByRole('img')).toHaveCount(3)
  await expect(anonymous.getByText('Creator-supplied preview, not a certified fit or manufacturing render.')).toBeVisible()
  const image = await anonymous.request.get(payload.renders.view_front)
  expect(image.headers()['cache-control']).toBe('no-store')
  expect(Object.keys(payload).sort()).toEqual(['displayName', 'publishedAt', 'renders', 'seq', 'slug', 'title'])
  expect(JSON.stringify(payload)).not.toContain(designId)
  expect(JSON.stringify(payload)).not.toContain(email)

  // Unpublish: the public page is gone at once.
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('button', { name: 'Publish…' })).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'This design is not available' })).toBeVisible()

  // Delete from My Studio; the link stays gone.
  await page.goto('/studio')
  const card = page.getByRole('listitem').filter({ hasText: 'E2E tee' })
  await card.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete design' }).click()
  await expect(page.getByText('No designs yet.')).toBeVisible()
  await anonymous.reload()
  await expect(anonymous.getByRole('heading', { name: 'This design is not available' })).toBeVisible()
  await visitor.close()
  expectNoCspViolations({ violations })
})
