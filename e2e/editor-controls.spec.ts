import { type Page, expect, test } from '@playwright/test'

import { type PlaceableLayer, canvasLayerFrame } from '../src/lib/layer-hit'
import { INK_COLORS } from '../src/lib/paint-colors'
import { SELECTION_COLOR } from '../src/lib/selection-chrome'
import { CURRENT_TEMPLATE } from '../src/lib/template-manifest'
import { deleteAccounts, drawStroke, expectSaved, newEmail, panelCanvas, signIn } from './helpers'

/**
 * What the editor's controls do on screen, not only in the saved document
 * (R03, R05, R06, R14). Each check reads the 2D panel's own pixels.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Panel = 'Front' | 'Back' | "Wearer's right" | "Wearer's left"
type Stroke = { color: string; width: number; opacity: number }
type Layer = {
  id: string
  kind: string
  x: number
  y: number
  scale: number
  rotation: number
  color?: string
  content?: string
  face?: string
  aspect?: number
  strokes?: Stroke[]
}
type Head = { seq: number; content: { panels: Record<string, { layers: Layer[] }> } }

const PANEL_KEY: Record<Panel, string> = { Front: 'front', Back: 'back', "Wearer's right": 'right', "Wearer's left": 'left' }
const PANELS = Object.keys(PANEL_KEY) as Panel[]
const color = (name: string) => INK_COLORS.find((ink) => ink.name === name)!.value

async function openDesign({ page, label, tech = true }: { page: Page; label: string; tech?: boolean }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  if (tech) {
    await page.getByRole('radio', { name: 'Tech' }).click()
  }
}

async function savedHead({ page }: { page: Page }): Promise<Head> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head
  }, designId)
}

async function layers({ page, panel = 'Front', kind }: { page: Page; panel?: Panel; kind: string }) {
  return (await savedHead({ page })).content.panels[PANEL_KEY[panel]]!.layers.filter((layer) => layer.kind === kind)
}

/** Waits until the saved document says what the screen should already show. */
function saved<T>({ read, timeout = 20_000 }: { read: () => Promise<T>; timeout?: number }) {
  return expect.poll(read, { timeout })
}

/** Makes `panel` active by pressing an empty corner of it. */
async function activate({ page, panel }: { page: Page; panel: Panel }) {
  const box = (await panelCanvas({ page, panel }).boundingBox())!
  await page.mouse.click(box.x + 4, box.y + 4)
  await expect(panelCanvas({ page, panel })).toHaveAttribute('aria-label', /, active$/)
}

async function addWord({ page, word }: { page: Page; word: string }) {
  const type = page.getByPlaceholder('Type')
  await type.fill(word)
  await type.press('Enter')
}

/** How the panel's pixels look: changed from the paper colour, matching `match`, and the darkest found. */
async function panelPixels({ page, panel, match }: { page: Page; panel: Panel; match?: string }) {
  return panelCanvas({ page, panel }).evaluate((node, hex) => {
    const canvas = node as HTMLCanvasElement
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const paper = [data[0]!, data[1]!, data[2]!]
    const wanted = hex ? [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) : null
    let [changed, matching, darkest] = [0, 0, 255]

    for (let at = 0; at < data.length; at += 4) {
      const rgb = [data[at]!, data[at + 1]!, data[at + 2]!]
      changed += rgb.some((value, index) => Math.abs(value - paper[index]!) > 12) ? 1 : 0
      matching += wanted && rgb.every((value, index) => Math.abs(value - wanted[index]!) < 12) ? 1 : 0
      darkest = Math.min(darkest, (rgb[0]! + rgb[1]! + rgb[2]!) / 3)
    }

    return { changed, matching, darkest, picture: canvas.toDataURL() }
  }, match)
}

/** Where a selected layer's handles are drawn, in canvas pixels and on screen. */
async function handles({ page, layer, panel = 'Front' }: { page: Page; layer: Layer; panel?: Panel }) {
  const locator = panelCanvas({ page, panel })
  const box = (await locator.boundingBox())!
  const size = await locator.evaluate((node) => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }))
  // The panel draws an uploaded image as the editor's own "graphic" kind.
  const kind = layer.kind === 'image' ? 'graphic' : layer.kind
  const surface = Object.values(CURRENT_TEMPLATE.regions).find((region) => region.renderPanel === PANEL_KEY[panel])!.surface
  const frame = canvasLayerFrame({ layer: { ...layer, kind, surface, panel: PANEL_KEY[panel] } as unknown as PlaceableLayer, ...size })
  const pixels = {
    body: { x: frame.x, y: frame.y },
    scale: { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 },
    rotate: { x: frame.x, y: frame.y - frame.height / 2 - frame.rotateGap },
  }
  const screen = (point: { x: number; y: number }) => ({
    x: box.x + (point.x / size.width) * box.width,
    y: box.y + (point.y / size.height) * box.height,
  })
  return { pixels, body: screen(pixels.body), scale: screen(pixels.scale), rotate: screen(pixels.rotate) }
}

