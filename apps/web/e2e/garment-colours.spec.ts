import { type Page, expect, test } from '@playwright/test'

import { INK_COLORS } from '../src/lib/paint-colors'
import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Tester pass 3, read from the pixels: a striped base shows the same two
 * colours on the flat panels and on the 3D garment, and a new hoodie is one
 * colour all over (hood included), with no baked-in green or Style3D logo,
 * no empty "Ink" layer, and a picture on its My Studio card.
 *
 * `GARMENT_COLOUR_EVIDENCE=1` also writes `../../docs/evidence/tester3-*-after.png`.
 */

const emails: string[] = []
const EVIDENCE = Boolean(process.env.GARMENT_COLOUR_EVIDENCE)

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Counts = { oxblood: number; ink: number; cream: number; green: number; total: number }

const color = (name: string) => INK_COLORS.find((ink) => ink.name === name)!.value

async function newHoodie({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Create' }).click()
  await page.getByRole('radiogroup', { name: 'Garment' }).getByRole('radio', { name: /Hoodie/ }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Create a hoodie' }).click({ timeout: 20_000 })
  await expectSaved({ page })
}

async function goToStep({ page, step }: { page: Page; step: 'color' | 'design' }) {
  const url = new URL(page.url())
  url.searchParams.set('step', step)
  await page.goto(url.toString())
  await expectSaved({ page })
}

/** The middle of the 3D scene, once the garment has loaded. */
async function sceneShot({ page, path }: { page: Page; path?: string }) {
  await page.waitForTimeout(2_000)
  await expect(page.getByRole('status').filter({ hasText: /still loading/ })).toHaveCount(0, { timeout: 30_000 })
  const box = (await page.locator('canvas[data-engine]').boundingBox())!
  const clip = { x: box.x + box.width * 0.25, y: box.y, width: box.width * 0.5, height: box.height - 96 }
  return (await page.screenshot({ clip, ...(path ? { path } : {}) })).toString('base64')
}

/** Colour counts in a picture (the 3D is lit, so each colour is a range). */
function countsOf({ page, picture }: { page: Page; picture: string }): Promise<Counts> {
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height)
    const counts = { oxblood: 0, ink: 0, cream: 0, green: 0, total: pixels.length / 4 }

    for (let at = 0; at < pixels.length; at += 4) {
      const [r, g, b] = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]
      counts.oxblood += r > g + 35 && r > b + 25 && g < 90 ? 1 : 0
      counts.ink += r < 60 && g < 60 && b < 70 ? 1 : 0
      counts.cream += r > 225 && g > 220 && b > 205 && r - b > 6 ? 1 : 0
      // The model's baked green (#36532f), lit or shaded.
      counts.green += g > r + 12 && g > b + 12 ? 1 : 0
    }

    return counts
  }, picture)
}

/** A flat panel's own pixels, as drawn (ground, ink and the off-shape veil). */
async function panelPicture({ page, name }: { page: Page; name: string }) {
  const canvas = page.locator(`canvas[aria-label^="Design panel ${name}"]`)
  await expect(canvas).toBeVisible()
  return canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png').split(',')[1]!)
}

test('a striped hoodie shows the same two colours on its flat panels and in 3D', async ({ page }) => {
  test.setTimeout(240_000)
  await newHoodie({ page, label: 'stripe-colours' })
  await goToStep({ page, step: 'color' })
  await page.getByRole('button', { name: 'Oxblood' }).first().click()
  await page.getByRole('button', { name: 'Stripe', exact: true }).first().click()
  await expectSaved({ page })

  await goToStep({ page, step: 'design' })
  const flat = await countsOf({ page, picture: await panelPicture({ page, name: 'Front' }) })
  const scene = await countsOf({ page, picture: await sceneShot({ page }) })

  if (EVIDENCE) {
    await page.screenshot({ path: '../../docs/evidence/tester3-hoodie-stripes-after.png' })
  }

  // The flat front: oxblood ground and ink stripes, no cream.
  expect(flat.oxblood / flat.total).toBeGreaterThan(0.2)
  expect(flat.ink / flat.total).toBeGreaterThan(0.2)
  expect(flat.cream / flat.total).toBeLessThan(0.01)
  // The 3D garment: the same two colours.
  expect(scene.oxblood / scene.total).toBeGreaterThan(0.03)
  expect(scene.ink / scene.total).toBeGreaterThan(0.01)
  expect(scene.green / scene.total).toBeLessThan(0.002)

  // What was saved: the ground and the stripes, as picked.
  const designId = new URL(page.url()).searchParams.get('cloud')!
  const base = await page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head.content.base
  }, designId)
  expect(base).toMatchObject({ kind: 'stripes', colors: [color('Oxblood'), color('Ink')] })
})

test('a new hoodie is one colour all over, with no logo, no empty layer, and a card picture', async ({ page }) => {
  test.setTimeout(240_000)
  await newHoodie({ page, label: 'hoodie-new' })
  await goToStep({ page, step: 'design' })

  // Nothing is on the cloth yet, so the layer list is empty.
  await expect(page.locator('[data-layer-control="select"]')).toHaveCount(0)

  // The 3D: no baked green and no dark logo on the white cloth, hood included.
  const white = await countsOf({ page, picture: await sceneShot({ page, ...(EVIDENCE ? { path: '../../docs/evidence/tester3-hoodie-scene-after.png' } : {}) }) })
  expect(white.green / white.total).toBeLessThan(0.002)
  expect(white.ink / white.total).toBeLessThan(0.002)

  // In a colour, the whole garment takes it: the hood is not left white.
  await goToStep({ page, step: 'color' })
  await page.getByRole('button', { name: 'Oxblood' }).first().click()
  await expectSaved({ page })
  const colored = await countsOf({ page, picture: await sceneShot({ page, ...(EVIDENCE ? { path: '../../docs/evidence/tester3-hoodie-oxblood-after.png' } : {}) }) })
  expect(colored.oxblood / colored.total).toBeGreaterThan(0.08)
  expect(colored.green / colored.total).toBeLessThan(0.002)
  expect(colored.cream / colored.total).toBeLessThan(0.002)

  // My Studio: the card draws the hoodie's front, in its shape and colour.
  await page.goto('/studio')
  const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Untitled hoodie' }) })
  const thumbnail = card.locator('[data-thumbnail]')
  await expect(thumbnail).toHaveAttribute('data-thumbnail', 'still', { timeout: 30_000 })

  if (EVIDENCE) {
    await card.screenshot({ path: '../../docs/evidence/tester3-hoodie-card-after.png' })
  }

  const still = await thumbnail.locator('img').evaluate(async (node) => {
    const image = node as HTMLImageElement
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let [drawn, oxblood, minX, maxX, minY, maxY] = [0, 0, canvas.width, 0, canvas.height, 0]

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const at = (y * canvas.width + x) * 4

        if (data[at + 3]! > 128) {
          drawn += 1
          oxblood += data[at]! > data[at + 1]! + 35 ? 1 : 0
          ;[minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)]
        }
      }
    }

    return { drawn, oxblood, box: (maxX - minX + 1) * (maxY - minY + 1) }
  })
  // Mostly the garment's colour, and its own outline, not a plain rectangle.
  expect(still.oxblood / still.drawn).toBeGreaterThan(0.8)
  expect(still.drawn / still.box).toBeLessThan(0.95)
})
