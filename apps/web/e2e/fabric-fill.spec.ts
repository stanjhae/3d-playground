import { type Page, expect, test } from '@playwright/test'

import { chooseTool, deleteAccounts, expectSaved, newEmail, signIn, graphicTile } from './helpers'

/**
 * Writers W: the garment's fabric, seen in 3D and kept on reload, and a
 * pattern over a whole side from the graphics library, in the layer list,
 * saved, retiled and undone, then published.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Layer = { id: string; kind: string; tile?: number; source?: Record<string, unknown>; offsetX?: number }
type Content = { base: { kind: string; color?: string; fabric?: string }; panels: Record<string, { layers: Layer[] }> }

async function savedContent({ page }: { page: Page }): Promise<Content> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head.content
  }, designId)
}

async function newTee({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
}

async function goToStep({ page, step }: { page: Page; step: 'color' | 'design' | 'share' }) {
  const url = new URL(page.url())
  url.searchParams.set('step', step)
  await page.goto(url.toString())
  await expectSaved({ page })
}

test('Surface changes a plain tee too, and Cotton, Wool, Denim and Silk each look their own', async ({ page }) => {
  // Tester, 22 Nov: switching fabrics barely changed the look, and Surface seemed to do nothing.
  test.setTimeout(150_000)
  await newTee({ page, label: 'surface' })
  await goToStep({ page, step: 'color' })
  const material = page.getByTestId('garment-material')
  const surface = page.getByRole('group', { name: 'Surface' })

  // The plain tee shows its own cloth; Surface swaps the relief, or takes it away.
  await expect(material).toHaveAttribute('data-detail', /^(own|knit|none)$/, { timeout: 30_000 })
  const own = (await material.getAttribute('data-detail'))!
  await surface.getByRole('button', { name: 'Twill' }).click()
  await expect(material).toHaveAttribute('data-detail', 'twill')
  await surface.getByRole('button', { name: 'None' }).click()
  await expect(material).toHaveAttribute('data-detail', 'none')
  await surface.getByRole('button', { name: 'Fabric’s own' }).click()
  await expect(material).toHaveAttribute('data-detail', own)

  // Each of the four reads differently: its relief, how rough it is, and its sheen.
  const chooser = page.getByTestId('fabric-chooser')
  const looks: string[] = []

  for (const name of ['Cotton', 'Wool', 'Denim', 'Silk']) {
    await chooser.getByRole('button', { name, exact: true }).click()
    await expect(chooser.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(material).not.toHaveAttribute('data-map-id', '')
    looks.push(
      [await material.getAttribute('data-detail'), await material.getAttribute('data-roughness'), await material.getAttribute('data-sheen')].join(' '),
    )
  }

  expect(new Set(looks).size).toBe(4)
  expect(looks[0]).toBe('knit 0.95 0')
  expect(looks[2]).toBe('twill 0.85 0')
})

test('picking Satin saves base.fabric, changes the 3D cloth, keeps the colour and survives a reload', async ({ page }) => {
  test.setTimeout(150_000)
  await newTee({ page, label: 'fabric' })
  await goToStep({ page, step: 'color' })

  const chooser = page.getByTestId('fabric-chooser')
  const material = page.getByTestId('garment-material')
  await expect(chooser.getByRole('button', { name: 'Satin' })).toHaveAttribute('aria-pressed', 'false')
  // The plain tee: no fabric texture, matte.
  await expect(material).toHaveAttribute('data-sheen', '0', { timeout: 30_000 })

  await page.getByRole('button', { name: 'Oxblood' }).click()
  await expectSaved({ page })
  await chooser.getByRole('button', { name: 'Satin' }).click()
  await expect(chooser.getByRole('button', { name: 'Satin' })).toHaveAttribute('aria-pressed', 'true')

  // The 3D material is satin: its texture, sheen and lower roughness.
  await expect(material).toHaveAttribute('data-map-id', 'satin-sheen')
  await expect(material).toHaveAttribute('data-sheen', '1')
  await expect(material).toHaveAttribute('data-roughness', '0.3')
  await expect(material).toHaveAttribute('data-detail', 'satin')
  await page.getByTestId('fabric-chooser').screenshot({ path: 'test-results/fabric-chooser.png' })

  await expectSaved({ page })
  await expect.poll(async () => (await savedContent({ page })).base, { timeout: 20_000 }).toEqual({
    kind: 'solid',
    color: '#6b1d2a',
    fabric: 'satin',
  })

  // Chiffon is sheer.
  await chooser.getByRole('button', { name: 'Chiffon' }).click()
  await expect(material).toHaveAttribute('data-opacity', '0.62')
  await page.getByRole('button', { name: 'Undo' }).first().click()
  await expect(chooser.getByRole('button', { name: 'Satin' })).toHaveAttribute('aria-pressed', 'true')
  await expectSaved({ page })
  await expect.poll(async () => (await savedContent({ page })).base.fabric, { timeout: 20_000 }).toBe('satin')

  await page.reload()
  await expectSaved({ page })
  await expect(page.getByTestId('fabric-chooser').getByRole('button', { name: 'Satin' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('garment-material')).toHaveAttribute('data-map-id', 'satin-sheen', { timeout: 30_000 })
})

test('fill the front with a library graphic: it is in the layer list and the saved design, retiles and undoes', async ({ page }) => {
  test.setTimeout(150_000)
  await newTee({ page, label: 'fill' })
  await chooseTool({ page, tool: 'Graphics' })
  await graphicTile({ page, label: 'Anchor' }).click()
  await expectSaved({ page })

  const repeat = page.getByRole('group', { name: 'Repeat the selected graphic' })
  await repeat.getByRole('button', { name: 'Fill this side' }).click()

  // In the layer list, selected, in place of the single graphic.
  const rows = page.locator('[data-layer-panel="front"] [data-layer-control="select"]')
  await expect(rows).toHaveText(['Image fill'])
  await expect(page.getByTestId('fill-inspector')).toBeVisible()
  await expectSaved({ page })

  const front = async () => (await savedContent({ page })).panels.front!.layers
  await expect.poll(front, { timeout: 20_000 }).toEqual([
    expect.objectContaining({ kind: 'fill', tile: 0.2, rotation: 0, source: { assetId: 'asset_lib_anchor', aspect: 1 } }),
  ])
  const [fill] = await front()
  expect(fill).not.toHaveProperty('offsetX')
  expect(fill).not.toHaveProperty('offsetY')

  // Larger tiles: one key press on the slider is one step.
  const tile = page.getByRole('slider', { name: 'Tile size' })
  await tile.focus()
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press('ArrowRight')
  }
  await expectSaved({ page })
  await expect.poll(async () => (await front())[0]?.tile, { timeout: 20_000 }).toBeCloseTo(0.3, 5)
  await page.getByTestId('fill-inspector').screenshot({ path: 'test-results/fill-inspector.png' })

  // Undo the last press, then all of them and the fill itself: the mark comes back.
  await page.getByRole('button', { name: 'Undo' }).first().click()
  await expectSaved({ page })
  await expect.poll(async () => (await front())[0]?.tile, { timeout: 20_000 }).toBeCloseTo(0.29, 5)

  for (let step = 0; step < 10; step += 1) {
    await page.getByRole('button', { name: 'Undo' }).first().click()
  }
  await expectSaved({ page })
  await expect.poll(async () => (await front()).map((layer) => layer.kind), { timeout: 20_000 }).toEqual(['image'])
})

test('stripes on all sides are one undo step, and publish into the pictures', async ({ page }) => {
  test.setTimeout(240_000)
  await newTee({ page, label: 'fillall' })
  await chooseTool({ page, tool: 'Graphics' })

  const patterns = page.getByRole('group', { name: 'Patterns' })
  await patterns.getByRole('button', { name: 'Stripes', exact: true }).click()
  await patterns.getByRole('button', { name: 'Ground Night' }).click()
  await patterns.getByRole('button', { name: 'Stripes Ink' }).click()
  await patterns.getByRole('button', { name: 'All sides' }).click()
  await expectSaved({ page })

  const fills = async () => {
    const content = await savedContent({ page })
    return Object.values(content.panels).flatMap((panel) => panel.layers.filter((layer) => layer.kind === 'fill'))
  }
  await expect.poll(async () => (await fills()).length, { timeout: 20_000 }).toBe(4)
  await expect(page.locator('[data-layer-control="select"]', { hasText: 'Stripe fill' })).toHaveCount(4)

  await page.getByRole('button', { name: 'Undo' }).first().click()
  await expectSaved({ page })
  await expect.poll(async () => (await fills()).length, { timeout: 20_000 }).toBe(0)
  await page.getByRole('button', { name: 'Redo' }).first().click()
  await expectSaved({ page })
  await expect.poll(async () => (await fills()).length, { timeout: 20_000 }).toBe(4)

  // Published: the front picture is mostly the dark stripes, and the share page opens.
  await goToStep({ page, step: 'share' })
  await page.getByRole('button', { name: 'Publish publicly…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })
  const slug = (await link.getAttribute('href'))!.split('/s/')[1]!
  const payload = (await (await page.request.get(`/api/flp/public/${slug}`)).json()) as { renders: Record<string, string> }
  const picture = await page.request.get(payload.renders.view_front!)
  const dark = await page.evaluate(
    async ({ data, type }) => {
      const image = new Image()
      image.src = `data:${type};base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const { data: pixels } = context.getImageData(0, 0, image.width, image.height)
      let count = 0

      for (let at = 0; at < pixels.length; at += 4) {
        count += pixels[at]! < 60 && pixels[at + 1]! < 60 && pixels[at + 2]! < 60 ? 1 : 0
      }

      return count / (pixels.length / 4)
    },
    { data: (await picture.body()).toString('base64'), type: picture.headers()['content-type']! },
  )
  // A night ground over the whole garment: a large share of the picture.
  expect(dark).toBeGreaterThan(0.05)

  await page.goto(`/s/${slug}`)
  await expect(page.getByRole('img', { name: /^Untitled tee/ })).toHaveCount(5, { timeout: 60_000 })
})

// Evidence for the PR (docs/evidence/fabric-*.png): `FABRIC_EVIDENCE=1` only.
test('evidence: the 3D cloth in each fabric, and fills', async ({ page }) => {
  test.skip(!process.env.FABRIC_EVIDENCE, 'writes docs/evidence screenshots on request')
  test.setTimeout(240_000)
  await newTee({ page, label: 'fabricshots' })
  await goToStep({ page, step: 'color' })
  const stage = page.locator('canvas[aria-label="3D preview"]').first()
  const material = page.getByTestId('garment-material')
  await page.getByRole('button', { name: 'Brass' }).first().click()
  await expectSaved({ page })
  await page.waitForTimeout(1500)
  await stage.screenshot({ path: '../../docs/evidence/fabric-none.png' })

  for (const [name, mapId] of [
    ['Satin', 'satin-sheen'],
    ['Denim', 'denim-twill'],
    ['Chiffon', 'chiffon-gauze'],
    ['Leather', 'leather-grain'],
    ['Wool', 'wool-nap'],
  ] as const) {
    await page.getByTestId('fabric-chooser').getByRole('button', { name }).click()
    await expect(material).toHaveAttribute('data-map-id', mapId)
    await page.waitForTimeout(1500)
    await stage.screenshot({ path: `../../docs/evidence/fabric-${name.toLowerCase()}.png` })
  }

  await page.getByTestId('fabric-chooser').screenshot({ path: '../../docs/evidence/fabric-picker.png' })

  await goToStep({ page, step: 'design' })
  await chooseTool({ page, tool: 'Graphics' })
  await graphicTile({ page, label: 'Anchor' }).click()
  await page.getByRole('group', { name: 'Repeat the selected graphic' }).getByRole('button', { name: 'Fill this side' }).click()
  await expectSaved({ page })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '../../docs/evidence/fabric-fill-front.png' })

  const patterns = page.getByRole('group', { name: 'Patterns' })
  await patterns.getByRole('button', { name: 'Check', exact: true }).click()
  await patterns.getByRole('button', { name: 'Squares Oxblood' }).click()
  await patterns.getByRole('button', { name: 'All sides' }).click()
  await expectSaved({ page })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '../../docs/evidence/fabric-fill-all-sides.png' })
})

test('the further patterns are offered, and Honeycomb saves and draws on the garment', async ({ page }) => {
  // Tester, 22 Nov: more patterns, such as scales, honeycomb and leopard.
  test.setTimeout(120_000)
  await newTee({ page, label: 'motif' })
  await goToStep({ page, step: 'color' })

  for (const name of ['Dots', 'Chevron', 'Houndstooth', 'Honeycomb', 'Scales', 'Leopard']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Honeycomb', exact: true }).click()
  // Picked, its name gains a tick.
  await expect(page.getByRole('button', { name: /Honeycomb$/ })).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => (await savedContent({ page })).base as unknown as { kind: string; motif?: string }, { timeout: 20_000 })
    .toMatchObject({ kind: 'motif', motif: 'honeycomb' })

  // On the 2D side: the cloth colour and the honeycomb's lines both show.
  await goToStep({ page, step: 'design' })
  const front = page.locator('canvas[aria-label^="Design panel Front"]')
  await expect
    .poll(() =>
      front.evaluate((canvas: HTMLCanvasElement) => {
        const { width, height } = canvas
        const data = canvas.getContext('2d')!.getImageData(width * 0.3, height * 0.3, width * 0.4, height * 0.4).data
        let dark = 0
        let light = 0

        for (let at = 0; at < data.length; at += 4) {
          const level = (data[at]! + data[at + 1]! + data[at + 2]!) / 3
          dark += level < 90 ? 1 : 0
          light += level > 180 ? 1 : 0
        }

        return Math.min(dark, light)
      }),
    )
    .toBeGreaterThan(100)
})