async function pixelAt({ page, panel = 'Front', point }: { page: Page; panel?: Panel; point: { x: number; y: number } }) {
  return panelCanvas({ page, panel }).evaluate(
    (node, at) => Array.from((node as HTMLCanvasElement).getContext('2d')!.getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data).slice(0, 3),
    point,
  )
}

async function drag({ page, from, to }: { page: Page; from: { x: number; y: number }; to: { x: number; y: number } }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test('graphics and words can be added on all four panels, and each panel shows them', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'allpanels' })

  for (const panel of PANELS) {
    await activate({ page, panel })
    const before = await panelPixels({ page, panel })
    await addWord({ page, word: 'ALL' })
    await page.getByRole('button', { name: 'Simple Cross' }).click()
    await expect.poll(async () => (await panelPixels({ page, panel })).picture, panel).not.toBe(before.picture)
    await saved({
      read: async () => [(await layers({ page, panel, kind: 'text' })).length, (await layers({ page, panel, kind: 'image' })).length],
    }).toEqual([1, 1])
  }
})

test('both bundled faces are available, load from this site and draw differently', async ({ page }) => {
  test.setTimeout(120_000)
  const external: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'font' && new URL(request.url()).origin !== new URL(page.url()).origin) {
      external.push(request.url())
    }
  })
  await openDesign({ page, label: 'faces' })
  await addWord({ page, word: 'FACE' })
  await saved({ read: async () => (await layers({ page, kind: 'text' }))[0]?.face }).toBe('display')
  const display = await panelPixels({ page, panel: 'Front' })

  await page.getByRole('button', { name: 'Sans', exact: true }).click()
  await saved({ read: async () => (await layers({ page, kind: 'text' }))[0]?.face }).toBe('sans')
  await expect.poll(async () => (await panelPixels({ page, panel: 'Front' })).picture).not.toBe(display.picture)
  expect(
    await page.evaluate(() => ['Cormorant Garamond', 'Outfit'].map((family) => document.fonts.check(`500 24px "${family}"`))),
  ).toEqual([true, true])
  expect(external).toEqual([])
})

test('a word takes the chosen colour, in the design and on the panel', async ({ page }) => {
  test.setTimeout(120_000)
  await openDesign({ page, label: 'wordcolour' })
  await addWord({ page, word: 'WWWW' })
  await saved({ read: async () => (await layers({ page, kind: 'text' })).length }).toBe(1)
  expect((await panelPixels({ page, panel: 'Front', match: color('Oxblood') })).matching).toBe(0)

  await page.getByRole('button', { name: 'Oxblood' }).last().click()
  await saved({ read: async () => (await layers({ page, kind: 'text' }))[0]?.color }).toBe(color('Oxblood'))
  await expect.poll(async () => (await panelPixels({ page, panel: 'Front', match: color('Oxblood') })).matching).toBeGreaterThan(20)
})

test('the move, resize and rotate handles show on the selected layer and do their job', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'handles' })
  await page.getByRole('button', { name: 'Simple Cross' }).click()
  await saved({ read: async () => (await layers({ page, kind: 'image' })).length }).toBe(1)
  const start = (await layers({ page, kind: 'image' }))[0]!
  const at = await handles({ page, layer: start })
  const selection = [1, 3, 5].map((index) => Number.parseInt(SELECTION_COLOR.slice(index, index + 2), 16))

  for (const point of [at.pixels.scale, at.pixels.rotate]) {
    const pixel = await pixelAt({ page, point })
    pixel.forEach((value, index) => expect(Math.abs(value - selection[index]!)).toBeLessThan(12))
  }

  await drag({ page, from: at.scale, to: { x: at.scale.x + 30, y: at.scale.y + 30 } })
  await saved({ read: async () => (await layers({ page, kind: 'image' }))[0]!.scale }).toBeGreaterThan(start.scale)

  const resized = (await layers({ page, kind: 'image' }))[0]!
  const after = await handles({ page, layer: resized })
  await drag({ page, from: after.rotate, to: { x: after.rotate.x + 60, y: after.rotate.y + 30 } })
  await saved({ read: async () => (await layers({ page, kind: 'image' }))[0]!.rotation }).not.toBe(resized.rotation)

  const turned = (await layers({ page, kind: 'image' }))[0]!
  await drag({ page, from: after.body, to: { x: after.body.x - 25, y: after.body.y + 20 } })
  await saved({ read: async () => (await layers({ page, kind: 'image' }))[0]!.x }).not.toBe(turned.x)
  expect((await layers({ page, kind: 'image' }))[0]!.scale).toBe(turned.scale)
})

