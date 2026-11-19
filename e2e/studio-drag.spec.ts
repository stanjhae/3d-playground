import { type Locator, type Page, expect, test } from '@playwright/test'

import { type PlaceableLayer, canvasLayerFrame, rotateHandleBelow } from '../src/lib/layer-hit'
import { SELECTION_COLOR } from '../src/lib/selection-chrome'
import { currentTemplateFor } from '../src/lib/template-manifest'
import { chooseTool, deleteAccounts, expectSaved, newEmail, panelCanvas, signIn, graphicTile } from './helpers'

/**
 * Drag-and-drop in the studio (S-B): a mark dragged on the 3D cloth, across
 * a seam onto a sleeve, dropped from the library onto a panel and onto the
 * cloth, dragged on a sleeve panel and past its edge, rotated near the top
 * of a panel, and an undo in the middle of a drag.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type PanelKey = 'front' | 'back' | 'left' | 'right'
type Layer = { id: string; kind: string; x: number; y: number; scale: number; rotation: number }
type Head = { content: { panels: Record<string, { layers: Layer[] }> } }
type Spot = { x: number; y: number }

const STAGE = 'canvas[aria-describedby="studio-scene-description"]'

async function openDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Graphics' })
}

async function savedHead({ page }: { page: Page }): Promise<Head> {
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head
  }, designId)
}

async function images({ page, panel = 'front' }: { page: Page; panel?: PanelKey }) {
  return (await savedHead({ page })).content.panels[panel]!.layers.filter((layer) => layer.kind === 'image')
}

function saved<T>(read: () => Promise<T>) {
  return expect.poll(read, { timeout: 20_000 })
}

/** Adds the cross by tapping its tile: it lands mid-front, selected. */
async function addCross({ page }: { page: Page }) {
  await graphicTile({ page, label: 'Simple Cross' }).click()
  await saved(async () => (await images({ page })).length).toBe(1)
  return (await images({ page }))[0]!
}

/** Where a panel point is on the 3D view, found through the canvas's own lookup. */
async function onCloth({ page, panel, x, y }: { page: Page; panel: PanelKey; x: number; y: number }) {
  const found = await page.locator(STAGE).evaluate(
    (node, want) => {
      type Probe = (clientX: number, clientY: number) => { panel: string; x: number; y: number } | null
      const probe = (node as HTMLCanvasElement & { flvPanelPointAt?: Probe }).flvPanelPointAt
      const rect = node.getBoundingClientRect()
      let best: { x: number; y: number; distance: number } | null = null

      if (!probe) {
        return null
      }

      const look = (left: number, top: number, width: number, height: number, steps: number) => {
        for (let row = 0; row <= steps; row += 1) {
          for (let column = 0; column <= steps; column += 1) {
            const clientX = left + (width * column) / steps
            const clientY = top + (height * row) / steps
            const point = probe(clientX, clientY)

            if (point?.panel !== want.panel) {
              continue
            }

            const distance = Math.hypot(point.x - want.x, point.y - want.y)

            if (!best || distance < best.distance) {
              best = { x: clientX, y: clientY, distance }
            }
          }
        }
      }

      look(rect.left, rect.top, rect.width, rect.height, 48)
      const coarse = best as { x: number; y: number } | null

      if (coarse) {
        look(coarse.x - rect.width / 40, coarse.y - rect.height / 40, rect.width / 20, rect.height / 20, 16)
      }

      return best
    },
    { panel, x, y },
  )

  expect(found, `${panel} ${x},${y} on the 3D view`).not.toBeNull()
  expect(found!.distance, `${panel} ${x},${y} on the 3D view`).toBeLessThan(0.05)
  return { x: found!.x, y: found!.y }
}

/** The panel point under a screen point on the 3D view. */
async function clothAt({ page, at }: { page: Page; at: Spot }) {
  return page.locator(STAGE).evaluate((node, spot) => {
    type Probe = (clientX: number, clientY: number) => { panel: string; x: number; y: number } | null
    return (node as HTMLCanvasElement & { flvPanelPointAt?: Probe }).flvPanelPointAt?.(spot.x, spot.y) ?? null
  }, at)
}

async function drag({ page, from, to, steps = 16, during }: { page: Page; from: Spot; to: Spot; steps?: number; during?: () => Promise<void> }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: Math.ceil(steps / 2) })
  await during?.()
  await page.mouse.move(to.x, to.y, { steps: Math.ceil(steps / 2) })
  await page.mouse.up()
}

/** A panel point on the 2D canvas, in screen pixels (panel y runs bottom-up). */
async function onPanel({ canvas, x, y }: { canvas: Locator; x: number; y: number }) {
  const box = (await canvas.boundingBox())!
  return { x: box.x + box.width * x, y: box.y + box.height * (1 - y) }
}

