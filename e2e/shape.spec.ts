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

async function sceneShot({ page }: { page: Page }) {
  await page.waitForTimeout(1_500)
  const box = (await page.locator('canvas[data-engine]').boundingBox())!
  // The middle of the scene: side rails sit over the canvas's edges.
  const clip = { x: box.x + box.width * 0.25, y: box.y, width: box.width * 0.5, height: box.height - 96 }
  return page.screenshot({ clip })
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
