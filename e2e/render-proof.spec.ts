import { type Page, expect, test } from '@playwright/test'

import { INK_COLORS } from '../src/lib/paint-colors'
import { deleteAccounts, drawStroke, expectSaved, newEmail, panelCanvas, signIn } from './helpers'

/**
 * What reaches the 3D garment and the published pictures, read from their
 * own pixels (R03, R05, R07, R14, R16, R17). `render-proof.test.ts` holds the
 * atlas checks these rest on.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Layer = { kind: string; content?: string; x?: number; strokes?: unknown[] }
type Head = { seq: number; content: { base: { kind: string; color?: string }; panels: Record<string, { layers: Layer[] }> } }
type Stats = { oxblood: number; meadow: number; blue: number; bright: number; skin: number; tee: [number, number, number]; total: number }

const color = (name: string) => INK_COLORS.find((ink) => ink.name === name)!.value

async function openDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
}

async function savedHead({ page }: { page: Page }): Promise<Head> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head
  }, designId)
}

async function goToStep({ page, step }: { page: Page; step: string }) {
  const url = new URL(page.url())
  url.searchParams.set('step', step)
  await page.goto(url.toString())
  await expectSaved({ page })
}

async function chooseInk({ page, name }: { page: Page; name: string }) {
  await page.getByRole('button', { name }).first().click()
  await page.getByRole('slider', { name: 'Size' }).fill('0.06')
}

async function sceneShot({ page }: { page: Page }) {
  await page.waitForTimeout(2_000)
  // The middle of the scene only: side rails sit over the canvas's edges, and
  // the camera views float over its bottom.
  const box = (await page.locator('canvas[data-engine]').boundingBox())!
  const clip = { x: box.x + box.width * 0.3, y: box.y, width: box.width * 0.4, height: box.height - 96 }
  return (await page.screenshot({ clip })).toString('base64')
}

/** Try-on is opt-in on the publish step: put the tee on the first figure. */
async function tryOn({ page }: { page: Page }) {
  await page.getByRole('button', { name: 'Tall' }).click()
}

async function viewFrom({ page, side }: { page: Page; side: string }) {
  await page.getByRole('radiogroup', { name: 'Camera' }).getByRole('radio', { name: side, exact: true }).click()
  return sceneShot({ page })
}

