import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { TINY_JPEG } from '../src/lib/image-fixtures'
import { PUBLIC_RENDER_KINDS } from '../src/lib/flp-api/render-kinds.mjs'
import { createExistingAccount, deleteAccounts, drawStroke, expectSaved, latestCode, newEmail, panelCanvas, signIn } from './helpers'

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

test('a known and an unknown email get the same answer at sign-in', async ({ browser }) => {
  const known = newEmail({ label: 'known' })
  const unknown = newEmail({ label: 'unknown' })
  emails.push(known, unknown)
  await createExistingAccount({ email: known })

  const answers = []

  for (const email of [known, unknown]) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/sign-in')
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    const asked = page.waitForResponse((response) => response.url().includes('/auth/v1/otp'))
    await page.getByRole('button', { name: 'Email me a code' }).click()
    const response = await asked
    await expect(page.getByRole('textbox', { name: '6-digit code' })).toBeVisible()
    await expect(page.getByText(/can receive email/)).toBeVisible()
    answers.push({
      status: response.status(),
      body: await response.text(),
      screen: (await page.locator('main').innerText()).replace(email, 'EMAIL').replace(/\d+s/g, 'Ns'),
    })
    await context.close()
  }

  expect(answers[0]).toEqual(answers[1])
})

test('an unsafe returnTo falls back to the studio and never leaves the site', async ({ page }) => {
  const email = newEmail({ label: 'returnto' })
  emails.push(email)
  const offsite: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname.endsWith('evil.example')) {
      offsite.push(request.url())
    }
  })

  // Signed out, through the whole code flow.
  await page.goto(`/sign-in?returnTo=${encodeURIComponent('https://evil.example/create')}`)
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email, after: requested })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  const origin = new URL(page.url()).origin
  await expect(page).toHaveURL(`${origin}/studio`)

  // Signed in, the page redirects straight away, so the other forms are quick.
  for (const unsafe of ['//evil.example/create', '/\\evil.example', 'javascript:alert(1)', '/sign-in?returnTo=/create']) {
    await page.goto(`/sign-in?returnTo=${encodeURIComponent(unsafe)}`)
    await expect(page, unsafe).toHaveURL(`${origin}/studio`)
  }

  // A safe one still goes where it says, so the fallback isn't all that happens.
  await page.goto(`/sign-in?returnTo=${encodeURIComponent('/privacy')}`)
  await expect(page).toHaveURL(`${origin}/privacy`)
  expect(offsite).toEqual([])
})

test('no code or token reaches the console, the address bar, analytics or other requests during sign-in', async ({ page }) => {
  const email = newEmail({ label: 'secrets' })
  emails.push(email)
  const seen: string[] = []
  const analytics: string[] = []
  page.on('console', (message) => seen.push(`console: ${message.text()}`))
  page.on('pageerror', (error) => seen.push(`error: ${error.message}`))
  page.on('framenavigated', (frame) => seen.push(`url: ${frame.url()}`))
  page.on('request', (request) => {
    const url = new URL(request.url())

    if (url.pathname === '/api/events') {
      analytics.push(request.postData() ?? '')
    }

    // The two sign-in calls to Supabase Auth carry the code and return the
    // tokens by design; nothing else may.
    if (url.pathname !== '/auth/v1/verify') {
      seen.push(`request: ${request.url()} ${request.postData() ?? ''}`)
    }
  })

  await page.goto(`/sign-in?returnTo=${encodeURIComponent('/studio')}`)
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email, after: requested })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await expect.poll(() => analytics).toContainEqual(JSON.stringify({ name: 'signed_in' }))

  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('flp-auth')!))
  const secrets = { code, access: auth.access_token as string, refresh: auth.refresh_token as string }
  expect(secrets.access.length).toBeGreaterThan(20)
  expect(seen.length).toBeGreaterThan(5)

  for (const [name, secret] of Object.entries(secrets)) {
    expect(seen.filter((line) => line.includes(secret)), name).toEqual([])
  }

  for (const body of analytics) {
    expect(Object.keys(JSON.parse(body)).every((field) => ['name', 'bucket'].includes(field)), body).toBe(true)
    expect(body).not.toContain(email)
  }
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

