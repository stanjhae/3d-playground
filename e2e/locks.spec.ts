import { type Page, expect, test } from '@playwright/test'

import { HOUSE_COPY } from '../src/lib/house-copy'
import { chooseTool, deleteAccounts, expectSaved, newEmail, openLayerMenu, panelCanvas, savedStrokes, signIn } from './helpers'

/**
 * Locks (W3): an item locked from the layer list can't be dragged on the
 * panel (a press selects it and says why), its edit controls say why they
 * are off, and unlocking it from the list gives it back.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const WORD = 'FLP'

/** The word's place on the front panel, in percent, from the inspector's own fields. */
async function wordSpot({ page }: { page: Page }) {
  const x = Number(await page.getByRole('textbox', { name: 'Position X, percent of panel' }).inputValue())
  const y = Number(await page.getByRole('textbox', { name: 'Position Y, percent of panel' }).inputValue())
  return { x, y }
}

/**
 * That place on screen, measured when it's used: locking adds a line to the
 * rail, which can move the panel, and a stale point would miss the word.
 */
async function screenPoint({ page, spot }: { page: Page; spot: { x: number; y: number } }) {
  const box = (await panelCanvas({ page, panel: 'Front' }).boundingBox())!
  // Panel y runs bottom-up.
  return { x: box.x + (box.width * spot.x) / 100, y: box.y + (box.height * (100 - spot.y)) / 100 }
}

test('a locked word is not picked on the panel until it is unlocked', async ({ page }) => {
  const email = newEmail({ label: 'locks' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await chooseTool({ page, tool: 'Text' })
  await page.getByPlaceholder('Your text').fill(WORD)
  await page.getByPlaceholder('Your text').press('Enter')

  const rail = page.getByRole('complementary', { name: HOUSE_COPY.onTheCloth })
  // Its name says ", locked" while it is.
  const select = rail.getByRole('button', { name: new RegExp(`^${WORD}( ?, locked)?$`) })
  const lock = rail.getByRole('button', { name: `Lock ${WORD}`, exact: true })
  const positionX = page.getByRole('textbox', { name: 'Position X, percent of panel' })
  await expect(select).toHaveAttribute('aria-current', 'true')
  const spot = await wordSpot({ page })
  // Reorder, duplicate and rename are in the row's More menu.
  await openLayerMenu({ rail, name: WORD })
  for (const action of [`Move ${WORD} to the front`, `Move ${WORD} to the back`, `Duplicate ${WORD}`, `Rename ${WORD}`]) {
    await expect(page.getByTestId('layer-row-menu').getByRole('button', { name: action, exact: true })).toBeVisible()
  }

  // Lock it from the list: its edit controls go off and say why.
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await openLayerMenu({ rail, name: WORD })
  await expect(page.getByRole('button', { name: `Delete ${WORD}`, exact: true })).toHaveAttribute('aria-disabled', 'true')
  await expect(rail.getByText('Locked. Unlock to edit.')).toBeVisible()
  await expect(select).toHaveAccessibleName(/, locked$/)
  await expect(positionX).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Left to right' })).toBeDisabled()
  await expect(page.getByRole('button', { name: `Rename ${WORD}`, exact: true })).toHaveAttribute('aria-disabled', 'true')

  // Hiding is about the view, so it works while locked, and it stays locked.
  // The eye's name says what a press does (tester pass 3).
  await rail.getByRole('button', { name: `Hide ${WORD}`, exact: true }).click()
  const show = rail.getByRole('button', { name: `Show ${WORD}`, exact: true })
  await expect(show).toHaveAttribute('title', `Show ${WORD}`)
  await expect(show).not.toHaveAttribute('aria-pressed')
  await expect(rail.getByRole('button', { name: new RegExp(`^${WORD} ?, hidden ?, locked$`) })).toBeVisible()
  await show.click()
  await expect(rail.getByRole('button', { name: `Hide ${WORD}`, exact: true })).toBeVisible()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')

  // Nudge keys and Delete leave it where it is.
  await page.keyboard.press('Escape')
  await select.click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Delete')
  await expect(select).toBeVisible()
  await expect(positionX).toHaveValue('50')

  // A real drag that starts on the word moves nothing and, even with the
  // brush, draws nothing: it selects the word and says why it stays put.
  await chooseTool({ page, tool: 'Draw' })
  await page.keyboard.press('Escape')
  await expect(select).not.toHaveAttribute('aria-current', 'true')
  let point = await screenPoint({ page, spot })
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 40, point.y + 20, { steps: 8 })
  await page.mouse.up()
  await expect(select).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('[data-studio-notice]')).toHaveText('Locked: unlock in Layers to move')
  await expect(positionX).toHaveValue('50')
  expect(await savedStrokes({ page })).toEqual([])
  await page.keyboard.press('Escape')
  await expect(select).not.toHaveAttribute('aria-current', 'true')

  // The list still selects it, so it can be unlocked; then the panel picks it again.
  await chooseTool({ page, tool: 'Text' })
  await select.click()
  await expect(select).toHaveAttribute('aria-current', 'true')
  await expect(positionX).toHaveValue('50')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  await expect(positionX).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(select).not.toHaveAttribute('aria-current', 'true')

  point = await screenPoint({ page, spot })
  await page.mouse.click(point.x, point.y)
  await expect(select).toHaveAttribute('aria-current', 'true')
})