/** Colour counts in a picture, and the median colour of the lit cloth. */
function statsOf({ page, picture, type = 'image/png' }: { page: Page; picture: string; type?: string }): Promise<Stats> {
  return page.evaluate(
    async ({ picture, type }) => {
      const image = new Image()
      image.src = `data:${type};base64,${picture}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      const stats = { oxblood: 0, meadow: 0, blue: 0, bright: 0, skin: 0, total: data.length / 4 }
      const lit: number[][] = []

      for (let at = 0; at < data.length; at += 4) {
        const [r, g, b] = [data[at]!, data[at + 1]!, data[at + 2]!]
        stats.oxblood += r > g + 45 && r > b + 30 && r < 170 && g < 70 ? 1 : 0
        stats.meadow += g > r + 8 && g > b + 25 && g < 170 ? 1 : 0
        stats.blue += b > r + 30 && b > g + 15 ? 1 : 0
        stats.skin += r > g + 15 && g > b + 15 && r > 180 ? 1 : 0

        if (r > 190 && g > 190 && b > 180) {
          stats.bright += 1
          lit.push([r, g, b])
        }
      }

      lit.sort((one, two) => one[0]! + one[1]! + one[2]! - (two[0]! + two[1]! + two[2]!))
      return { ...stats, tee: (lit[Math.floor(lit.length / 2)] ?? [0, 0, 0]) as [number, number, number] }
    },
    { picture, type },
  )
}

/** Share of pixels that differ visibly between two same-sized pictures. */
function difference({ page, one, two, type = 'image/png' }: { page: Page; one: string; two: string; type?: string }) {
  return page.evaluate(
    async ({ pictures, type }) => {
      const decoded = await Promise.all(
        pictures.map(async (picture) => {
          const image = new Image()
          image.src = `data:${type};base64,${picture}`
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
        differing += [0, 1, 2].some((channel) => Math.abs(decoded[0]![at + channel]! - decoded[1]![at + channel]!) > 24) ? 1 : 0
      }

      return differing / (decoded[0]!.length / 4)
    },
    { pictures: [one, two], type },
  )
}

async function publish({ page }: { page: Page }) {
  await goToStep({ page, step: 'share' })
  const { seq } = await savedHead({ page })
  await page.getByRole('button', { name: /^(Publish…|Publish latest)$/ }).click()
  await page.getByRole('button', { name: /^(Confirm publish|Publish v\d+)$/ }).click()
  await expect(page.getByText(new RegExp(`Published v${seq}\\b`))).toBeVisible({ timeout: 120_000 })
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  return (await link.getAttribute('href'))!.split('/s/')[1]!
}

/** The published front picture, fetched as a visitor gets it. */
async function publishedFront({ page, slug }: { page: Page; slug: string }) {
  const payload = (await (await page.request.get(`/api/flp/public/${slug}`)).json()) as { renders: Record<string, string> }
  const response = await page.request.get(payload.renders.view_front!)
  expect(response.status()).toBe(200)
  return { picture: (await response.body()).toString('base64'), type: response.headers()['content-type']! }
}

test('ink drawn on a panel appears on the 3D garment straight away, on the side it was drawn', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'ink3d' })
  const blank = await sceneShot({ page })
  expect((await statsOf({ page, picture: blank })).oxblood).toBe(0)

  await chooseInk({ page, name: 'Oxblood' })
  await drawStroke({ page, panel: 'Front' })
  // Still on the Design step: no reload, no save needed.
  await expect.poll(async () => (await statsOf({ page, picture: await sceneShot({ page }) })).oxblood, { timeout: 20_000 }).toBeGreaterThan(30)

  await chooseInk({ page, name: 'Meadow' })
  await drawStroke({ page, panel: 'Back' })
  await expectSaved({ page })

  await goToStep({ page, step: 'preview' })
  const front = await statsOf({ page, picture: await viewFrom({ page, side: 'Front' }) })
  const back = await statsOf({ page, picture: await viewFrom({ page, side: 'Back' }) })
  expect(front.oxblood).toBeGreaterThan(30)
  expect(back.oxblood).toBeLessThan(front.oxblood / 5)
  expect(back.meadow).toBeGreaterThan(front.meadow + 30)
})

test('the base colour changes the cloth, not the figure, and keeps the artwork', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'base3d' })
  await chooseInk({ page, name: 'Meadow' })
  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })

  await goToStep({ page, step: 'preview' })
  await tryOn({ page })
  const before = await statsOf({ page, picture: await viewFrom({ page, side: 'Front' }) })
  expect(before.bright).toBeGreaterThan(500)

  await goToStep({ page, step: 'color' })
  await page.getByRole('button', { name: 'Oxblood' }).first().click()
  await expect.poll(async () => (await savedHead({ page })).content.base.color, { timeout: 20_000 }).toBe(color('Oxblood'))

  await goToStep({ page, step: 'preview' })
  await tryOn({ page })
  const after = await statsOf({ page, picture: await viewFrom({ page, side: 'Front' }) })
  expect(after.bright).toBeLessThan(before.bright / 5)
  expect(after.oxblood).toBeGreaterThan(500)
  expect(after.skin).toBeGreaterThan(before.skin * 0.8)
  expect(after.skin).toBeLessThan(before.skin * 1.2)
  // The stroke is still on it.
  expect(after.meadow).toBeGreaterThan(30)
})

test('publishing with a figure tried on photographs the tee alone', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'tryonpub' })
  await goToStep({ page, step: 'share' })
  await tryOn({ page })
  const worn = await statsOf({ page, picture: await sceneShot({ page }) })
  expect(worn.skin).toBeGreaterThan(200)

  const { seq } = await savedHead({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByText(new RegExp(`Published v${seq}\\b`))).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('button', { name: 'Tall' })).toHaveAttribute('aria-pressed', 'false')
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  const slug = (await link.getAttribute('href'))!.split('/s/')[1]!
  const front = await publishedFront({ page, slug })
  expect((await statsOf({ page, ...front })).skin).toBeLessThan(worn.skin / 10)
})

test('a moved layer shows in the 2D panel and the 3D view, and looks the same after reloading', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'both' })
  await page.getByRole('radio', { name: 'Tech' }).click()
  await page.getByRole('button', { name: 'Simple Cross' }).click()
  await expectSaved({ page })

  const panelPicture = () => panelCanvas({ page, panel: 'Front' }).evaluate((node) => (node as HTMLCanvasElement).toDataURL())
  const panelBefore = await panelPicture()
  const sceneBefore = await sceneShot({ page })
  const x = page.getByRole('textbox', { name: 'Place X, percent of panel' })
  await x.fill('30')
  await x.press('Enter')
  await expect.poll(panelPicture).not.toBe(panelBefore)
  await expectSaved({ page })
  const sceneAfter = await sceneShot({ page })
  expect(await difference({ page, one: sceneBefore, two: sceneAfter })).toBeGreaterThan(0.0005)

  await goToStep({ page, step: 'preview' })
  const moved = await viewFrom({ page, side: 'Front' })
  await page.reload()
  await expectSaved({ page })
  expect(await difference({ page, one: moved, two: await viewFrom({ page, side: 'Front' }) })).toBeLessThan(0.002)
})

test('a checked design keeps its look through save, restore and publishing, and matches the editor', async ({ page }) => {
  test.setTimeout(300_000)
  await openDesign({ page, label: 'published' })

  await goToStep({ page, step: 'color' })
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('check')
  const checkSeq = (await savedHead({ page })).seq

  await goToStep({ page, step: 'preview' })
  const editorView = await statsOf({ page, picture: await viewFrom({ page, side: 'Front' }) })

  const slug = await publish({ page })
  const first = await publishedFront({ page, slug })
  const firstStats = await statsOf({ page, ...first })

  // The published picture has the same cloth as the editor's front view.
  firstStats.tee.forEach((value, channel) => {
    expect(Math.abs(value - editorView.tee[channel]!), `channel ${channel}`).toBeLessThan(24)
  })

  // Change it, then bring the checked version back from History.
  await goToStep({ page, step: 'color' })
  await page.getByRole('button', { name: 'Solid', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('solid')
  await goToStep({ page, step: 'design' })
  const history = page.getByRole('complementary', { name: 'Version history' })
  await history.getByRole('button', { name: 'Show' }).click()
  await history
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`\\bv${checkSeq}\\b`) })
    .getByRole('button', { name: 'Restore', exact: true })
    .click()
  await history.getByRole('dialog', { name: /^Restore version/ }).getByRole('button', { name: 'Restore', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('check')

  const again = await publish({ page })
  expect(again).toBe(slug)
  const second = await publishedFront({ page, slug })
  expect(await difference({ page, one: first.picture, two: second.picture, type: first.type })).toBeLessThan(0.01)
})

/** A real square PNG of one bright colour, from the browser. */
async function squarePng({ page }: { page: Page }) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 200
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff00ff'
    context.fillRect(0, 0, 200, 200)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), 'image/png'))
    return btoa(Array.from(new Uint8Array(await blob.arrayBuffer()), (byte) => String.fromCharCode(byte)).join(''))
  })
  return Buffer.from(base64, 'base64')
}

/** Width / height of the magenta area in a picture; the cloth's shading dims it. */
function magentaShape({ page, picture }: { page: Page; picture: string }) {
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
    let [left, right, top, bottom] = [canvas.width, -1, canvas.height, -1]

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const at = (y * canvas.width + x) * 4

        if (pixels[at]! > pixels[at + 1]! + 70 && pixels[at + 2]! > pixels[at + 1]! + 70) {
          left = Math.min(left, x)
          right = Math.max(right, x)
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
        }
      }
    }

    return { width: right - left + 1, height: bottom - top + 1 }
  }, picture)
}

test('a square image looks square on the 2D panel and on the tee, and each panel has its real shape', async ({ page }) => {
  test.setTimeout(180_000)
  await openDesign({ page, label: 'square' })

  const shape = async (panel: 'Front' | 'Back' | "Wearer's right" | "Wearer's left") =>
    (await panelCanvas({ page, panel }).boundingBox())!
  const front = await shape('Front')
  const sleeve = await shape("Wearer's right")
  expect(front.width / front.height).toBeCloseTo(0.611, 1)
  expect(sleeve.width / sleeve.height).toBeCloseTo(3.037, 0)

  await page.getByRole('radio', { name: 'Tech' }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: await squarePng({ page }) })
  await expect.poll(async () => ((await savedHead({ page })).content.panels.front!.layers.filter((layer) => layer.kind === 'image')).length, { timeout: 30_000 }).toBe(1)
  await expectSaved({ page })

  const onPanel = await panelCanvas({ page, panel: 'Front' }).evaluate((node) => {
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
  expect(onPanel.width / onPanel.height).toBeGreaterThan(0.93)
  expect(onPanel.width / onPanel.height).toBeLessThan(1.07)

  await goToStep({ page, step: 'preview' })
  const onTee = await magentaShape({ page, picture: await viewFrom({ page, side: 'Front' }) })
  console.log(`[square] panel ${onPanel.width}x${onPanel.height}, tee ${onTee.width}x${onTee.height}`)
  // Measured from the front camera, with the cloth curving away at the sides.
  expect(onTee.width / onTee.height).toBeGreaterThan(0.85)
  expect(onTee.width / onTee.height).toBeLessThan(1.15)
})

test('a design saved on the older template keeps its look and its 6:7 panels', async ({ page }) => {
  test.setTimeout(120_000)
  await openDesign({ page, label: 'oldtemplate' })
  const head = await savedHead({ page })
  const created = await page.evaluate(async (content) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch('/api/flp/designs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mutationKey: crypto.randomUUID(),
        title: 'Old template',
        content: { ...content, template: { id: 'tee-crew-short', version: 2 } },
      }),
    })
    return (await response.json()).designId as string
  }, head.content)

  await page.goto(`/create?cloud=${created}&step=design`)
  await expectSaved({ page })
  const box = (await panelCanvas({ page, panel: "Wearer's right" }).boundingBox())!
  expect(box.width / box.height).toBeCloseTo(6 / 7, 1)

  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })
  const saved = await savedHead({ page })
  expect((saved.content as unknown as { template: { version: number } }).template.version).toBe(2)
})