/** Publishes the saved head through the API, with placeholder views. */
async function publishHead({ page, request }: { page: Page; request: APIRequestContext }) {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('flp-auth')!).access_token as string)
  const headers = { Authorization: `Bearer ${token}` }
  const { seq } = await savedHead({ page })
  const data = Buffer.from(TINY_JPEG).toString('base64')
  const renders = PUBLIC_RENDER_KINDS.map((kind: string) => ({ kind, data }))
  expect((await request.post(`/api/flp/designs/${designId}/renders`, { headers, data: { seq, renders } })).status()).toBe(201)
  const published = await request.post(`/api/flp/designs/${designId}/publication`, { headers, data: { seq } })
  expect(published.status()).toBe(200)
  return { seq, slug: ((await published.json()) as { slug: string }).slug }
}

test('a failed unpublish shows the error, says it is still published, and can be tried again', async ({ page, request }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'unpubfail' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const { slug } = await publishHead({ page, request })

  const url = new URL(page.url())
  url.searchParams.set('step', 'share')
  await page.goto(url.toString())
  await expectSaved({ page })
  const unpublish = page.getByRole('button', { name: 'Unpublish' })
  await expect(unpublish).toBeVisible()

  const publication = '**/api/flp/designs/*/publication'
  await page.route(publication, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { code: 'internal', message: 'Injected failure' } }),
        })
      : route.continue(),
  )
  await unpublish.click()
  await expect(page.getByRole('status').filter({ hasText: 'Still published' })).toContainText('Injected failure')
  await expect(unpublish).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Publish…' })).toHaveCount(0)
  expect((await request.get(`/api/flp/public/${slug}`)).status()).toBe(200)

  await page.unroute(publication)
  await unpublish.click()
  await expect(page.getByRole('button', { name: 'Publish…' })).toBeVisible()
  expect((await request.get(`/api/flp/public/${slug}`)).status()).toBe(404)
})

test('undo and redo never change what is published', async ({ page, request }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'undopub' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await drawStroke({ page, panel: 'Front' })
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).length, { timeout: 20_000 }).toBe(1)

  const { seq, slug } = await publishHead({ page, request })
  const publicPage = async () => (await request.get(`/api/flp/public/${slug}`)).json()
  const before = await publicPage()
  expect(before.seq).toBe(seq)

  // New work, undone and redone, each saved as a new head.
  await drawStroke({ page, panel: 'Back' })
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'back' }).length, { timeout: 20_000 }).toBe(1)
  expect(await publicPage()).toEqual(before)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'back' }).length, { timeout: 20_000 }).toBe(0)
  expect(await publicPage()).toEqual(before)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).length, { timeout: 20_000 }).toBe(0)
  expect(await publicPage()).toEqual(before)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => strokes({ head: await savedHead({ page }), panel: 'front' }).length, { timeout: 20_000 }).toBe(1)
  expect(await publicPage()).toEqual(before)
  expect((await savedHead({ page })).seq).toBeGreaterThan(seq)
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

test('the preview offers every camera side, and History says what it keeps', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'camera' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  const history = page.getByRole('complementary', { name: 'Version history' })
  await history.getByRole('button', { name: 'Show' }).click()
  await expect(history.getByText(/Keeps the 100 latest autosaves/)).toBeVisible()

  const url = new URL(page.url())
  url.searchParams.set('step', 'preview')
  await page.goto(url.toString())
  const camera = page.getByRole('radiogroup', { name: 'Camera' })

  for (const name of ['Front', '3/4', 'Back', "Wearer's right", "Wearer's left", 'Orbit']) {
    await camera.getByRole('radio', { name, exact: true }).click()
    await expect(camera.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'true')
  }

  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `@${viewport.width}`,
    ).toBeLessThanOrEqual(0)
  }
})
