import { expect, test, type Locator, type Page } from '@playwright/test'

import { createCrossFlameDemoDocument } from '../src/lib/cross-flame-demo'
import { LANDING_HANDOFF_KEY } from '../src/lib/landing-handoff'

/**
 * The landing demo after the founder's feedback (17 Nov): ink reaches the
 * whole tee (the hem, the sleeves), a logo stays editable once it's down
 * (pick, move, resize, remove), and a drag turns the tee after a side was
 * picked. Since the 18 Nov audit it also works by touch (one finger turns
 * or draws, two fingers turn, a tap picks a logo and a long press moves
 * it), a graphic lands where it's dropped, and the pad follows the side a
 * hand turn shows. The mouse tests skip the touch projects, and the touch
 * tests the desktop one.
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
  // A touch screen loads the scene when asked.
  const spin = page.getByRole('button', { name: 'Spin it in 3D' })

  if (await spin.isVisible()) {
    await spin.click()
  }

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

/**
 * Start creating hands the sketch over; read it as the studio will. Signed
 * out, the studio opens at once and takes the hand-off out of storage as it
 * loads, so it is read as it is written: the link navigates in the page, so
 * the copy kept on `window` survives.
 */
async function handoffLayers(page: Page) {
  await page.evaluate((key) => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (this: Storage, name: string, value: string) {
      if (this === sessionStorage && name === key) {
        ;(window as { handedOff?: string }).handedOff = value
      }

      write.call(this, name, value)
    }
  }, LANDING_HANDOFF_KEY)
  await page.getByRole('link', { name: 'Start creating' }).first().click()
  await expect.poll(() => page.evaluate(() => (window as { handedOff?: string }).handedOff ?? null)).not.toBeNull()
  const handoff = await page.evaluate(() => JSON.parse((window as { handedOff?: string }).handedOff!))
  return handoff.document.layers as HandoffLayer[]
}

const crowns = (layers: HandoffLayer[]) => layers.filter((layer) => layer.kind === 'graphic' && layer.src?.endsWith('logo-crown.svg'))

