import { type Page, expect, test } from '@playwright/test'

import { chooseTool, deleteAccounts, expectSaved, newEmail, panelCanvas, signIn } from './helpers'

/**
 * Tester, 22 Nov: a mark can go behind another right on the canvas, and an
 * uploaded image's colour can be turned to black and white, down or up.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Layer = { id: string; kind: string; saturation?: number }

async function frontLayers({ page }: { page: Page }): Promise<Layer[]> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head.content.panels.front.layers
  }, designId)
}

/** A plain-coloured square PNG, made in the page. */
async function squarePng({ page, color }: { page: Page; color: string }) {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.fillStyle = fill
    context.fillRect(0, 0, 64, 64)
    return canvas.toDataURL('image/png').split(',')[1]!
  }, color)
  return Buffer.from(base64, 'base64')
}

/** Magenta pixels on the front panel (the red outline and selection frame are not). */
async function colouredPixels({ page }: { page: Page }) {
  return panelCanvas({ page, panel: 'Front' }).evaluate((node: HTMLCanvasElement) => {
    const { data } = node.getContext('2d')!.getImageData(0, 0, node.width, node.height)
    let count = 0

    for (let at = 0; at < data.length; at += 4) {
      count += data[at]! > 180 && data[at + 2]! > 180 && data[at + 1]! < 90 ? 1 : 0
    }

    return count
  })
}

async function upload({ page, name, color }: { page: Page; name: string; color: string }) {
  const before = (await frontLayers({ page })).filter((layer) => layer.kind === 'image').length
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'image/png', buffer: await squarePng({ page, color }) })
  await expect
    .poll(async () => (await frontLayers({ page })).filter((layer) => layer.kind === 'image').length, { timeout: 30_000 })
    .toBe(before + 1)
}

test('an uploaded image turns black and white, and a mark is sent backward from the canvas', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'image-colour' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Upload' })

  await upload({ page, name: 'magenta.png', color: '#ff00ff' })
  await expect.poll(async () => colouredPixels({ page })).toBeGreaterThan(200)

  // Black & white: the image is grey on the panel and saved as saturation 0.
  const mono = page.getByRole('button', { name: 'Black & white' })
  await mono.click()
  await expect(mono).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => colouredPixels({ page })).toBe(0)
  await expect.poll(async () => (await frontLayers({ page })).find((layer) => layer.kind === 'image')?.saturation).toBe(0)

  // And back: as uploaded, the field is left out again.
  await mono.click()
  await expect(mono).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => colouredPixels({ page })).toBeGreaterThan(200)
  await expect.poll(async () => 'saturation' in ((await frontLayers({ page })).find((layer) => layer.kind === 'image') ?? {})).toBe(false)

  // A second image lands on top; Send backward on the canvas puts it under the first.
  await upload({ page, name: 'green.png', color: '#00ff00' })
  const images = async () => (await frontLayers({ page })).filter((layer) => layer.kind === 'image').map((layer) => layer.id)
  const [first, second] = await images()
  await page.getByRole('toolbar', { name: /actions$/ }).getByRole('button', { name: /backward$/ }).click()
  await expect.poll(images).toEqual([second, first])
})
