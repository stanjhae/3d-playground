import { expect, test } from '@playwright/test'

import { HOUSE_COPY } from '../src/lib/house-copy'
import { chooseTool, deleteAccounts, expectSaved, newEmail, signIn, graphicTile, openLayerMenu } from './helpers'

/**
 * Tester pass 3, the Layers panel: a library graphic is named for itself,
 * the eye says what a press does, a name takes no emoji, and "Fill this
 * side" goes under what is already there.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('layers are named, shown, renamed and filled under as the tester expects', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'layers3' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await chooseTool({ page, tool: 'Graphics' })
  await graphicTile({ page, label: 'Rising Flame' }).click()

  const rail = page.getByRole('complementary', { name: HOUSE_COPY.onTheCloth })
  const rows = rail.locator('[data-layer-panel="front"] [data-layer-control="select"]')
  await expect(rows).toHaveText(['Rising Flame'])

  // The eye: "Hide" while it shows, "Show" while hidden.
  await rail.getByRole('button', { name: 'Hide Rising Flame', exact: true }).click()
  const show = rail.getByRole('button', { name: 'Show Rising Flame', exact: true })
  await expect(show).toHaveAttribute('title', 'Show Rising Flame')
  await show.click()
  await expect(rail.getByRole('button', { name: 'Hide Rising Flame', exact: true })).toBeVisible()

  // Rename: emoji are refused in plain words, the field stays to fix it.
  await openLayerMenu({ rail, name: 'Rising Flame' })
  await page.getByRole('button', { name: 'Rename Rising Flame' }).click()
  const field = rail.getByRole('textbox', { name: 'New name for Rising Flame' })
  await field.fill('Fire \u{1F525}')
  await field.press('Enter')
  await expect(rail.getByTestId('rename-error')).toHaveText("Emoji can't be used in a layer name. Remove it.")
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await field.fill('Fire')
  await field.press('Enter')
  await expect(rows).toHaveText(['Fire'])
  await expect(rail.getByTestId('rename-error')).toHaveCount(0)

  // Stripes on this side go under the graphic, not over it.
  const patterns = page.getByRole('group', { name: 'Patterns' })
  await patterns.getByRole('button', { name: 'Fill this side' }).click()
  await expect(rows).toHaveText(['Fire', 'Stripe fill'])
})
