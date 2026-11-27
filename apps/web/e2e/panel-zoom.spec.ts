import { readFile } from 'node:fs/promises'

import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Zoom and pan on the flat sides, and Download image (UX review, 26 Nov):
 * a stroke drawn zoomed in lands where it was drawn on the panel, a pan
 * draws nothing, and the PNGs are real files.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

/** Each saved front stroke's points, as panel x and y pairs. */
async function frontStrokes({ page }: { page: Page }) {
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const { head } = await response.json()
    type Layer = { kind: string; strokes?: { points: number[] }[] }

    return (head.content.panels.front.layers as Layer[])
      .filter((layer) => layer.kind === 'paint')
      .flatMap((layer) => layer.strokes ?? [])
      .map((stroke) => {
        const pairs: { x: number; y: number }[] = []

        for (let index = 0; index + 1 < stroke.points.length; index += 2) {
          pairs.push({ x: stroke.points[index]!, y: stroke.points[index + 1]! })
        }

        return pairs
      })
  }, designId)
}

test('zoomed in on a side, a stroke lands where it is drawn; Space + drag pans and draws nothing; Fit resets', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'panel-zoom' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })

  const frame = page.locator('[data-panel-frame="front"]')
  const zoom = page.getByRole('group', { name: 'Front zoom' })
  const readout = zoom.getByTestId('panel-zoom')
  await expect(readout).toHaveText('100%')

  // + twice, from the page: 150%, then 200%, about the panel's centre.
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('=')
  await expect(readout).toHaveText('150%')
  await zoom.getByRole('button', { name: 'Zoom in Front' }).click()
  await expect(readout).toHaveText('200%')

  // Across the middle 40% of the frame is the middle 20% of the panel at 2×.
  const box = (await frame.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await frontStrokes({ page })).length, { timeout: 30_000 }).toBe(1)
  const [stroke] = await frontStrokes({ page })
  const xs = stroke!.map((point) => point.x)
  expect(Math.min(...xs)).toBeCloseTo(0.4, 1)
  expect(Math.max(...xs)).toBeCloseTo(0.6, 1)
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.17)
  expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.23)
  for (const point of stroke!) {
    expect(point.y).toBeCloseTo(0.5, 1)
  }

  // Space + drag moves the view, not the pen.
  const canvas = page.locator('canvas[aria-label^="Design panel Front"]')
  const before = (await canvas.boundingBox())!
  await page.keyboard.down('Space')
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  const after = (await canvas.boundingBox())!
  expect(after.x - before.x).toBeGreaterThan(box.width * 0.15)
  expect(after.y - before.y).toBeGreaterThan(box.height * 0.05)

  // The middle button pans too.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 4 })
  await page.mouse.up({ button: 'middle' })
  expect((await canvas.boundingBox())!.x).toBeLessThan(after.x)

  // ⌘/Ctrl + wheel zooms where the pointer is.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -120)
  await page.keyboard.up('Control')
  await expect.poll(async () => Number.parseInt((await readout.textContent()) ?? '0', 10)).toBeGreaterThan(200)

  // Still one stroke: neither pan nor zoom drew.
  await page.waitForTimeout(600)
  expect(await frontStrokes({ page })).toHaveLength(1)

  // Fit, by button and by key.
  await zoom.getByRole('button', { name: 'Fit Front' }).click()
  await expect(readout).toHaveText('100%')
  await page.keyboard.press('=')
  await expect(readout).toHaveText('150%')
  await page.keyboard.press('0')
  await expect(readout).toHaveText('100%')
  // At fit the canvas fills its frame again.
  const fitted = (await canvas.boundingBox())!
  expect(Math.abs(fitted.width - box.width)).toBeLessThan(3)
  expect(Math.abs(fitted.x - box.x)).toBeLessThan(2)
})

test('Download image saves the 3D view, and with the flat sides a sheet, as PNGs', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'download-image' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })
  await page.getByRole('button', { name: /Preview & Publish/ }).click()

  const section = page.getByTestId('download-image')
  await expect(section).toBeVisible()

  const png = async (trigger: () => Promise<void>) => {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()])
    const bytes = await readFile((await download.path())!)
    return { name: download.suggestedFilename(), bytes }
  }
  const size = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const view = await png(() => section.getByRole('button', { name: 'Download PNG' }).click())
  expect(view.name).toMatch(/^fashion-leader-[a-z0-9-]+-3d-\d{4}-\d{2}-\d{2}\.png$/)
  expect(view.bytes.subarray(0, 8).equals(signature)).toBe(true)
  const viewSize = size(view.bytes)
  expect(viewSize.width).toBeGreaterThan(100)

  await section.getByRole('checkbox', { name: 'With the flat sides' }).check()
  // The shortcut does the same as the button (from the page, not the checkbox).
  await page.getByTestId('download-image').getByText('Download image').click()
  const sheet = await png(() => page.keyboard.press('Shift+ControlOrMeta+E'))
  expect(sheet.name).toMatch(/-sheet-\d{4}-\d{2}-\d{2}\.png$/)
  expect(sheet.bytes.subarray(0, 8).equals(signature)).toBe(true)
  // The 3D view beside the sides: wider than it is tall.
  const sheetSize = size(sheet.bytes)
  expect(sheetSize.width).toBeGreaterThan(sheetSize.height)
})
