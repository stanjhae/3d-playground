import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, panelCanvas, signIn, chooseTool } from './helpers'

/**
 * Numeric transform fields in the Tech inspector (#156): typing commits on
 * Enter or leaving the box, arrows step, refused input keeps a message,
 * Escape restores, and each commit is one undo step, like a drag.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('typed, stepped and dragged placement are one undo step each', async ({ page }) => {
  const email = newEmail({ label: 'transform' })
  emails.push(email)
  await signIn({ page, email })

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Text' })
  await page.getByPlaceholder('Your text').fill('NUM')
  await page.getByPlaceholder('Your text').press('Enter')

  const x = page.getByRole('textbox', { name: 'Position X, percent of panel' })
  const y = page.getByRole('textbox', { name: 'Position Y, percent of panel' })
  const xSlider = page.getByRole('slider', { name: 'Position X', exact: true })
  await expect(x).toHaveValue('50')
  await expect(page.getByRole('textbox', { name: 'Size, percent' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Rotate, degrees' })).toHaveValue('0')

  // Enter commits, and the slider follows.
  await x.fill('70')
  await x.press('Enter')
  await expect(xSlider).toHaveValue('0.7')

  // Out of range is refused with a message, not clamped; Escape restores.
  const startY = await y.inputValue()
  await y.fill('150')
  await y.press('Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'Use 0 to 100%.' })).toBeVisible()
  await expect(y).toHaveAttribute('aria-invalid', 'true')
  await y.press('Escape')
  await expect(y).toHaveValue(startY)
  await expect(page.getByRole('alert').filter({ hasText: 'Use 0 to 100%.' })).toHaveCount(0)

  // Arrows step by one, Shift by ten.
  await y.press('ArrowUp')
  await expect(y).toHaveValue(String(Number(startY) + 1))
  await y.press('Shift+ArrowUp')
  await expect(y).toHaveValue(String(Number(startY) + 11))

  // Leaving the box commits.
  await x.fill('64')
  await x.press('Tab')
  await expect(xSlider).toHaveValue('0.64')

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('aside:has(input[aria-label="Position X, percent of panel"])')
    .analyze()
  expect(
    results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([])

  // Each commit undoes in one step.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('ControlOrMeta+z')
  await expect(x).toHaveValue('70')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(y).toHaveValue(String(Number(startY) + 1))
  await page.keyboard.press('ControlOrMeta+z')
  await expect(y).toHaveValue(startY)

  // A drag on the panel is one step too, and the fields follow it.
  const front = await panelCanvas({ page, panel: 'Front' }).boundingBox()
  const from = { x: front!.x + front!.width * 0.7, y: front!.y + front!.height * (1 - Number(startY) / 100) }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - front!.width * 0.2, from.y - front!.height * 0.1, { steps: 8 })
  await page.mouse.up()
  await expect(x).not.toHaveValue('70')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(x).toHaveValue('70')
  await expect(y).toHaveValue(startY)
})
