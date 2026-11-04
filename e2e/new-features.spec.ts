import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** The description field, off-panel warning, tool hints and example design. */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function openDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
}

test('the description takes up to 500 characters, says how many, and is there after a reload', async ({ page }) => {
  await openDesign({ page, label: 'describe' })
  await page.getByRole('button', { name: 'Add a description' }).click()
  const box = page.getByRole('textbox', { name: 'Design description' })
  const saved = page.waitForResponse((response) => response.request().method() === 'PATCH')
  await box.fill('x'.repeat(600))
  await expect(box).toHaveValue('x'.repeat(500))
  await expect(page.getByText(/^500 of 500/)).toBeVisible()
  await box.blur()
  expect((await saved).status()).toBe(200)

  await page.reload()
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Description', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Design description' })).toHaveValue('x'.repeat(500))
})

test('a layer mostly off its panel gets a note, which goes when it moves back', async ({ page }) => {
  await openDesign({ page, label: 'offpanel' })
  await page.getByRole('radio', { name: 'Tech' }).click()
  await page.getByRole('button', { name: 'Simple Cross' }).click()
  const note = page.getByText('Most of this is outside its panel')
  await expect(note).toHaveCount(0)

  const x = page.getByRole('textbox', { name: 'Place X, percent of panel' })
  const y = page.getByRole('textbox', { name: 'Place Y, percent of panel' })
  await x.fill('0')
  await x.press('Enter')
  await y.fill('0')
  await y.press('Enter')
  await expect(note).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'On the cloth' }).getByRole('button', { name: /Simple Cross|Mark|Graphic/ }).first()).toBeVisible()

  await x.fill('50')
  await x.press('Enter')
  await y.fill('50')
  await y.press('Enter')
  await expect(note).toHaveCount(0)
})

test('hints come one at a time, stay out of the way, and stay dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openDesign({ page, label: 'hints' })
  const hint = page.getByRole('complementary', { name: 'Hint' })
  await expect(hint).toContainText('Pick a side')

  // In the tools rail, clear of the panels, the garment and the step buttons.
  const box = (await hint.boundingBox())!
  for (const locator of [
    page.locator('canvas[aria-label^="Design panel Front"]'),
    page.locator('canvas[data-engine]'),
    page.getByRole('button', { name: 'Continue' }),
  ]) {
    const other = (await locator.boundingBox())!
    const overlaps = box.x < other.x + other.width && other.x < box.x + box.width && box.y < other.y + other.height && other.y < box.y + box.height
    expect(overlaps).toBe(false)
  }

  // By keyboard.
  await hint.getByRole('button', { name: 'Got it' }).focus()
  await page.keyboard.press('Enter')
  await expect(hint).toContainText('Draw')
  await page.reload()
  await expectSaved({ page })
  await expect(hint).toContainText('Draw')

  await hint.getByRole('button', { name: 'Hide all hints' }).click()
  await expect(hint).toHaveCount(0)
  await page.reload()
  await expectSaved({ page })
  await expect(hint).toHaveCount(0)
})

test('the example opens as a private copy, and changing one copy leaves another alone', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'example' })
  emails.push(email)
  await signIn({ page, email })

  const open = async () => {
    await page.goto('/studio')
    await page.getByRole('button', { name: 'Start from an example' }).click()
    await expect(page).toHaveURL(/\/create\?/)
    await expectSaved({ page })
    return new URL(page.url()).searchParams.get('cloud')!
  }
  const details = (id: string) =>
    page.evaluate(async (designId) => {
      const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
      const response = await fetch(`/api/flp/designs/${designId}`, { headers: { Authorization: `Bearer ${token}` } })
      return response.json()
    }, id)

  const first = await open()
  const second = await open()
  expect(first).not.toBe(second)
  const before = await details(first)
  expect(before).toMatchObject({ title: 'Example design', visibility: 'private' })

  await page.getByPlaceholder('Type').fill('MINE')
  await page.getByPlaceholder('Type').press('Enter')
  await expect.poll(async () => (await details(second)).headSeq, { timeout: 20_000 }).toBeGreaterThan(1)
  expect((await details(first)).head.content).toEqual(before.head.content)
})
