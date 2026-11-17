import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Pattern (beta), Workflow 1 (the suite's build turns `VITE_PATTERN_BETA`
 * on): turn it on, reshape a piece, open a slit, see it drape and save, publish it
 * (which stores the draped mesh), and reload without draping again.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function savedPattern({ page }: { page: Page }) {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const content = (await response.json()).head?.content
    return { pattern: content?.pattern ?? null, shape: content?.shape ?? null }
  }, designId)
}

const drapeState = (page: Page) => page.getByTestId('pattern-drape-state')

test('reshape the pattern, slit it, drape it, publish it, and reload without draping', async ({ page }) => {
  test.setTimeout(240_000)
  const email = newEmail({ label: 'pattern' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  const url = new URL(page.url())
  url.searchParams.set('step', 'select')
  await page.goto(url.toString())
  await expectSaved({ page })

  // On: the editor replaces the shape sliders, and the tee drapes.
  // The switch follows the document, which turns once the template's pattern loads.
  await page.getByRole('switch', { name: 'Pattern (beta)' }).click()
  const editor = page.getByTestId('pattern-editor')
  await expect(editor).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('switch', { name: 'Pattern (beta)' })).toBeChecked()
  await expect(page.getByTestId('shape-rail')).toHaveCount(0)
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })

  // Deepen the neckline from the keyboard: 10 mm a press, each its own step.
  const neck = editor.locator('[data-point="front:neckC"]')
  await neck.focus()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expectSaved({ page })

  const saved = await savedPattern({ page })
  expect(saved.shape).toBeNull()
  const front = (saved.pattern as { pieces: Array<{ id: string; outline: Array<{ id: string; y: number }> }> }).pieces.find((piece) => piece.id === 'front')!
  expect(front.outline.find((point) => point.id === 'neckC')!.y).toBe(590 - 20)

  // An unsewable drag is refused with a reason, and nothing is saved.
  const hem = editor.locator('[data-point="front:hemR"]')
  await hem.focus()

  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press('Shift+ArrowDown')
  }

  await expect(page.getByTestId('pattern-issues')).toContainText('seam')

  // A slit, from the keyboard: focus the side seam's edge, S for its length, then add it.
  await editor.locator('[data-edge="front:1"]').focus()
  const tools = page.getByTestId('pattern-edge-tools')
  await expect(tools).toContainText('sewn to Back (seam sideL)')
  await page.keyboard.press('s')
  const slitLength = tools.getByRole('slider', { name: /Slit length/ })
  await expect(slitLength).toBeFocused()
  await slitLength.fill('250')
  await tools.getByRole('button', { name: 'Add slit here' }).click()
  await expect(tools.getByRole('button', { name: 'Update slit' })).toBeVisible()
  await expect(tools.locator('[data-slit-value]')).toHaveText('25.0 cm')
  await expect(editor.locator('[data-point="front:sideL-slit-a"]')).toBeVisible()
  // The open stretch below it is drawn dashed: a free edge, no seam.
  await expect(editor.locator('[data-edge="front:1"]')).toHaveAttribute('aria-label', 'Front, edge hemR to sideL-slit-a, open')
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expectSaved({ page })
  const slit = (await savedPattern({ page })).pattern as {
    pieces: Array<{ id: string; outline: Array<{ id: string; y: number }> }>
    seams: Array<{ id: string; a: { from: string }; b: { to: string } }>
  }
  expect(slit.seams.find((seam) => seam.id === 'sideL')).toMatchObject({ a: { from: 'sideL-slit-a' }, b: { to: 'sideL-slit-b' } })
  // The side seam is straight up from the hem: 25 cm along it is 250 mm up.
  expect(slit.pieces.find((piece) => piece.id === 'front')!.outline.find((point) => point.id === 'sideL-slit-a')!.y).toBe(250)
  await test.info().attach('draped slit', { body: await page.screenshot(), contentType: 'image/png' })

  // Publishing stores the draped mesh, then the views.
  const designId = new URL(page.url()).searchParams.get('cloud')!
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish publicly…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })).toBeVisible({ timeout: 120_000 })

  // A reload loads the stored drape: nothing is simulated.
  await page.goto(`/create?cloud=${designId}&step=select`)
  await expectSaved({ page })
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(drapeState(page)).toHaveAttribute('data-runs', '0')
})

