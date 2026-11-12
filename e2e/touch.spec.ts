import { expect, test } from '@playwright/test'

import { chooseTool, deleteAccounts, expectSaved, newEmail, panelCanvas, savedStrokes, showPanels, signIn, touchStroke } from './helpers'

/**
 * Touch input on a phone-sized and an iPad-sized Chromium (Q2): a finger
 * drawn through CDP touch emulation paints one stroke, and the studio fits
 * the screen. Runs in the `chromium-touch` and `ipad` projects only.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test.beforeEach(({ browserName, hasTouch }) => {
  test.skip(browserName !== 'chromium' || !hasTouch, 'CDP touch emulation: Chromium with hasTouch')
})

test('a finger paints one stroke on the front panel, and the studio fits the screen', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch' })
  emails.push(email)
  await signIn({ page, email })
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  await showPanels({ page })
  const front = panelCanvas({ page, panel: 'Front' })
  await expect(front).toBeVisible()
  await front.scrollIntoViewIfNeeded()

  await touchStroke({ page, panel: 'Front' })
  await expect.poll(() => savedStrokes({ page }), { timeout: 30_000 }).toHaveLength(1)
  const [points] = await savedStrokes({ page })
  expect(points).toBeGreaterThan(4)

  // Nothing runs off the side: the page never scrolls sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('nothing covers the garment on any step of a phone-sized studio', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch-layout' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=/)

  const steps = page.getByRole('navigation', { name: 'Create steps' })

  for (const step of [/Garment$/, /Color & Pattern$/, /Design$/, /Preview & Publish$/]) {
    await steps.getByRole('button', { name: step }).tap()
    // Let the header and tools settle before measuring.
    await page.waitForTimeout(400)

    const boxes = await page.evaluate(() => {
      const box = (element: Element | null) => {
        if (!element) return null
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
          : null
      }

      return {
        stage: box(document.querySelector('[data-studio-part="stage"]')),
        others: [
          ...['header', 'tools', 'publish'].map((part) => ({ part, box: box(document.querySelector(`[data-studio-part="${part}"]`)) })),
          ...[...document.querySelectorAll('[aria-label="Hint"]')].map((element) => ({ part: 'hint', box: box(element) })),
        ],
      }
    })

    expect(boxes.stage, `${step}: the garment stage shows`).not.toBeNull()
    const stage = boxes.stage!
    // The garment keeps a real share of the screen (a quarter at least), not a sliver.
    const viewportHeight = page.viewportSize()!.height
    expect(stage.bottom - stage.top, `${step}: stage height`).toBeGreaterThanOrEqual(viewportHeight / 4)

    for (const { part, box } of boxes.others) {
      if (!box) continue
      const overlap =
        Math.max(0, Math.min(stage.right, box.right) - Math.max(stage.left, box.left)) *
        Math.max(0, Math.min(stage.bottom, box.bottom) - Math.max(stage.top, box.top))
      // A pixel of shared edge is fine; anything more covers the garment.
      expect(overlap, `${step}: ${part} covers the stage`).toBeLessThanOrEqual(stage.right - stage.left)
    }
  }
})

test('two fingers on the 3D garment resize the selected graphic', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch-pinch' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })

  // A tapped graphic lands mid-front and is selected.
  await chooseTool({ page, tool: 'Graphics' })
  // Tiles are the library's draggable buttons, whatever their names.
  await page.locator('button[draggable="true"]').first().tap()
  const scale = async () => {
    await expectSaved({ page })
    const designId = new URL(page.url()).searchParams.get('cloud')!
    return page.evaluate(async (id) => {
      const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
      const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const { head } = await response.json()
      type Layer = { kind: string; scale?: number }
      return (head.content.panels.front.layers as Layer[]).find((layer) => layer.kind === 'image')?.scale ?? null
    }, designId)
  }
  await expect.poll(scale, { timeout: 30_000 }).not.toBeNull()
  const before = (await scale())!

  // Two fingers spread apart over the garment.
  const stage = (await page.locator('canvas[aria-describedby="studio-scene-description"]').boundingBox())!
  const cx = stage.x + stage.width / 2
  const cy = stage.y + stage.height / 2
  const cdp = await page.context().newCDPSession(page)
  const fingers = (spread: number) => [
    { x: cx - spread, y: cy, id: 1 },
    { x: cx + spread, y: cy, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(20) })
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(20 + step * 4) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()

  await expect.poll(async () => (await scale())! > before * 1.3, { timeout: 30_000 }).toBe(true)
})
