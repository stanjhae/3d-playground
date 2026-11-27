import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Parametric shape v1: a slider on the select step deforms the real tee,
 * read from the scene's own pixels, and the shape is saved and undoable.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function sceneShot({ page, path }: { page: Page; path?: string }) {
  await page.waitForTimeout(1_500)
  const box = (await page.locator('canvas[data-engine]').boundingBox())!
  // The middle of the scene: side rails sit over the canvas's edges.
  const clip = { x: box.x + box.width * 0.25, y: box.y, width: box.width * 0.5, height: box.height - 96 }
  return page.screenshot({ clip, ...(path ? { path } : {}) })
}

/** Share of pixels that differ between two same-size PNG screenshots. */
function changedShare({ page, before, after }: { page: Page; before: Buffer; after: Buffer }) {
  return page.evaluate(
    async ([one, two]) => {
      const read = async (data: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, image.width, image.height).data
      }
      const [a, b] = [await read(one!), await read(two!)]
      let changed = 0

      for (let at = 0; at < a.length; at += 4) {
        if (Math.abs(a[at]! - b[at]!) + Math.abs(a[at + 1]! - b[at + 1]!) + Math.abs(a[at + 2]! - b[at + 2]!) > 24) {
          changed += 1
        }
      }

      return changed / (a.length / 4)
    },
    [before.toString('base64'), after.toString('base64')],
  )
}

async function savedShape({ page }: { page: Page }) {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return ((await response.json()).head?.content?.shape ?? null) as Record<string, number> | null
  }, designId)
}

test('moving a shape slider changes the render, saves the shape, and undoes', async ({ page }) => {
  const email = newEmail({ label: 'shape' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  const url = new URL(page.url())
  url.searchParams.set('step', 'select')
  await page.goto(url.toString())
  await expectSaved({ page })

  const rail = page.getByTestId('shape-rail')
  await expect(rail).toBeVisible()
  // The crew/v and crop/long toggles are gone for the real tee.
  await expect(page.getByRole('button', { name: 'Crew', exact: true })).toHaveCount(0)

  const before = await sceneShot({ page })
  await rail.getByRole('slider', { name: 'Length' }).fill('0.4')
  await expect(rail.locator('[data-shape-value="bodyLength"]')).toHaveText('+40%')
  const longer = await sceneShot({ page })
  expect(await changedShare({ page, before, after: longer })).toBeGreaterThan(0.005)

  // Mirrored by default: one slider moves both sleeves.
  await rail.getByRole('slider', { name: 'Sleeves' }).fill('1')
  await expectSaved({ page })
  await expect.poll(() => savedShape({ page })).toEqual({
    leftSleeveLength: 1,
    rightSleeveLength: 1,
    bodyLength: 0.4,
    bodyWidth: 0,
    necklineDepth: 0,
  })

  // Unlocked, each sleeve is its own.
  await rail.getByRole('checkbox', { name: 'Mirror sleeves' }).uncheck()
  await rail.getByRole('slider', { name: "Right sleeve (wearer's)" }).fill('-0.5')
  await expect(rail.locator('[data-shape-value="rightSleeveLength"]')).toHaveText('-50%')
  await expect(rail.locator('[data-shape-value="leftSleeveLength"]')).toHaveText('+100%')

  // Undo steps back one slider move at a time (the studio's keys skip a focused field).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(rail.locator('[data-shape-value="rightSleeveLength"]')).toHaveText('+100%')

  await rail.getByRole('button', { name: 'Reset shape' }).click()
  await expect(rail.locator('[data-shape-value="bodyLength"]')).toHaveText('0%')
  await expectSaved({ page })
  await expect.poll(() => savedShape({ page })).toBeNull()
  const reset = await sceneShot({ page })
  expect(await changedShare({ page, before, after: reset })).toBeLessThan(0.002)
})

async function createGarment({ page, label, button }: { page: Page; label: RegExp; button: string | RegExp }) {
  // The studio has no site header: from a design, leave it first.
  if (new URL(page.url()).pathname === '/create') {
    await page.getByRole('link', { name: 'Back to My Studio' }).click()
  }

  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Create' }).click()
  await page.getByRole('radiogroup', { name: 'Garment' }).getByRole('radio', { name: label }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: button }).click({ timeout: 20_000 })
  await expectSaved({ page })
  const url = new URL(page.url())
  url.searchParams.set('step', 'select')
  await page.goto(url.toString())
  await expectSaved({ page })
}

test('the hoodie and the trousers have their own sliders, which change the render and save', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'shape-more' })
  emails.push(email)
  await signIn({ page, email })

  // The hoodie: sleeves, length and width; its hood leaves no neckline slider.
  await createGarment({ page, label: /Hoodie/, button: 'Create a hoodie' })
  let rail = page.getByTestId('shape-rail')
  await expect(rail).toBeVisible()
  await expect(rail.getByRole('slider')).toHaveCount(3)
  await expect(rail.getByRole('slider', { name: 'Neckline depth' })).toHaveCount(0)
  let before = await sceneShot({ page })
  await rail.getByRole('slider', { name: 'Sleeves' }).fill('-0.5')
  await expect(rail.locator('[data-shape-value="leftSleeveLength"]')).toHaveText('-50%')
  let after = await sceneShot({ page })
  expect(await changedShare({ page, before, after })).toBeGreaterThan(0.005)
  await expectSaved({ page })
  await expect.poll(() => savedShape({ page })).toEqual({
    leftSleeveLength: -0.5,
    rightSleeveLength: -0.5,
    bodyLength: 0,
    bodyWidth: 0,
  })

  // Trousers: each leg and the waist; mirrored legs move together.
  await createGarment({ page, label: /^Trousers/, button: 'Create a pair of trousers' })
  rail = page.getByTestId('shape-rail')
  await expect(rail).toBeVisible()
  await expect(rail.getByRole('checkbox', { name: 'Mirror legs' })).toBeChecked()
  before = await sceneShot({ page })
  await rail.getByRole('slider', { name: 'Legs' }).fill('-0.6')
  await expect(rail.locator('[data-shape-value="leftLegLength"]')).toHaveText('-60%')
  after = await sceneShot({ page })
  expect(await changedShare({ page, before, after })).toBeGreaterThan(0.005)
  await expectSaved({ page })
  await expect.poll(() => savedShape({ page })).toEqual({ leftLegLength: -0.6, rightLegLength: -0.6, waistWidth: 0 })

  // One leg on its own.
  await rail.getByRole('checkbox', { name: 'Mirror legs' }).uncheck()
  await rail.getByRole('slider', { name: "Right leg (wearer's)" }).fill('0')
  await expectSaved({ page })
  await expect.poll(() => savedShape({ page })).toEqual({ leftLegLength: -0.6, rightLegLength: 0, waistWidth: 0 })
})