test('an AI suggestion is previewed, then applied as one undoable edit', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'pattern-ai' })
  emails.push(email)
  // Claude is mocked here: nothing goes to Anthropic.
  let asked: { prompt?: string; template?: unknown } = {}
  await page.route('**/api/flp/ai/sketch', async (route) => {
    asked = route.request().postDataJSON()
    await route.fulfill({ json: { ops: [{ op: 'lengthen', mm: 120 }, { op: 'sleeve', side: 'left', mm: 200 }], notes: 'Longer body and a long left sleeve.' } })
  })

  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const url = new URL(page.url())
  url.searchParams.set('step', 'select')
  await page.goto(url.toString())
  await expectSaved({ page })
  await page.getByRole('switch', { name: 'Pattern (beta)' }).click()
  await expect(page.getByTestId('pattern-editor')).toBeVisible({ timeout: 30_000 })
  await expectSaved({ page })
  await expect.poll(async () => (await savedPattern({ page })).pattern !== null).toBe(true)

  await page.getByRole('button', { name: 'AI suggestion (beta)' }).click()
  const assist = page.getByTestId('ai-assist')
  await assist.getByLabel('Describe it (optional)').fill('A long tee with one long sleeve')
  await assist.getByRole('button', { name: 'Suggest' }).click()
  await expect(assist.getByRole('status')).toContainText('Longer body and a long left sleeve.')
  expect(asked.prompt).toBe('A long tee with one long sleeve')
  expect(asked.template).toEqual({ id: 'tee-crew-short', version: 5 })

  // Previewed, not saved yet.
  expect((await savedPattern({ page })).pattern.pieces[0].outline[0].y).toBe(0)

  await assist.getByRole('button', { name: 'Apply' }).click()
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expectSaved({ page })
  const saved = (await savedPattern({ page })).pattern as { pieces: Array<{ id: string; mirrorOf?: string; outline: Array<{ id: string; y: number }> }> }
  expect(saved.pieces.find((piece) => piece.id === 'front')!.outline.find((point) => point.id === 'hemL')!.y).toBe(-120)
  // The left sleeve was parted from its mirror and lengthened alone.
  expect(saved.pieces.find((piece) => piece.id === 'sleeveL')!.mirrorOf).toBeUndefined()

  await page.getByRole('button', { name: 'Undo' }).first().click()
  await expectSaved({ page })
  expect((await savedPattern({ page })).pattern.pieces[0].outline[0].y).toBe(0)
})

test('trousers start as shorts from a length preset, which drapes and saves', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'shorts' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Create' }).click()
  await page.getByRole('radiogroup', { name: 'Garment' }).getByRole('radio', { name: /^Trousers/ }).click()
  await page.getByRole('button', { name: 'Create a pair of trousers' }).click()
  await expectSaved({ page })

  const url = new URL(page.url())
  url.searchParams.set('step', 'select')
  await page.goto(url.toString())
  await expectSaved({ page })
  await page.getByRole('switch', { name: 'Pattern (beta)' }).click()
  const editor = page.getByTestId('pattern-editor')
  await expect(editor).toBeVisible({ timeout: 30_000 })
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })

  await editor.getByRole('group', { name: 'Start from' }).getByRole('button', { name: 'Shorts' }).click()
  await expect(drapeState(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expectSaved({ page })

  // The same pieces, cut above the knee: 420 mm from hem to waist, not 900.
  const saved = await savedPattern({ page })
  const front = (saved.pattern as { pieces: Array<{ id: string; outline: Array<{ id: string; y: number }> }> }).pieces.find((piece) => piece.id === 'trouserFront')!
  expect(front.outline.find((point) => point.id === 'waistR')!.y).toBe(420)
})
