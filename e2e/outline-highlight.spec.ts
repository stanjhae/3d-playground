import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, panelCanvas, signIn } from './helpers'

/**
 * Tester, 22 Nov: on a patterned garment the shape was hard to see while
 * drawing, and nothing showed which part was being edited. Every side is
 * outlined, the side being edited in the house red, and Hide print
 * leaves the print out of the 2D sides.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const ACCENT = { r: 0xe0, g: 0x14, b: 0x1f }

type Rgb = { r: number; g: number; b: number }

/** Pixels of one panel canvas near `color`: in its middle, and along its edges. */
async function colourCounts({ page, panel, color }: { page: Page; panel: 'Front' | 'Back'; color: Rgb }) {
  return panelCanvas({ page, panel }).evaluate((canvas: HTMLCanvasElement, target) => {
    const context = canvas.getContext('2d')!
    const { width, height } = canvas
    const pixels = context.getImageData(0, 0, width, height).data
    const near = (index: number) =>
      Math.abs(pixels[index]! - target.r) <= 24 &&
      Math.abs(pixels[index + 1]! - target.g) <= 24 &&
      Math.abs(pixels[index + 2]! - target.b) <= 24
    let middle = 0
    let edge = 0

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!near((y * width + x) * 4)) {
          continue
        }

        const inMiddle = x > width * 0.3 && x < width * 0.7 && y > height * 0.3 && y < height * 0.7
        middle += inMiddle ? 1 : 0
        edge += inMiddle ? 0 : 1
      }
    }

    return { middle, edge }
  }, color)
}

/** How many colours the middle of a panel shows (to 4 bits a channel): a print shows several. */
async function middleColours({ page, panel }: { page: Page; panel: 'Front' | 'Back' }) {
  return panelCanvas({ page, panel }).evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
    const seen = new Set<number>()

    for (let y = Math.floor(height * 0.3); y < height * 0.7; y += 1) {
      for (let x = Math.floor(width * 0.3); x < width * 0.7; x += 1) {
        const index = (y * width + x) * 4
        seen.add(((pixels[index]! >> 4) << 8) | ((pixels[index + 1]! >> 4) << 4) | (pixels[index + 2]! >> 4))
      }
    }

    return seen.size
  })
}

test('the side being edited is outlined in red, and Hide print leaves the print out', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'outline' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  // A check over the whole tee.
  const url = new URL(page.url())
  url.searchParams.set('step', 'color')
  await page.goto(url.toString())
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expectSaved({ page })
  url.searchParams.set('step', 'design')
  await page.goto(url.toString())

  const front = panelCanvas({ page, panel: 'Front' })
  await expect(front).toBeVisible()
  await expect(front).toHaveAttribute('aria-label', /active/)

  // The front is the side being edited: its outline is red; the back's is ink.
  await expect.poll(async () => (await colourCounts({ page, panel: 'Front', color: ACCENT })).edge, { timeout: 20_000 }).toBeGreaterThan(100)
  await expect.poll(async () => (await colourCounts({ page, panel: 'Back', color: ACCENT })).edge).toBe(0)

  // The check fills the middle of the side…
  await expect.poll(async () => middleColours({ page, panel: 'Front' })).toBeGreaterThan(1)

  // …until Hide print leaves them out. The outline stays.
  const toggle = page.getByRole('button', { name: 'Hide print', exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => middleColours({ page, panel: 'Front' })).toBe(1)
  expect((await colourCounts({ page, panel: 'Front', color: ACCENT })).edge).toBeGreaterThan(100)

  // A view only: the check is still the design, and comes back.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => middleColours({ page, panel: 'Front' })).toBeGreaterThan(1)

  // Drawing on the back makes it the side being edited, outlined in red.
  await drawStroke({ page, panel: 'Back' })
  await expect(panelCanvas({ page, panel: 'Back' })).toHaveAttribute('aria-label', /active/)
  await expect.poll(async () => (await colourCounts({ page, panel: 'Back', color: ACCENT })).edge).toBeGreaterThan(100)
  await expect.poll(async () => (await colourCounts({ page, panel: 'Front', color: ACCENT })).edge).toBe(0)
})