test('a mark dragged on the 3D cloth follows the pointer, and the view holds still', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'drag3d' })
  const start = await addCross({ page })
  const from = await onCloth({ page, panel: 'front', x: start.x, y: start.y })
  const to = await onCloth({ page, panel: 'front', x: 0.3, y: 0.35 })
  // A fixed screen point reads the same cloth before and after: the view didn't turn.
  const watch = { x: (from.x + to.x) / 2, y: from.y }
  const before = await clothAt({ page, at: watch })

  await drag({ page, from, to })

  await saved(async () => (await images({ page }))[0]!.x).toBeLessThan(start.x - 0.1)
  const moved = (await images({ page }))[0]!
  expect(moved.x).toBeCloseTo(0.3, 1)
  expect(moved.y).toBeLessThan(start.y - 0.05)
  expect(moved.scale).toBe(start.scale)
  expect(await clothAt({ page, at: watch })).toEqual(before)
})

test('a mark dragged on the cloth keeps moving off the garment, pinned to its panel edge', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'drag3doff' })
  const start = await addCross({ page })
  const from = await onCloth({ page, panel: 'front', x: start.x, y: start.y })
  const stage = (await page.locator(STAGE).boundingBox())!

  // Straight up, past the collar and off the top of the garment.
  await drag({ page, from, to: { x: from.x, y: stage.y + 4 }, steps: 24 })

  // It followed the pointer past the cloth's top and is pinned there, still on the front.
  await saved(async () => (await images({ page }))[0]?.y ?? 0).toBeGreaterThan(0.9)
  expect((await images({ page }))[0]!.scale).toBe(start.scale)
})

test('a mark dragged across a seam from the front onto a sleeve moves to the sleeve, in one undo step', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'drag3dsleeve' })
  const start = await addCross({ page })
  const from = await onCloth({ page, panel: 'front', x: start.x, y: start.y })
  // Whichever sleeve the opening view shows best.
  const sleeve = await page.locator(STAGE).evaluate((node) => {
    type Probe = (clientX: number, clientY: number) => { panel: string } | null
    const probe = (node as HTMLCanvasElement & { flvPanelPointAt?: Probe }).flvPanelPointAt!
    const rect = node.getBoundingClientRect()
    const counts: Record<string, number> = {}

    for (let row = 0; row <= 40; row += 1) {
      for (let column = 0; column <= 40; column += 1) {
        const panel = probe(rect.left + (rect.width * column) / 40, rect.top + (rect.height * row) / 40)?.panel

        if (panel === 'left' || panel === 'right') {
          counts[panel] = (counts[panel] ?? 0) + 1
        }
      }
    }

    return (counts.left ?? 0) >= (counts.right ?? 0) ? 'left' : 'right'
  })
  const to = await onCloth({ page, panel: sleeve as PanelKey, x: 0.5, y: 0.5 })

  await drag({ page, from, to, steps: 40 })

  // Saved under the sleeve's own (wearer) key, which the render panel maps to.
  const sleeves = async () => {
    const panels = (await savedHead({ page })).content.panels
    return ['left', 'right'].filter((key) => panels[key]!.layers.some((layer) => layer.kind === 'image'))
  }
  await saved(sleeves).toHaveLength(1)
  expect(await images({ page })).toHaveLength(0)

  // One undo puts it back where it was on the front.
  await page.keyboard.press('ControlOrMeta+z')
  await saved(async () => (await images({ page })).length).toBe(1)
  expect((await images({ page }))[0]!.x).toBeCloseTo(start.x, 3)
  expect(await sleeves()).toEqual([])
})

/**
 * A library tile dragged by mouse to a point on the page, in small steps as a
 * hand moves. Playwright's `dragTo` jumps there in one move straight after the
 * press, and Chromium then sometimes never starts the HTML5 drag (a mouse down
 * on the tile, a mouse up on the panel, no dragstart): that made this test
 * fail about one run in three.
 */
async function dragTile({ page, tile, to }: { page: Page; tile: Locator; to: { x: number; y: number } }) {
  await tile.scrollIntoViewIfNeeded()
  const from = (await tile.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 16 })
  await page.mouse.up()
}

test('a graphic dragged from the library lands where it is dropped, on a panel and on the cloth', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'libdrop' })
  const tile = graphicTile({ page, label: 'Simple Cross' })
  // Scrolled first, so the points measured below don't move under the drag.
  await tile.scrollIntoViewIfNeeded()
  const front = panelCanvas({ page, panel: 'Front' })
  const box = (await front.boundingBox())!

  await dragTile({ page, tile, to: { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 } })
  await saved(async () => (await images({ page })).length).toBe(1)
  const onTheFlat = (await images({ page }))[0]!
  expect(onTheFlat.x).toBeCloseTo(0.3, 1)
  expect(onTheFlat.y).toBeCloseTo(0.6, 1)

  const target = await onCloth({ page, panel: 'front', x: 0.7, y: 0.3 })
  await dragTile({ page, tile, to: target })
  await saved(async () => (await images({ page })).length).toBe(2)
  const onTheCloth = (await images({ page })).find((layer) => layer.id !== onTheFlat.id)!
  expect(onTheCloth.x).toBeCloseTo(0.7, 1)
  expect(onTheCloth.y).toBeCloseTo(0.3, 1)
})

