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

test('two fingers on a selected mark on a 2D panel resize and turn it, as one undo step, and leave no stroke', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch-panel-pinch' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })

  // A tapped graphic lands mid-front and is selected.
  await chooseTool({ page, tool: 'Graphics' })
  await page.locator('button[draggable="true"]').first().tap()
  type Mark = { x: number; y: number; scale: number; rotation: number }
  const mark = async () => {
    await expectSaved({ page })
    const designId = new URL(page.url()).searchParams.get('cloud')!
    return page.evaluate(async (id) => {
      const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
      const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const { head } = await response.json()
      type Layer = { kind: string; x: number; y: number; scale?: number; rotation?: number }
      const image = (head.content.panels.front.layers as Layer[]).find((layer) => layer.kind === 'image')
      return image ? { x: image.x, y: image.y, scale: image.scale ?? 1, rotation: image.rotation ?? 0 } : null
    }, designId)
  }
  await expect.poll(mark, { timeout: 30_000 }).not.toBeNull()
  const before = (await mark()) as Mark

  await showPanels({ page })
  const front = panelCanvas({ page, panel: 'Front' })
  await front.scrollIntoViewIfNeeded()

  /** Two fingers on the mark: they spread apart and twist a quarter-ish turn clockwise. */
  async function pinch({ on }: { on: Mark }) {
    const box = (await front.boundingBox())!
    const cx = box.x + box.width * on.x
    const cy = box.y + box.height * (1 - on.y)
    const fingers = (spread: number, turn: number) => [
      { x: cx - spread * Math.cos(turn), y: cy - spread * Math.sin(turn), id: 1 },
      { x: cx + spread * Math.cos(turn), y: cy + spread * Math.sin(turn), id: 2 },
    ]
    const cdp = await page.context().newCDPSession(page)
    // The first finger lands, then the second, as a hand does.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(12, 0).slice(0, 1) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...fingers(12, 0)[0]!, x: cx - 18 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(12, 0) })
    for (let step = 1; step <= 10; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(12 + step * 2.4, (step / 10) * 0.6) })
    }
    // One finger lifts, the other wanders, then lifts: nothing more happens.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: fingers(36, 0.6).slice(1) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...fingers(36, 0.6)[1]!, x: cx + 60 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }

  // With Graphics, the first finger drags the mark; the pinch puts it back where it was.
  await pinch({ on: before })
  await expect.poll(async () => (await mark())!.scale, { timeout: 30_000 }).toBeGreaterThan(before.scale * 2)
  const pinched = (await mark())!
  // Fingers turning clockwise on screen turn the mark clockwise (layer rotation runs anticlockwise).
  expect(pinched.rotation).toBeCloseTo(before.rotation - 0.6, 1)
  expect(pinched.x).toBeCloseTo(before.x, 3)
  expect(pinched.y).toBeCloseTo(before.y, 3)

  // The whole pinch is one undo step.
  await page.getByRole('button', { name: 'Undo' }).first().click()
  await expect.poll(async () => (await mark())!.scale, { timeout: 30_000 }).toBeCloseTo(before.scale, 3)
  expect((await mark())!.rotation).toBeCloseTo(before.rotation, 3)
  await page.getByRole('button', { name: 'Redo' }).first().click()
  await expect.poll(async () => (await mark())!.scale, { timeout: 30_000 }).toBeCloseTo(pinched.scale, 3)

  // With Draw, the first finger's stroke is dropped: the pinch leaves no line.
  await chooseTool({ page, tool: 'Draw' })
  await showPanels({ page })
  await pinch({ on: pinched })
  await expect.poll(async () => (await mark())!.rotation, { timeout: 30_000 }).toBeCloseTo(pinched.rotation - 0.6, 1)
  expect(await savedStrokes({ page })).toHaveLength(0)
})