test('resizing an image scales both sides together', async ({ page }) => {
  test.setTimeout(120_000)
  await openDesign({ page, label: 'uniform' })
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff00ff'
    context.fillRect(0, 0, 200, 100)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), 'image/png'))
    return btoa(Array.from(new Uint8Array(await blob.arrayBuffer()), (byte) => String.fromCharCode(byte)).join(''))
  })
  await page.locator('input[type="file"]').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await saved({ read: async () => (await layers({ page, kind: 'image' })).length, timeout: 30_000 }).toBe(1)

  const magentaBox = () =>
    panelCanvas({ page, panel: 'Front' }).evaluate((node) => {
      const canvas = node as HTMLCanvasElement
      const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      let [left, right, top, bottom] = [width, -1, height, -1]

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const at = (y * width + x) * 4

          if (data[at]! > 240 && data[at + 1]! < 15 && data[at + 2]! > 240) {
            left = Math.min(left, x)
            right = Math.max(right, x)
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
      }

      return { width: right - left + 1, height: bottom - top + 1 }
    })
  await expect.poll(async () => (await magentaBox()).width).toBeGreaterThan(5)
  const small = await magentaBox()
  const start = (await layers({ page, kind: 'image' }))[0]!
  const at = await handles({ page, layer: start })
  // Small enough that the image stays inside the panel and isn't clipped.
  await drag({ page, from: at.scale, to: { x: at.scale.x + 14, y: at.scale.y + 7 } })
  await saved({ read: async () => (await layers({ page, kind: 'image' }))[0]!.scale }).toBeGreaterThan(start.scale)
  const large = await magentaBox()

  expect(large.width).toBeGreaterThan(small.width)
  expect(large.width / large.height).toBeGreaterThan((small.width / small.height) * 0.95)
  expect(large.width / large.height).toBeLessThan((small.width / small.height) * 1.05)
  expect((await layers({ page, kind: 'image' }))[0]!.aspect).toBe(2)
})

test('switching panels keeps each layer, its values and the chosen tool settings', async ({ page }) => {
  test.setTimeout(150_000)
  await openDesign({ page, label: 'switching' })
  const x = page.getByRole('textbox', { name: 'Place X, percent of panel' })

  await addWord({ page, word: 'FRONT' })
  await x.fill('70')
  await x.press('Enter')
  await page.getByRole('button', { name: 'Oxblood' }).last().click()
  await saved({ read: async () => (await layers({ page, kind: 'text' }))[0]?.color }).toBe(color('Oxblood'))

  await activate({ page, panel: 'Back' })
  await addWord({ page, word: 'BACK' })
  await x.fill('30')
  await x.press('Enter')
  // The back panel's document is mirrored against what the panel shows.
  await saved({ read: async () => (await layers({ page, panel: 'Back', kind: 'text' }))[0]?.x }).toBeCloseTo(0.7)

  const rail = page.getByRole('complementary', { name: 'On the cloth' })
  await rail.getByRole('button', { name: /FRONT/ }).first().click()
  await expect(x).toHaveValue('70')
  await expect(panelCanvas({ page, panel: 'Front' })).toHaveAttribute('aria-label', /, active$/)
  await expect(page.getByRole('button', { name: 'Oxblood' }).last()).toHaveAttribute('aria-pressed', 'true')

  await rail.getByRole('button', { name: /BACK/ }).first().click()
  await expect(x).toHaveValue('30')
  await expect(panelCanvas({ page, panel: 'Back' })).toHaveAttribute('aria-label', /, active$/)

  const head = await savedHead({ page })
  expect(head.content.panels.front!.layers.find((layer) => layer.kind === 'text')).toMatchObject({ content: 'FRONT', color: color('Oxblood') })
  expect(head.content.panels.back!.layers.find((layer) => layer.kind === 'text')).toMatchObject({ content: 'BACK' })
})

