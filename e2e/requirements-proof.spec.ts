import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, latestCode, newEmail, panelCanvas, signIn } from './helpers'

/**
 * What docs/evidence/requirements-rc.md found proven only below the UI:
 * sign-in errors and keyboard use, sign-out, a second browser (R01, R02,
 * R13), and the editor's own controls (R03, R05, R06, R14, R15, R17).
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

/** Auth refuses a second code for one email within a minute. */
const RESEND_WAIT_MS = 61_000

type Layer = { id: string; kind: string; visible: boolean; strokes?: Array<{ tool: string }> }
type Head = {
  seq: number
  content: {
    base: { kind: string; color?: string; colors?: string[] }
    panels: Record<string, { layers: Layer[] }>
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

function strokes({ head, panel }: { head: Head; panel: string }) {
  return head.content.panels[panel]!.layers.flatMap((layer) => layer.strokes ?? [])
}

test('sign-in by keyboard: a wrong code is recoverable, a used one is refused, sign-out leaves nothing', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'signin' })
  emails.push(email)

  // Every step by keyboard, from the first field.
  await page.goto('/sign-in?returnTo=%2Fstudio')
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).focus()
  await page.keyboard.type(email)
  await page.keyboard.press('Enter')
  await expect(page.getByText(/can receive email/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled()
  const code = await latestCode({ email, after: requested })

  const field = page.getByRole('textbox', { name: '6-digit code' })
  await field.focus()
  await page.keyboard.type(code === '000000' ? '000001' : '000000')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText('wrong, already used or expired')
  await expect(field).toBeEnabled()

  await field.fill('')
  await page.keyboard.type(`${code.slice(0, 3)} ${code.slice(3)}`)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/studio$/)
  await expect(page.getByText(email)).toBeVisible()

  // Sign-out ends the local session and takes the account off the screen.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText(email)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('flp-auth'))).toBeNull()
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/sign-in/)

  // The used code is refused on the next attempt.
  await page.waitForTimeout(RESEND_WAIT_MS)
  const again = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const fresh = await latestCode({ email, after: again })
  await field.fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('status')).toContainText('wrong, already used or expired')
  await field.fill(fresh)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
})

test('a second browser signed in by code lists and opens the same design; another account lists nothing', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'second' })
  const other = newEmail({ label: 'secondother' })
  emails.push(email, other)

  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await page.getByPlaceholder('Type').fill('TWICE')
  await page.getByPlaceholder('Type').press('Enter')
  const title = page.getByRole('textbox', { name: 'Design name' })
  await title.fill('Two browsers')
  await title.press('Enter')
  await expectSaved({ page })
  await page.goto('/studio')
  await expect(page.getByRole('link', { name: 'Two browsers' })).toBeVisible()

  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  await page.waitForTimeout(RESEND_WAIT_MS)
  await signIn({ page: second, email })
  await second.getByRole('link', { name: 'Two browsers' }).click()
  await expectSaved({ page: second })
  await expect(second.getByText('TWICE', { exact: true }).first()).toBeVisible()
  await secondContext.close()

  const otherContext = await browser.newContext()
  const stranger = await otherContext.newPage()
  await signIn({ page: stranger, email: other })
  await expect(stranger.getByText('No designs yet.')).toBeVisible()
  await expect(stranger.getByText('Two browsers')).toHaveCount(0)
  await otherContext.close()
})

test('base colour and patterns keep the artwork, and undo, redo and reload bring them back', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'pattern' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await drawStroke({ page, panel: 'Front' })
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).length, { timeout: 20_000 }).toBe(1)
  const url = new URL(page.url())
  url.searchParams.set('step', 'color')
  await page.goto(url.toString())
  await expectSaved({ page })

  const ground = (await savedHead({ page })).content.base
  await page.getByRole('button', { name: 'Stripe', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('stripes')
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('check')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('stripes')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('check')

  await page.reload()
  await expectSaved({ page })
  await expect(page.getByRole('button', { name: /Check$/ })).toHaveAttribute('aria-pressed', 'true')
  expect(strokes({ head: await savedHead({ page }), panel: 'front' })).toHaveLength(1)

  await page.getByRole('button', { name: 'Solid', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base, { timeout: 20_000 }).toEqual(ground)
  expect(strokes({ head: await savedHead({ page }), panel: 'front' })).toHaveLength(1)
})

test('drawing on both sleeves, erasing, and the layer list work from the editor', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'layers' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  await drawStroke({ page, panel: "Wearer's right" })
  await drawStroke({ page, panel: "Wearer's left" })
  await drawStroke({ page, panel: 'Back' })
  await drawStroke({ page, panel: 'Front' })
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).length, { timeout: 20_000 }).toBe(1)
  const head = await savedHead({ page })

  for (const panel of ['front', 'back', 'left', 'right']) {
    expect(strokes({ head, panel }), panel).toHaveLength(1)
  }

  // The eraser lands on the panel's paint layer and leaves the others alone.
  await page.getByRole('button', { name: 'Erase', exact: true }).click()
  await drawStroke({ page, panel: 'Front' })
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).map((stroke) => stroke.tool), { timeout: 20_000 }).toEqual(['brush', 'eraser'])
  const erased = await savedHead({ page })

  for (const panel of ['back', 'left', 'right']) {
    expect(strokes({ head: erased, panel }), panel).toEqual(strokes({ head, panel }))
  }

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).length, { timeout: 20_000 }).toBe(1)

  // Hide, show, duplicate and reorder from the accessible layer list.
  await page.getByRole('button', { name: 'Brush', exact: true }).click()
  await page.getByPlaceholder('Type').fill('ONE')
  await page.getByPlaceholder('Type').press('Enter')
  await expect.poll(async () => (await savedHead({ page })).content.panels.front!.layers.some((layer) => layer.kind === 'text'), { timeout: 20_000 }).toBe(true)
  const rail = page.getByRole('complementary', { name: 'On the cloth' })
  const word = rail.getByRole('button', { name: /^Hide .*ONE/ })
  await word.click()
  await expect.poll(async () => (await savedHead({ page })).content.panels.front!.layers.find((layer) => layer.kind === 'text')?.visible, { timeout: 20_000 }).toBe(false)
  await rail.getByRole('button', { name: /^Show .*ONE/ }).click()
  await expect.poll(async () => (await savedHead({ page })).content.panels.front!.layers.find((layer) => layer.kind === 'text')?.visible, { timeout: 20_000 }).toBe(true)

  await rail.getByRole('button', { name: /^Duplicate .*ONE/ }).first().click()
  await expect.poll(async () => (await savedHead({ page })).content.panels.front!.layers.filter((layer) => layer.kind === 'text').length, { timeout: 20_000 }).toBe(2)
  const copies = (await savedHead({ page })).content.panels.front!.layers.filter((layer) => layer.kind === 'text')
  expect(new Set(copies.map((layer) => layer.id)).size).toBe(2)

  const before = (await savedHead({ page })).content.panels.front!.layers.map((layer) => layer.id)
  await rail.getByRole('button', { name: /^Move .*ONE.* down/ }).first().click()
  await expect.poll(async () => (await savedHead({ page })).content.panels.front!.layers.map((layer) => layer.id).join(), { timeout: 20_000 }).not.toBe(before.join())
  await expect(panelCanvas({ page, panel: 'Front' })).toBeVisible()
})