test('a graphic held and dragged from the library by a finger lands where it is let go on the cloth', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch-drop' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Graphics' })

  const stage = page.locator('canvas[aria-describedby="studio-scene-description"]')
  const tile = page.locator('button[draggable="true"]').first()
  await tile.scrollIntoViewIfNeeded()
  // Where the front's middle is on screen, through the canvas's own lookup.
  // The model may still be loading on a slow device: look until it's there.
  const findFront = () => stage.evaluate((node) => {
    type Probe = (clientX: number, clientY: number) => { panel: string; x: number; y: number } | null
    const probe = (node as HTMLCanvasElement & { flvPanelPointAt?: Probe }).flvPanelPointAt!
    const rect = node.getBoundingClientRect()
    let best: { x: number; y: number; panelX: number; panelY: number; distance: number } | null = null

    for (let row = 0; row <= 40; row += 1) {
      for (let column = 0; column <= 40; column += 1) {
        const x = rect.left + (rect.width * column) / 40
        const y = rect.top + (rect.height * row) / 40
        const point = probe(x, y)

        if (point?.panel !== 'front') {
          continue
        }

        const distance = Math.hypot(point.x - 0.5, point.y - 0.45)

        if (!best || distance < best.distance) {
          best = { x, y, panelX: point.x, panelY: point.y, distance }
        }
      }
    }

    return best
  })
  await expect.poll(async () => (await findFront())?.distance ?? 1, { timeout: 30_000 }).toBeLessThan(0.1)
  const target = await findFront()
  const from = (await tile.boundingBox())!
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }

  // Hold, then drag: a finger that moved before the hold would be scrolling.
  const cdp = await page.context().newCDPSession(page)
  const at = (x: number, y: number) => [{ x, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(start.x, start.y) })
  await page.waitForTimeout(500)
  await expect(page.locator('[data-graphic-ghost]')).toHaveCount(1)
  for (let step = 1; step <= 16; step += 1) {
    const t = step / 16
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(start.x + (target!.x - start.x) * t, start.y + (target!.y - start.y) * t),
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await expect(page.locator('[data-graphic-ghost]')).toHaveCount(0)

  const placed = async () => {
    await expectSaved({ page })
    const designId = new URL(page.url()).searchParams.get('cloud')!
    return page.evaluate(async (id) => {
      const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
      const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const { head } = await response.json()
      type Layer = { kind: string; x: number; y: number }
      return (head.content.panels.front.layers as Layer[]).filter((layer) => layer.kind === 'image').map(({ x, y }) => ({ x, y }))
    }, designId)
  }
  await expect.poll(async () => (await placed()).length, { timeout: 30_000 }).toBe(1)
  const [mark] = await placed()
  expect(mark!.x).toBeCloseTo(target!.panelX, 1)
  expect(mark!.y).toBeCloseTo(target!.panelY, 1)
})

test('on a phone the camera views fit one row on Design, and a two-finger turn lets go of a held side', async ({ page }) => {
  // Review of #406: the views now show on the phone Design step, so they must
  // not wrap over the garment; and Draw's two-finger turn must let go of
  // Back as a one-finger drag does, instead of springing back.
  test.setTimeout(150_000)
  const email = newEmail({ label: 'touch-held-turn' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).tap()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Draw' })

  const camera = page.getByRole('radiogroup', { name: 'Camera' })
  await expect(camera).toBeVisible()
  const fit = await camera.evaluate((bar) => ({ height: bar.getBoundingClientRect().height, overflow: bar.scrollWidth - bar.clientWidth }))
  // One row of 44 px buttons, not two, and nothing scrolled out of sight.
  expect(fit.height).toBeLessThan(80)
  expect(fit.overflow).toBeLessThanOrEqual(0)

  await camera.getByRole('radio', { name: 'Back', exact: true }).tap()
  await expect(camera.getByRole('radio', { name: 'Back', exact: true })).toHaveAttribute('aria-checked', 'true')

  // Two fingers side by side, moved together across the garment.
  const stage = (await page.locator('canvas[aria-describedby="studio-scene-description"]').boundingBox())!
  const cx = stage.x + stage.width / 2
  const cy = stage.y + stage.height / 2
  const cdp = await page.context().newCDPSession(page)
  const fingers = (shift: number) => [
    { x: cx - 20 + shift, y: cy, id: 1 },
    { x: cx + 20 + shift, y: cy, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(-40) })
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(-40 + step * 8) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()

  await expect(camera.getByRole('radio', { name: 'Orbit', exact: true })).toHaveAttribute('aria-checked', 'true')
  // Two fingers turn; they never draw.
  for (const panel of ['front', 'back'] as const) {
    expect(await savedStrokes({ page, panel })).toHaveLength(0)
  }
})