/**
 * Evidence, not a check: each garment as made and at its sliders' limits,
 * saved to `../../docs/evidence/shape-<garment>-<look>.png`. Off unless
 * `SHAPE_EVIDENCE` is set:
 *
 *   SHAPE_EVIDENCE=1 pnpm e2e --project=chromium shape -g evidence
 */
const EVIDENCE = [
  {
    file: 'tee',
    label: /^Tee/,
    button: /^Create a (T-shirt|tee)$/,
    looks: { long: { Sleeves: '1.5', Length: '0.4', Width: '0.25', 'Neckline depth': '1' }, short: { Sleeves: '-0.6', Length: '-0.4', Width: '-0.15' } },
  },
  {
    file: 'hoodie',
    label: /Hoodie/,
    button: 'Create a hoodie',
    looks: { long: { Sleeves: '0.25', Length: '0.35', Width: '0.2' }, short: { Sleeves: '-0.6', Length: '-0.3', Width: '-0.1' } },
  },
  {
    file: 'vest',
    label: /^Vest/,
    button: 'Create a vest',
    looks: { long: { Length: '0.35', Width: '0.2', 'Neckline depth': '0.6' }, short: { Length: '-0.35', Width: '-0.1' } },
  },
  {
    file: 'crop',
    label: /^Crop top/,
    button: 'Create a crop top',
    looks: { long: { Length: '1', Width: '0.2', 'Neckline depth': '1' }, short: { Length: '-0.3', Width: '-0.1' } },
  },
  {
    file: 'dress',
    label: /^Dress/,
    button: 'Create a dress',
    looks: { long: { Length: '0.3', Width: '0.2', 'Hem flare': '0.6' }, short: { Length: '-0.5', Width: '-0.1', 'Hem flare': '-0.3' } },
  },
  {
    file: 'trousers',
    label: /^Trousers/,
    button: 'Create a pair of trousers',
    looks: { long: { Legs: '0.1', 'Waist & hips': '0.25' }, short: { Legs: '-0.75', 'Waist & hips': '-0.15' } },
  },
]

test('evidence: every garment as made and at its limits', async ({ page }) => {
  test.skip(!process.env.SHAPE_EVIDENCE, 'evidence only: set SHAPE_EVIDENCE=1')
  test.setTimeout(300_000)
  const email = newEmail({ label: 'shape-evidence' })
  emails.push(email)
  await signIn({ page, email })

  for (const garment of EVIDENCE) {
    await createGarment({ page, label: garment.label, button: garment.button })
    const rail = page.getByTestId('shape-rail')
    await expect(rail).toBeVisible()
    await sceneShot({ page, path: `../../docs/evidence/shape-${garment.file}-made.png` })

    for (const [look, sliders] of Object.entries(garment.looks)) {
      if (await rail.getByRole('button', { name: 'Reset shape' }).isEnabled()) {
        await rail.getByRole('button', { name: 'Reset shape' }).click()
      }

      for (const [name, value] of Object.entries(sliders)) {
        await rail.getByRole('slider', { name, exact: true }).fill(value)
      }

      await expectSaved({ page })
      await sceneShot({ page, path: `../../docs/evidence/shape-${garment.file}-${look}.png` })
    }
  }
})
