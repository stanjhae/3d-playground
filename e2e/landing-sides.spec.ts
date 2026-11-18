import { expect, test } from '@playwright/test'

import { LANDING_HANDOFF_KEY } from '../src/lib/landing-handoff'

/**
 * The landing demo draws on the side it shows (founder review, 16 Nov):
 * pick Back and the ink lands on the back; pick Left and a graphic lands
 * on the wearer's left sleeve (render panel `right`); the caption follows.
 */

test('the hero draws and drops on the side it shows', async ({ page }) => {
  await page.goto('/')
  const dock = page.locator('[data-hero-dock]')
  const pad = dock.getByRole('img', { name: /Sketch pad/ }).or(dock.locator('canvas')).first()
  await expect(pad).toBeVisible({ timeout: 30_000 })

  await dock.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(dock).toContainText('It lands on the back of the tee.')

  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
  await page.mouse.down()

  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + box.width * (0.2 + step * 0.06), box.y + box.height * 0.5)
  }

  await page.mouse.up()

  await dock.getByRole('button', { name: 'Left sleeve', exact: true }).click()
  await expect(dock).toContainText('It lands on the left sleeve.')
  await dock.getByRole('button', { name: 'Add Rising Flame' }).click()

  // Start creating hands the sketch over; read it as the studio will.
  await page.getByRole('link', { name: 'Start creating' }).first().click()
  const handoff = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'), LANDING_HANDOFF_KEY)
  const layers = handoff.document.layers as Array<{ kind: string; panel?: string; src?: string; strokes?: Array<{ panel: string }> }>
  const strokes = layers.filter((layer) => layer.kind === 'paint').flatMap((layer) => layer.strokes ?? [])

  expect(strokes.map((stroke) => stroke.panel)).toContain('back')
  expect(strokes.some((stroke) => stroke.panel === 'front')).toBe(false)
  expect(layers.some((layer) => layer.kind === 'graphic' && layer.panel === 'right' && layer.src?.endsWith('flame-rise.svg'))).toBe(true)
})
