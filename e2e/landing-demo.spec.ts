import { expect, test, type Page } from '@playwright/test'

import { LANDING_HANDOFF_KEY } from '../src/lib/landing-handoff'

/**
 * The landing demo after the founder's feedback (17 Nov): ink reaches the
 * whole tee (the hem, the sleeves), a logo stays editable once it's down
 * (pick, move, resize, remove), and a drag turns the tee after a side was
 * picked. Desktop only: on touch the page scrolls over the tee.
 */

type HandoffLayer = {
  id: string
  kind: string
  panel?: string
  src?: string
  x?: number
  y?: number
  scale?: number
  strokes?: Array<{ panel: string; points: Array<{ x: number; y: number }> }>
}

async function openHero(page: Page) {
  await page.goto('/')
  const dock = page.locator('[data-hero-dock]')
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 60_000 })
  await dock.getByRole('button', { name: 'Front', exact: true }).click()
  const stage = page.locator('[data-engine="landing"]')

  /** A point on the stage, by its share across and down, with the whole tee in view (a dock click may have scrolled). */
  async function at(x: number, y: number) {
    const top = await stage.evaluate((element) => element.getBoundingClientRect().top)

    if (Math.abs(top - 90) > 1) {
      // Under the sticky header.
      await stage.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - 90))
      await page.waitForTimeout(300)
    }

    const box = (await stage.boundingBox())!
    return { x: box.x + box.width * x, y: box.y + box.height * y }
  }

  return { dock, stage, at }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()

  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / 12, from.y + ((to.y - from.y) * step) / 12)
  }

  await page.mouse.up()
}

/** Start creating hands the sketch over; read it as the studio will. */
async function handoffLayers(page: Page) {
  await page.getByRole('link', { name: 'Start creating' }).first().click()
  const handoff = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'), LANDING_HANDOFF_KEY)
  return handoff.document.layers as HandoffLayer[]
}

const crowns = (layers: HandoffLayer[]) => layers.filter((layer) => layer.kind === 'graphic' && layer.src?.endsWith('logo-crown.svg'))

test('ink reaches the hem on the tee and the whole sleeve on the pad', async ({ page }) => {
  const { dock, at } = await openHero(page)

  // Draw straight on the 3D tee, from mid-front down past the hem.
  await dock.getByRole('button', { name: 'Draw', exact: true }).click()
  await expect(page.locator('[data-drag-hint]')).toBeHidden()
  await drag(page, await at(0.5, 0.6), await at(0.5, 0.88))

  // A sleeve on the pad: the pad is the sleeve's shape, top to bottom.
  await dock.getByRole('button', { name: 'Left', exact: true }).click()
  await expect(dock).toContainText('It lands on the left sleeve.')
  const pad = dock.locator('canvas')
  const padBox = (await pad.boundingBox())!
  await drag(
    page,
    { x: padBox.x + padBox.width * 0.5, y: padBox.y + 2 },
    { x: padBox.x + padBox.width * 0.5, y: padBox.y + padBox.height - 2 },
  )

  const layers = await handoffLayers(page)
  const strokes = layers.filter((layer) => layer.kind === 'paint').flatMap((layer) => layer.strokes ?? [])
  const front = strokes.filter((stroke) => stroke.panel === 'front' && stroke.points.length > 1)
  // The tee's hem (panel y runs up from it): well outside the band the old
  // wide pad was squeezed into (0.37–0.63).
  expect(front.length).toBeGreaterThan(0)
  expect(Math.min(...front.flatMap((stroke) => stroke.points.map((point) => point.y)))).toBeLessThan(0.2)

  // The wearer's left sleeve is panel `right` (landing-sides.spec.ts).
  const sleeve = strokes.find((stroke) => stroke.panel === 'right')
  expect(sleeve).toBeTruthy()
  const ys = sleeve!.points.map((point) => point.y)
  expect(Math.min(...ys)).toBeLessThan(0.2)
  expect(Math.max(...ys)).toBeGreaterThan(0.8)
})

test('a logo on the tee can be picked again, moved and resized', async ({ page }) => {
  const { dock, at } = await openHero(page)
  const selected = dock.locator('[data-logo-selected]')

  // A new logo comes in picked.
  await dock.getByRole('button', { name: 'Add Crown' }).click()
  await expect(selected).toContainText('Logo selected')
  await page.keyboard.press('Escape')
  await expect(selected).toBeHidden()

  // Pick it on the tee: the side stays held (the orbit stood down).
  const crown = await at(0.485, 0.56)
  await page.mouse.click(crown.x, crown.y)
  await expect(selected).toContainText('Logo selected')
  await expect(dock.getByRole('button', { name: 'Front', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Drag it to the wearer's left, then make it larger.
  await drag(page, await at(0.485, 0.56), await at(0.585, 0.62))
  await expect(selected).toBeVisible()
  await selected.getByRole('button', { name: 'Larger' }).click()

  // A tap off the tee lets go of it.
  const off = await at(0.06, 0.94)
  await page.mouse.click(off.x, off.y)
  await expect(selected).toBeHidden()

  const [layer] = crowns(await handoffLayers(page)).filter((entry) => entry.id.startsWith('mark-'))
  expect(layer).toBeTruthy()
  expect(layer!.panel).toBe('front')
  // Stamped at 0.5, 0.48 and 0.28 across.
  expect(Math.abs(layer!.x! - 0.5) + Math.abs(layer!.y! - 0.48)).toBeGreaterThan(0.05)
  expect(layer!.scale).toBeCloseTo(0.35, 5)
})

test('a picked logo is removed with the chip or the Delete key', async ({ page }) => {
  const { dock } = await openHero(page)
  const selected = dock.locator('[data-logo-selected]')

  await dock.getByRole('button', { name: 'Add Crown' }).click()
  await selected.getByRole('button', { name: 'Remove' }).click()
  await expect(selected).toBeHidden()

  await dock.getByRole('button', { name: 'Back', exact: true }).click()
  await dock.getByRole('button', { name: 'Add Crown' }).click()
  await expect(selected).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(selected).toBeHidden()

  // Something else drawn, so the sketch is handed over at all.
  await dock.getByRole('button', { name: 'Add Rising Flame' }).click()
  const layers = await handoffLayers(page)
  // The demo's own crown on the back stays; both stamped ones went.
  expect(crowns(layers).filter((layer) => layer.id.startsWith('mark-'))).toHaveLength(0)
  expect(layers.some((layer) => layer.kind === 'graphic' && layer.src?.endsWith('flame-rise.svg'))).toBe(true)
})

test('a drag turns the tee after a side was picked', async ({ page }) => {
  const { dock, stage, at } = await openHero(page)
  const canvas = stage.locator('canvas')
  const back = dock.getByRole('button', { name: 'Back', exact: true })

  await back.click()
  await expect(page.locator('[data-drag-hint]')).toBeHidden()
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-camera-azimuth')))).toBeGreaterThan(2.8)
  const before = Number(await canvas.getAttribute('data-camera-azimuth'))

  await drag(page, await at(0.3, 0.5), await at(0.65, 0.5))

  await expect(back).toHaveAttribute('aria-pressed', 'false')
  await expect
    .poll(async () => {
      const after = Number(await canvas.getAttribute('data-camera-azimuth'))
      // The shorter way round, across ±π.
      return Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)))
    })
    .toBeGreaterThan(0.3)
})