test('undo and redo cover add, colour, word, position, order and delete', async ({ page }) => {
  test.setTimeout(240_000)
  await openDesign({ page, label: 'undoall' })
  const press = async (keys: string) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press(keys)
  }
  const undo = { click: () => press('ControlOrMeta+z') }
  const redo = { click: () => press('ControlOrMeta+Shift+z') }
  const word = async (content: string) => (await layers({ page, kind: 'text' })).find((layer) => layer.content === content)
  const order = async () => (await layers({ page, kind: 'text' })).map((layer) => layer.content).join()

  // Add.
  await addWord({ page, word: 'ONE' })
  await saved({ read: order }).toBe('ONE')
  await undo.click()
  await saved({ read: order }).toBe('')
  await redo.click()
  await saved({ read: order }).toBe('ONE')

  // Colour.
  const inkBefore = (await word('ONE'))!.color
  await page.getByRole('button', { name: 'Oxblood' }).last().click()
  await saved({ read: async () => (await word('ONE'))?.color }).toBe(color('Oxblood'))
  await undo.click()
  await saved({ read: async () => (await word('ONE'))?.color }).toBe(inkBefore)
  await redo.click()
  await saved({ read: async () => (await word('ONE'))?.color }).toBe(color('Oxblood'))

  // Position.
  const x = page.getByRole('textbox', { name: 'Place X, percent of panel' })
  const xBefore = (await word('ONE'))!.x
  await x.fill('75')
  await x.press('Enter')
  await saved({ read: async () => (await word('ONE'))?.x }).toBeCloseTo(0.75)
  await undo.click()
  await saved({ read: async () => (await word('ONE'))?.x }).toBeCloseTo(xBefore)
  await redo.click()
  await saved({ read: async () => (await word('ONE'))?.x }).toBeCloseTo(0.75)

  // The word itself, typed in the box over the panel.
  const at = await handles({ page, layer: (await word('ONE'))! })
  await page.mouse.click(at.body.x, at.body.y)
  const editor = page.locator('input:focus')
  await expect(editor).toHaveValue('ONE')
  await editor.fill('EDITED')
  await editor.press('Enter')
  await saved({ read: order }).toBe('EDITED')
  await undo.click()
  await saved({ read: order }).toBe('ONE')
  await redo.click()
  await saved({ read: order }).toBe('EDITED')

  // Order.
  await addWord({ page, word: 'TWO' })
  await saved({ read: order }).toBe('EDITED,TWO')
  const rail = page.getByRole('complementary', { name: 'On the cloth' })
  await rail.getByRole('button', { name: /^Move .*TWO.* down/ }).click()
  await saved({ read: order }).toBe('TWO,EDITED')
  await undo.click()
  await saved({ read: order }).toBe('EDITED,TWO')
  await redo.click()
  await saved({ read: order }).toBe('TWO,EDITED')

  // Delete.
  await rail.getByRole('button', { name: /^Delete .*TWO/ }).click()
  await saved({ read: order }).toBe('EDITED')
  await undo.click()
  await saved({ read: order }).toBe('TWO,EDITED')
  await redo.click()
  await saved({ read: order }).toBe('EDITED')
})