test.describe('with a mouse', () => {
  test.skip(({ hasTouch }) => hasTouch, 'Mouse journeys; the touch ones are below.')

  test('ink reaches the hem on the tee and the whole sleeve on the pad', async ({ page }) => {
    const { dock, at } = await openHero(page)

    // Draw straight on the 3D tee, from mid-front down past the hem.
    await dock.getByRole('button', { name: 'Draw', exact: true }).click()
    await expect(page.locator('[data-drag-hint]')).toBeHidden()
    await drag(page, await at(0.5, 0.6), await at(0.5, 0.88))

    // A sleeve on the pad: the pad is the sleeve's shape, top to bottom.
    await dock.getByRole('button', { name: 'Left sleeve', exact: true }).click()
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

  test('a graphic lands where it is dropped on the tee, on the side a hand turn shows', async ({ page }) => {
    const { dock, stage, at } = await openHero(page)
    const back = dock.getByRole('button', { name: 'Back', exact: true })

    // Said on the page, not only in a tooltip; and no stale badge.
    await expect(dock.locator('[data-graphics-caption]')).toHaveText('Drag onto the tee or the pad')
    await expect(dock.getByText('Concept preview')).toHaveCount(0)

    // A little turn by hand from the back keeps the pad on the back (it used to snap to the front).
    await back.click()
    await expect(dock).toContainText('It lands on the back of the tee.')
    // From beside the tee: the back carries the demo's crown, which a press would pick.
    await drag(page, await at(0.08, 0.3), await at(0.14, 0.3))
    await expect(back).toHaveAttribute('aria-pressed', 'false')
    await expect(dock).toContainText('It lands on the back of the tee.')

    const target = await at(0.42, 0.45)
    const probed = await stage
      .locator('canvas')
      .evaluate(
        (node, point) =>
          (node as HTMLCanvasElement & { flvPanelPointAt?: (x: number, y: number) => { panel: string } | null }).flvPanelPointAt?.(
            point.x,
            point.y,
          ) ?? null,
        target,
      )
    expect(probed?.panel).toBe('back')

    // Drag the crown over (the browser's own drag events): both places it can go show a dashed outline.
    const tile = dock.getByRole('button', { name: 'Add Crown' })
    const transfer = await page.evaluateHandle(() => new DataTransfer())
    await tile.dispatchEvent('dragstart', { dataTransfer: transfer })
    await expect(page.locator('[data-drop-target]')).toHaveCount(2)
    await page.evaluate(
      ({ dataTransfer, point }) => {
        const under = document.elementFromPoint(point.x, point.y)!
        const init = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, dataTransfer }
        under.dispatchEvent(new DragEvent('dragover', init))
        under.dispatchEvent(new DragEvent('drop', init))
      },
      { dataTransfer: transfer, point: target },
    )
    await tile.dispatchEvent('dragend', { dataTransfer: transfer })
    await expect(page.locator('[data-drop-target]')).toHaveCount(0)
    await expect(dock.locator('[data-logo-selected]')).toBeVisible()

    const [crown] = crowns(await handoffLayers(page)).filter((layer) => layer.id.startsWith('mark-'))
    expect(crown?.panel).toBe('back')
    // Under the pointer, not the side's middle (0.5, 0.48).
    expect(Math.abs(crown!.x! - 0.5) + Math.abs(crown!.y! - 0.48)).toBeGreaterThan(0.04)
  })

  test("ink drawn on the back and each sleeve shows on the tee's own side", async ({ page }) => {
    test.setTimeout(150_000)
    const { dock, stage } = await openHero(page)
    const pad = dock.locator('canvas')

    async function show(view: string) {
      await dock.getByRole('button', { name: view, exact: true }).click()
      await stage.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1_200)
      return inkCounts({ page, stage })
    }

    async function scribble(ink: string) {
      await dock.getByRole('button', { name: `${ink} ink` }).click()
      const box = (await pad.boundingBox())!

      for (const y of [0.12, 0.3, 0.48, 0.66, 0.84]) {
        await drag(page, { x: box.x + box.width * 0.04, y: box.y + box.height * y }, { x: box.x + box.width * 0.96, y: box.y + box.height * y })
      }
    }

    const views = ['Front', 'Back', 'Right sleeve', 'Left sleeve'] as const
    const opposite = { Front: 'Back', Back: 'Front', 'Right sleeve': 'Left sleeve', 'Left sleeve': 'Right sleeve' } as const
    const sides = [
      { view: 'Back', ink: 'Meadow', key: 'meadow' },
      { view: 'Left sleeve', ink: 'Brass', key: 'brass' },
      { view: 'Right sleeve', ink: 'Oxblood', key: 'oxblood' },
    ] as const

    async function everyView() {
      const counts: Partial<Record<(typeof views)[number], Awaited<ReturnType<typeof inkCounts>>>> = {}
      for (const view of views) counts[view] = await show(view)
      return counts as Record<(typeof views)[number], Awaited<ReturnType<typeof inkCounts>>>
    }

    for (const side of sides) {
      // Each side's ink is new to the tee, so what each view gains is that ink alone
      // (the front's own print has reds and golds of its own).
      const before = await everyView()
      await show(side.view)
      await scribble(side.ink)
      const after = await everyView()
      const gain = Object.fromEntries(views.map((view) => [view, after[view][side.key] - before[view][side.key]])) as Record<
        (typeof views)[number],
        number
      >
      const label = `${side.ink} on the ${side.view}: ${JSON.stringify(gain)}`

      // It shows on the side drawn on, most there, and not on the side opposite.
      expect(gain[side.view], label).toBeGreaterThan(300)
      expect(Math.max(...views.map((view) => gain[view])), label).toBe(gain[side.view])
      expect(gain[opposite[side.view]], label).toBeLessThan(gain[side.view] / 2)
    }
  })

  test('a 3D preview that never loads gives way to the still picture', async ({ page }) => {
    await page.clock.install()
    // The scene's code never arrives.
    await page.route(/LandingCloth/, () => {})
    await page.goto('/')
    await page.locator('[data-hero-dock]').getByRole('button', { name: 'Front', exact: true }).click()
    await expect(page.getByText('Loading 3D…')).toBeVisible()

    await page.clock.fastForward(16_000)
    await expect(page.getByRole('status').filter({ hasText: 'took too long to load' })).toBeVisible()
    await expect(page.getByText('Loading 3D…')).toHaveCount(0)
    await expect(page.locator('.flv-stage img').first()).toBeVisible()
  })
})

/** Pixels of each test ink in a picture of the live tee. */
async function inkCounts({ page, stage }: { page: Page; stage: Locator }) {
  const picture = (await stage.screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const counts = { meadow: 0, brass: 0, oxblood: 0 }

    for (let at = 0; at < pixels.length; at += 4) {
      const [r, g, b] = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]
      counts.meadow += g > r + 8 && g > b + 25 && g < 170 ? 1 : 0
      counts.brass += r > g + 15 && g > b + 40 && r > 120 ? 1 : 0
      counts.oxblood += r > g + 45 && r > b + 30 && r < 170 && g < 70 ? 1 : 0
    }

    return counts
  }, picture)
}

type Finger = { x: number; y: number; id?: number }

/** Touches sent through CDP, so the browser makes its own pointer events (and scrolls). */
async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const points = (list: Finger[]) => list.map((point, index) => ({ x: point.x, y: point.y, id: point.id ?? index }))

  return {
    down: (list: Finger[]) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(list) }),
    move: (list: Finger[]) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(list) }),
    up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    /** Each finger from its start to its end, in steps. */
    async swipe(paths: { from: Finger; to: Finger }[], steps = 12) {
      await this.down(paths.map((path) => path.from))

      for (let step = 1; step <= steps; step += 1) {
        await this.move(
          paths.map((path) => ({
            x: path.from.x + ((path.to.x - path.from.x) * step) / steps,
            y: path.from.y + ((path.to.y - path.from.y) * step) / steps,
          })),
        )
      }

      await this.up()
    },
  }
}

