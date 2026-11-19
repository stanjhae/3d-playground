import { type Locator, type Page, expect, test } from '@playwright/test'

import {
  chooseTool,
  deleteAccounts,
  drawStroke,
  expectSaved,
  newEmail,
  publishWithPlaceholders,
  savedStrokes,
  signIn,
} from './helpers'

/** Findings from the third outside test pass (studio flow). */
const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function openDesign({ page, label, pro = true }: { page: Page; label: string; pro?: boolean }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email, pro })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
}

async function gotoStep({ page, step }: { page: Page; step: string }) {
  const url = new URL(page.url())
  url.searchParams.set('step', step)
  await page.goto(url.toString())
  await expectSaved({ page })
}

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function allStrokes({ page }: { page: Page }) {
  let count = 0
  for (const panel of ['front', 'back', 'left', 'right'] as const) {
    count += (await savedStrokes({ page, panel })).length
  }
  return count
}

async function drag({ page, target }: { page: Page; target: Locator }) {
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x - 40, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y + 10, { steps: 12 })
  await page.mouse.up()
}

test('the header keeps its height while a save starts and ends', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'headerheight' })
  await chooseTool({ page, tool: 'Draw' })
  await page.evaluate(() => {
    const header = document.querySelector('[data-studio-part="header"]')!
    const indicator = document.querySelector('[data-save-indicator]')!
    const seen = { header: new Set<number>(), indicator: new Set<string>(), labels: new Set<string>() }
    ;(window as unknown as { __sizes: typeof seen }).__sizes = seen
    const record = () => {
      seen.header.add(Math.round(header.getBoundingClientRect().height))
      const box = indicator.getBoundingClientRect()
      seen.indicator.add(`${Math.round(box.width)}x${Math.round(box.height)}`)
      seen.labels.add(indicator.textContent ?? '')
    }
    record()
    new ResizeObserver(record).observe(header)
    new MutationObserver(record).observe(indicator, { subtree: true, childList: true, characterData: true })
  })
  await drawStroke({ page, panel: 'Front' })
  await expect(page.getByRole('status').filter({ hasText: 'Saving…' })).toBeVisible()
  await expectSaved({ page })
  const sizes = await page.evaluate(() => {
    const seen = (window as unknown as { __sizes: { header: Set<number>; indicator: Set<string>; labels: Set<string> } }).__sizes
    return { header: [...seen.header], indicator: [...seen.indicator], labels: [...seen.labels] }
  })
  expect(sizes.labels.some((label) => label.includes('Saving…'))).toBe(true)
  expect(sizes.header).toHaveLength(1)
  expect(sizes.indicator).toHaveLength(1)
})

test('each Back says where it goes: the step bar names the step, the camera names the view', async ({ page }) => {
  await openDesign({ page, label: 'backlabels' })
  await gotoStep({ page, step: 'design' })
  await expect(page.getByRole('button', { name: 'Back to Color', exact: true })).toBeVisible()
  // Only the camera's view of the garment's back is called just "Back".
  // (The flat panel captioned "Back" is a name, not a control.)
  const bare = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], [role="radio"], [role="button"]')]
      .filter((control) => {
        const box = control.getBoundingClientRect()
        const name = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim()
        return name === 'Back' && box.width > 0 && box.height > 0
      })
      .map((control) => control.getAttribute('role') ?? control.tagName.toLowerCase()),
  )
  expect(bare).toEqual(['radio'])
  await expect(page.getByRole('radiogroup', { name: 'Camera' }).getByRole('radio', { name: 'Back', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Color', exact: true }).click()
  await expect(page).toHaveURL(/step=color/)
})

test('the "Pick a side" hint never covers a control such as the Pro tools switch', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openDesign({ page, label: 'hintclear', pro: false })
  await gotoStep({ page, step: 'design' })
  const hint = page.getByRole('complementary', { name: 'Hint' })
  await expect(hint).toContainText('Pick a side')
  // Placement settles on the next frame.
  await page.waitForTimeout(500)
  const covered = await hint.evaluate((card) => {
    const box = card.getBoundingClientRect()
    return [...document.querySelectorAll('button, [role="switch"], a[href], input')]
      .filter((control) => !card.contains(control))
      .filter((control) => {
        const other = control.getBoundingClientRect()
        return (
          other.width > 0 &&
          other.height > 0 &&
          getComputedStyle(control).visibility !== 'hidden' &&
          box.left < other.right &&
          other.left < box.right &&
          box.top < other.bottom &&
          other.top < box.bottom
        )
      })
      .map((control) => control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName)
  })
  expect(covered).toEqual([])
  const pro = (await page.getByRole('switch', { name: 'Pro tools' }).boundingBox())!
  expect(overlaps((await hint.boundingBox())!, pro)).toBe(false)
  // And the switch takes its click.
  await page.getByRole('switch', { name: 'Pro tools' }).click()
  await expect(page.getByRole('switch', { name: 'Pro tools' })).toHaveAttribute('aria-checked', 'true')
})

test('with Draw on, a drag on the 3D garment draws in a held view but turns it in Orbit', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'draworbit' })
  await chooseTool({ page, tool: 'Draw' })
  await drawStroke({ page, panel: 'Front' })
  await expect.poll(() => allStrokes({ page }), { timeout: 20_000 }).toBe(1)
  const camera = page.getByRole('radiogroup', { name: 'Camera' })
  await camera.getByRole('radio', { name: 'Front', exact: true }).click()
  await page.waitForTimeout(2_000)
  const scene = page.locator('canvas[data-engine]')

  // Held on Front, a drag on the garment draws on it.
  await drag({ page, target: scene })
  await expect.poll(() => allStrokes({ page }), { timeout: 20_000 }).toBe(2)

  // On Orbit the same drag turns the garment and draws nothing, and says so.
  await camera.getByRole('radio', { name: 'Orbit', exact: true }).click()
  await expect(page.getByText('Orbit turns the garment. Pick a view, such as Front, to draw on it.')).toBeVisible()
  await drag({ page, target: scene })
  await page.waitForTimeout(3_000)
  await expectSaved({ page })
  expect(await allStrokes({ page })).toBe(2)

  // The flat panels still draw while the camera is on Orbit.
  await drawStroke({ page, panel: 'Back' })
  await expect.poll(() => allStrokes({ page }), { timeout: 20_000 }).toBe(3)
})

test('a legacy or unknown ?step= opens the studio instead of crashing', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const email = newEmail({ label: 'legacystep' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  for (const value of ['garment', 'nonsense']) {
    const url = new URL(page.url())
    url.searchParams.set('step', value)
    await page.goto(url.toString())
    await expect(page).toHaveURL(/step=select/)
    await expectSaved({ page })
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('reloading the publish step of a published design never offers Publish before its status is known', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'pubreload' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await publishWithPlaceholders({ page })

  // Hold the publication read so the in-between state can be checked.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(/\/api\/flp\/designs\/[^/]+\/publication$/, async (route) => {
    await held
    await route.continue()
  })
  const url = new URL(page.url())
  url.searchParams.set('step', 'share')
  const started = Date.now()
  await page.goto(url.toString())
  const panel = page.getByRole('region', { name: 'Publish' })
  await expect(panel.getByText('Checking whether this design is published…')).toBeVisible({ timeout: 30_000 })
  console.log(`[timing] publish panel shown after ${Date.now() - started} ms`)
  await expect(panel.getByText(/^Private\./)).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /Publish/ })).toHaveCount(0)
  release()
  await expect(panel.getByText(/^Published v\d+/)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Published' })).toBeVisible()
})