test('an undo in the middle of a drag ends the drag; letting go puts nothing back', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'undodrag' })
  const start = await addCross({ page })
  const front = panelCanvas({ page, panel: 'Front' })

  // A first move, its own undo step.
  await drag({ page, from: await onPanel({ canvas: front, x: start.x, y: start.y }), to: await onPanel({ canvas: front, x: 0.3, y: start.y }) })
  await saved(async () => (await images({ page }))[0]!.x).toBeLessThan(0.4)
  const first = (await images({ page }))[0]!

  // A second drag, undone half-way: the first move is undone and the rest of
  // the drag does nothing.
  await drag({
    page,
    from: await onPanel({ canvas: front, x: first.x, y: first.y }),
    to: await onPanel({ canvas: front, x: 0.75, y: 0.3 }),
    during: async () => {
      await page.keyboard.press('ControlOrMeta+z')
    },
  })

  await saved(async () => (await images({ page }))[0]!.x).toBeCloseTo(start.x, 3)
  expect((await images({ page }))[0]!.y).toBeCloseTo(start.y, 3)
  // Redo is still there: the drag never became a new step.
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await saved(async () => (await images({ page }))[0]!.x).toBeCloseTo(first.x, 3)
})

test('a mark on a sleeve panel drags, and stays on the sleeve pinned to its edge when dragged past it', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'sleevedrag' })
  const sleeve = panelCanvas({ page, panel: 'Right sleeve' })
  const box = (await sleeve.boundingBox())!
  // Picks the sleeve, then a tapped graphic lands on it.
  await page.mouse.click(box.x + 4, box.y + 4)
  await expect(sleeve).toHaveAttribute('aria-label', /, active$/)
  await graphicTile({ page, label: 'Simple Cross' }).click()
  await saved(async () => (await images({ page, panel: 'right' })).length).toBe(1)
  const start = (await images({ page, panel: 'right' }))[0]!

  await drag({ page, from: await onPanel({ canvas: sleeve, x: start.x, y: start.y }), to: await onPanel({ canvas: sleeve, x: start.x - 0.2, y: start.y }) })
  await saved(async () => (await images({ page, panel: 'right' }))[0]!.x).toBeLessThan(start.x - 0.1)
  const moved = (await images({ page, panel: 'right' }))[0]!

  // Far past the right edge of the sleeve panel, onto empty page.
  const edge = await onPanel({ canvas: sleeve, x: moved.x, y: moved.y })
  await drag({ page, from: edge, to: { x: box.x + box.width + 400, y: edge.y } })
  await saved(async () => (await images({ page, panel: 'right' }))[0]!.x).toBe(1)
  expect(await images({ page })).toHaveLength(0)
})

test('near the top of a panel the rotate handle sits below the mark and turns it', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'rotatetop' })
  await addCross({ page })
  const y = page.getByRole('textbox', { name: 'Position Y, percent of panel' })
  await y.fill('95')
  await y.press('Enter')
  await saved(async () => (await images({ page }))[0]!.y).toBeCloseTo(0.95)
  const top = (await images({ page }))[0]!
  const front = panelCanvas({ page, panel: 'Front' })

  // The handle is drawn below the mark, in the selection colour, and that is where a press takes it.
  const size = await front.evaluate((node) => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }))
  const region = Object.values(currentTemplateFor({ templateId: 'tee-crew-short' }).regions).find((entry) => entry.renderPanel === 'front')!
  const layer = { ...top, kind: 'graphic', panel: 'front', surface: { ...region.surface, uv: { ...region.uv } } } as unknown as PlaceableLayer
  expect(rotateHandleBelow({ layer })).toBe(true)
  const frame = canvasLayerFrame({ layer, ...size })
  const pixel = { x: frame.x, y: frame.y + frame.height / 2 + frame.rotateGap }
  const drawn = await front.evaluate(
    (node, at) => Array.from((node as HTMLCanvasElement).getContext('2d')!.getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data).slice(0, 3),
    pixel,
  )
  const selection = [1, 3, 5].map((index) => Number.parseInt(SELECTION_COLOR.slice(index, index + 2), 16))
  drawn.forEach((value, index) => expect(Math.abs(value - selection[index]!)).toBeLessThan(12))
  const box = (await front.boundingBox())!
  const grab = { x: box.x + (pixel.x / size.width) * box.width, y: box.y + (pixel.y / size.height) * box.height }

  await drag({ page, from: grab, to: { x: grab.x + 50, y: grab.y - 10 } })
  await saved(async () => (await images({ page }))[0]!.rotation).not.toBe(top.rotation)
  expect((await images({ page }))[0]!.y).toBeCloseTo(0.95)
})