const turnedBy = async (canvas: Locator, before: number) => {
  const after = Number(await canvas.getAttribute('data-camera-azimuth'))
  return Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)))
}

test.describe('by touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'Touch journeys; the mouse ones are above.')

  test('one finger turns the tee, a tap picks a logo and a long press moves it', async ({ page }) => {
    // Each finger move waits for the page, and a dragged logo redraws the
    // tee's print every move: on CI's software WebGL that took the 12-step
    // drag past 90 s, though the whole test takes ~22 s with a GPU.
    test.setTimeout(150_000)
    const { dock, stage, at } = await openHero(page)
    const canvas = stage.locator('canvas')
    const touch = await fingers(page)
    const selected = dock.locator('[data-logo-selected]')

    // Live, the tee takes touches, and the Turn/Draw toggle is there with what a finger does.
    await expect(dock.getByRole('button', { name: 'Turn', exact: true })).toBeVisible()
    await expect(dock.locator('[data-touch-hint]')).toContainText('Swipe sideways to turn it')
    expect(await stage.evaluate((element) => getComputedStyle(element).pointerEvents)).not.toBe('none')

    const before = Number(await canvas.getAttribute('data-camera-azimuth'))
    await touch.swipe([{ from: await at(0.25, 0.5), to: await at(0.7, 0.52) }])
    await expect.poll(() => turnedBy(canvas, before)).toBeGreaterThan(0.3)

    // A new logo comes in picked; a tap off the tee lets go, a tap on it picks it again.
    await dock.getByRole('button', { name: 'Front', exact: true }).click()
    await dock.getByRole('button', { name: 'Add Crown' }).click()
    await expect(selected).toBeVisible()
    const off = await at(0.06, 0.94)
    await touch.down([off])
    await touch.up()
    await expect(selected).toBeHidden()
    const crown = await at(0.485, 0.56)
    await touch.down([crown])
    await touch.up()
    await expect(selected).toBeVisible()

    // Hold, then drag: the logo moves and the tee stays still.
    const held = Number(await canvas.getAttribute('data-camera-azimuth'))
    await touch.down([crown])
    await page.waitForTimeout(500)
    const to = await at(0.585, 0.62)

    for (let step = 1; step <= 4; step += 1) {
      await touch.move([{ x: crown.x + ((to.x - crown.x) * step) / 4, y: crown.y + ((to.y - crown.y) * step) / 4 }])
    }

    await touch.up()
    expect(await turnedBy(canvas, held)).toBeLessThan(0.05)

    const [layer] = crowns(await handoffLayers(page)).filter((entry) => entry.id.startsWith('mark-'))
    expect(layer?.panel).toBe('front')
    expect(Math.abs(layer!.x! - 0.5) + Math.abs(layer!.y! - 0.48)).toBeGreaterThan(0.05)
  })

  test('in Draw one finger draws on the tee and two fingers turn it, with no stray line', async ({ page }) => {
    const { dock, stage, at } = await openHero(page)
    const canvas = stage.locator('canvas')
    const touch = await fingers(page)

    await dock.getByRole('button', { name: 'Draw', exact: true }).click()
    await expect(dock.locator('[data-touch-hint]')).toContainText('Two fingers turn it')
    await touch.swipe([{ from: await at(0.5, 0.6), to: await at(0.5, 0.82) }])

    const before = Number(await canvas.getAttribute('data-camera-azimuth'))
    await touch.swipe([
      { from: await at(0.4, 0.5), to: await at(0.7, 0.5) },
      { from: await at(0.55, 0.62), to: await at(0.85, 0.62) },
    ])
    await expect.poll(() => turnedBy(canvas, before)).toBeGreaterThan(0.3)

    const layers = await handoffLayers(page)
    const strokes = layers.filter((layer) => layer.kind === 'paint').flatMap((layer) => layer.strokes ?? [])
    // The demo's own ink, plus the one line drawn on the front: the two-finger turn left none.
    expect(strokes.at(-1)?.panel).toBe('front')
    expect(strokes.length - DEMO_STROKES).toBe(1)
  })

  test('in Turn a vertical swipe on the tee still scrolls the page', async ({ page }) => {
    const { at } = await openHero(page)
    const touch = await fingers(page)
    const before = await page.evaluate(() => window.scrollY)
    await touch.swipe([{ from: await at(0.5, 0.8), to: await at(0.5, 0.2) }], 8)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 40)
  })
})

/** How many strokes the untouched demo design carries. */
const DEMO_STROKES = createCrossFlameDemoDocument()
  .layers.filter((layer) => layer.kind === 'paint')
  .flatMap((layer) => (layer.kind === 'paint' ? layer.strokes : [])).length