test('brush colour, size and opacity reach the stroke and show on the panel', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'brush', tech: false })
  const stroke = (panel: Panel) => async () => (await layers({ page, panel, kind: 'paint' })).flatMap((layer) => layer.strokes ?? [])[0]

  const draw = async (panel: Panel) => {
    const box = (await panelCanvas({ page, panel }).boundingBox())!
    await drag({
      page,
      from: { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 },
      to: { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5 },
    })
  }
  const size = page.getByRole('slider', { name: 'Size' })
  const opacity = page.getByRole('slider', { name: 'Opacity' })

  await page.getByRole('button', { name: 'Oxblood' }).first().click()
  await size.fill('0.06')
  await draw('Front')
  await saved({ read: stroke('Front') }).toMatchObject({ color: color('Oxblood'), opacity: 1 })

  await size.fill('0.01')
  await draw('Back')
  await saved({ read: stroke('Back') }).toMatchObject({ color: color('Oxblood'), opacity: 1 })
  const widths = [(await stroke('Front')())!.width, (await stroke('Back')())!.width]
  expect(widths[0]! / widths[1]!).toBeCloseTo(6, 0)

  await size.fill('0.06')
  await opacity.fill('0.5')
  await draw("Wearer's right")
  await saved({ read: stroke("Wearer's right") }).toMatchObject({ color: color('Oxblood') })
  expect((await stroke("Wearer's right")())!.opacity).toBeCloseTo(0.5, 1)

  await opacity.fill('1')
  await page.getByRole('button', { name: 'Meadow' }).first().click()
  await size.fill('0.06')
  await draw("Wearer's left")
  await saved({ read: stroke("Wearer's left") }).toMatchObject({ color: color('Meadow') })

  const wide = await panelPixels({ page, panel: 'Front', match: color('Oxblood') })
  const thin = await panelPixels({ page, panel: 'Back', match: color('Oxblood') })
  const faint = await panelPixels({ page, panel: "Wearer's right", match: color('Oxblood') })
  const green = await panelPixels({ page, panel: "Wearer's left", match: color('Meadow') })

  expect(wide.matching).toBeGreaterThan(thin.matching * 2)
  expect(thin.matching).toBeGreaterThan(0)
  expect(faint.matching).toBe(0)
  expect(faint.darkest).toBeGreaterThan(wide.darkest + 30)
  expect(green.matching).toBeGreaterThan(0)
})

test('on the Preview step a drag turns the tee and adds no ink, and a preset takes it back', async ({ page }) => {
  test.setTimeout(120_000)
  await openDesign({ page, label: 'orbit', tech: false })
  // Ink on the front, so a turn shows even on the plain tee.
  await page.getByRole('button', { name: 'Oxblood' }).first().click()
  await page.getByRole('slider', { name: 'Size' }).fill('0.06')
  await drawStroke({ page, panel: 'Front' })
  await saved({ read: async () => (await layers({ page, kind: 'paint' })).flatMap((layer) => layer.strokes ?? []).length }).toBe(1)

  // On the Design step a drag on the tee itself still paints.
  const designScene = (await page.locator('canvas[data-engine]').boundingBox())!
  await drag({
    page,
    from: { x: designScene.x + designScene.width / 2 - 15, y: designScene.y + designScene.height * 0.55 },
    to: { x: designScene.x + designScene.width / 2 + 15, y: designScene.y + designScene.height * 0.55 },
  })
  await saved({
    read: async () => {
      const { panels } = (await savedHead({ page })).content
      return Object.values(panels).flatMap((panel) => panel.layers).flatMap((layer) => layer.strokes ?? []).length
    },
  }).toBe(2)
  await expectSaved({ page })
  const url = new URL(page.url())
  url.searchParams.set('step', 'preview')
  await page.goto(url.toString())
  const camera = page.getByRole('radiogroup', { name: 'Camera' })
  const scene = page.locator('canvas[data-engine]')
  const settled = async () => {
    await page.waitForTimeout(2_500)
    return (await scene.screenshot()).toString('base64')
  }
  /** Share of pixels that differ visibly between two pictures of the scene. */
  const difference = (one: string, two: string) =>
    page.evaluate(
      async (pictures) => {
        const decoded = await Promise.all(
          pictures.map(async (picture) => {
            const image = new Image()
            image.src = `data:image/png;base64,${picture}`
            await image.decode()
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const context = canvas.getContext('2d')!
            context.drawImage(image, 0, 0)
            return context.getImageData(0, 0, canvas.width, canvas.height).data
          }),
        )
        let differing = 0

        for (let at = 0; at < decoded[0]!.length; at += 4) {
          differing += [0, 1, 2].some((channel) => Math.abs(decoded[0]![at + channel]! - decoded[1]![at + channel]!) > 16) ? 1 : 0
        }

        return differing / (decoded[0]!.length / 4)
      },
      [one, two],
    )

  await camera.getByRole('radio', { name: 'Front', exact: true }).click()
  const front = await settled()
  await camera.getByRole('radio', { name: 'Orbit', exact: true }).click()
  const orbit = await settled()

  const before = await savedHead({ page })
  const box = (await scene.boundingBox())!
  await drag({
    page,
    from: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    to: { x: box.x + box.width / 2 + 160, y: box.y + box.height / 2 },
  })
  const turned = await settled()
  expect(await difference(orbit, turned)).toBeGreaterThan(0.005)
  await expectSaved({ page })
  expect(await savedHead({ page })).toEqual(before)

  await camera.getByRole('radio', { name: 'Front', exact: true }).click()
  expect(await difference(front, await settled())).toBeLessThan(0.005)
})
