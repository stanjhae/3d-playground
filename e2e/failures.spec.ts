import { type BrowserContext, type Page, type Route, expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/**
 * Failure injection and save/recovery races (Q05 #190, S06 #175). Each
 * case checks the visible save status, that no edit is lost, and that
 * "Saved to cloud" never shows before the server has acknowledged.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const VERSIONS = '**/api/flp/designs/*/versions'
const STATUS_SAVED = 'Saved to cloud'

type SaveGate = {
  /** How the next save requests are answered, in order; then they pass. */
  plan: Array<(route: Route) => Promise<void>>
  /** Request bodies of every save the page sent. */
  sent: Array<{ at: number; mutationKey: string; baseSeq: number }>
  /** "Saved to cloud" shown before the server acknowledged, while armed. */
  early: number
  armed: boolean
  /** While true every save fails as if the network were gone. */
  offline: boolean
  /** Clears what the page has shown so far and starts watching. */
  arm: () => Promise<void>
}

/**
 * Notes every time a status region turns to "Saved to cloud", in every
 * page load of the context, so a premature success cannot slip between
 * two assertions.
 */
async function watchSavedLabel({ context }: { context: BrowserContext }) {
  await context.addInitScript((label: string) => {
    const seen: number[] = []
    let showing = false
    ;(window as unknown as { __flpSavedAt: number[] }).__flpSavedAt = seen

    const check = () => {
      const now = [...document.querySelectorAll('[role="status"]')].some((node) =>
        node.textContent?.includes(label),
      )

      if (now && !showing) {
        ;(window as unknown as { __flpSavedAt: number[] }).__flpSavedAt.push(Date.now())
      }

      showing = now
    }

    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true })
  }, STATUS_SAVED)
}

async function savedShownSinceArmed({ page }: { page: Page }) {
  return page.evaluate(() => (window as unknown as { __flpSavedAt?: number[] }).__flpSavedAt?.length ?? 0)
}

/** Routes the page's saves through a plan; successes are checked first. */
async function gateSaves({ page }: { page: Page }): Promise<SaveGate> {
  const gate: SaveGate = {
    plan: [],
    sent: [],
    early: 0,
    armed: false,
    offline: false,
    arm: async () => {
      await page.evaluate(() => {
        ;(window as unknown as { __flpSavedAt: number[] }).__flpSavedAt.length = 0
      })
      gate.armed = true
    },
  }

  await page.route(VERSIONS, async (route) => {
    if (route.request().method() !== 'POST') {
      return route.continue()
    }

    const body = route.request().postDataJSON() as { mutationKey: string; baseSeq: number }
    gate.sent.push({ at: Date.now(), mutationKey: body.mutationKey, baseSeq: body.baseSeq })
    if (gate.offline) {
      return route.abort('internetdisconnected')
    }

    const next = gate.plan.shift()

    if (next) {
      return next(route)
    }

    const response = await route.fetch()

    // The page has not seen this answer yet: it must not claim success.
    if (gate.armed && response.ok()) {
      gate.early += await savedShownSinceArmed({ page })
      gate.armed = false
    }

    await route.fulfill({ response })
  })

  return gate
}

function apiError({ status, code, headers = {} }: { status: number; code: string; headers?: Record<string, string> }) {
  return (route: Route) =>
    route.fulfill({
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: { code, message: `Injected ${code}` } }),
    })
}

function statusShows({ page, text }: { page: Page; text: string | RegExp }) {
  return expect(page.getByRole('status').filter({ hasText: text })).toBeVisible({ timeout: 20_000 })
}

async function accessToken({ page }: { page: Page }) {
  // The app's Supabase session (AUTH_STORAGE_KEY in supabase-client.ts).
  return page.evaluate(() => {
    const stored = localStorage.getItem('flp-auth')
    return stored ? (JSON.parse(stored) as { access_token: string }).access_token : null
  })
}

type Layered = { panels: Record<string, { layers: unknown[] }> }

/** What the cloud holds for a design: its head and how many layers. */
async function cloudDesign({ page, designId }: { page: Page; designId: string }) {
  const token = await accessToken({ page })
  const response = await page.request.get(`/api/flp/designs/${designId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  const design = (await response.json()) as { headSeq: number; head: { content: Layered } }
  const layers = Object.values(design.head.content.panels).reduce((sum, panel) => sum + panel.layers.length, 0)
  return { headSeq: design.headSeq, layers }
}

async function ownedTitles({ page }: { page: Page }) {
  const token = await accessToken({ page })
  const response = await page.request.get('/api/flp/designs', { headers: { Authorization: `Bearer ${token}` } })
  expect(response.status()).toBe(200)
  return ((await response.json()) as { designs: Array<{ title: string }> }).designs.map((design) => design.title)
}

/** Signs a new account in and opens a fresh, saved tee. */
async function openNewDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await watchSavedLabel({ context: page.context() })
  // Leaving with unsaved work asks first; these tests leave on purpose.
  page.context().on('page', (opened) => opened.on('dialog', (dialog) => void dialog.accept()))
  page.on('dialog', (dialog) => void dialog.accept())
  const signedInAt = Date.now()
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!
  const gate = await gateSaves({ page })
  return { email, designId, gate, signedInAt, url: `/create?cloud=${designId}&step=design` }
}

test('offline mid-save keeps the work and saves it once back online', async ({ page, context }) => {
  const { designId, gate } = await openNewDesign({ page, label: 'offline' })

  // The connection drops while the save is on the wire.
  gate.plan.push(async (route) => {
    gate.offline = true
    await context.setOffline(true)
    await route.abort('internetdisconnected')
  })
  await drawStroke({ page, panel: 'Front' })
  await statusShows({ page, text: 'Offline — not saved' })
  await gate.arm()
  await statusShows({ page, text: 'Kept on this device' })

  // More work while offline stays pending too.
  await drawStroke({ page, panel: 'Back' })
  await statusShows({ page, text: 'Offline — not saved' })
  await page.waitForTimeout(5_000)
  await expect(page.getByRole('status').filter({ hasText: STATUS_SAVED })).toHaveCount(0)

  await context.setOffline(false)
  gate.offline = false
  await expectSaved({ page })
  expect(gate.early).toBe(0)
  expect((await cloudDesign({ page, designId })).layers).toBe(2)
})

test('429 pauses saving and retries the same save after Retry-After', async ({ page }) => {
  const { designId, gate } = await openNewDesign({ page, label: 'ratelimit' })
  gate.plan.push(apiError({ status: 429, code: 'rate_limited', headers: { 'Retry-After': '6' } }))

  await drawStroke({ page, panel: 'Front' })
  await statusShows({ page, text: 'Saving paused, retrying' })
  await gate.arm()
  await statusShows({ page, text: 'Kept on this device' })
  await expectSaved({ page })

  expect(gate.early).toBe(0)
  expect(gate.sent).toHaveLength(2)
  // Same revision, same key: a retry can never append twice.
  expect(gate.sent[1]!.mutationKey).toBe(gate.sent[0]!.mutationKey)
  expect(gate.sent[1]!.at - gate.sent[0]!.at).toBeGreaterThanOrEqual(5_500)
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})

test('500s on save show the failure, keep the work and retry the same save by themselves', async ({ page }) => {
  const { designId, gate } = await openNewDesign({ page, label: 'servererror' })
  gate.plan.push(apiError({ status: 500, code: 'internal' }), apiError({ status: 500, code: 'internal' }))

  await drawStroke({ page, panel: 'Front' })
  await statusShows({ page, text: 'Save failed' })
  await gate.arm()
  await statusShows({ page, text: 'Kept on this device' })
  await statusShows({ page, text: 'will retry' })
  expect((await cloudDesign({ page, designId })).layers).toBe(0)

  // Backs off (4 s, then 8 s) and lands without the creator doing anything.
  await expectSaved({ page })
  expect(gate.early).toBe(0)
  expect(gate.sent).toHaveLength(3)
  expect(new Set(gate.sent.map((save) => save.mutationKey)).size).toBe(1)
  expect(gate.sent[2]!.at - gate.sent[1]!.at).toBeGreaterThan(gate.sent[1]!.at - gate.sent[0]!.at)
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})

test('a reload during a slow save offers the local copy instead of losing it', async ({ page }) => {
  const { designId, gate, url } = await openNewDesign({ page, label: 'reloadrace' })

  // The save never reaches the server before the page goes away.
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  gate.plan.push(async (route) => {
    await held
    await route.abort('aborted').catch(() => {})
  })

  await drawStroke({ page, panel: 'Front' })
  await statusShows({ page, text: 'Saving…' })
  await statusShows({ page, text: 'Kept on this device' })
  await page.goto(url)
  release()

  // The cloud never got it; the local copy is offered, not dropped.
  expect((await cloudDesign({ page, designId })).layers).toBe(0)
  await expect(page.getByText('This browser has changes to this design that never reached the cloud.')).toBeVisible()
  await page.getByRole('button', { name: 'Recover unsaved changes' }).click()
  await expectSaved({ page })
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})

test('a reload after the server took a slow save shows it saved, with no stale prompt', async ({ page }) => {
  const { designId, gate, url } = await openNewDesign({ page, label: 'reloadack' })

  // The server commits the save, but the answer arrives after the reload.
  let committed: () => void = () => {}
  const serverHasIt = new Promise<void>((resolve) => {
    committed = resolve
  })
  gate.plan.push(async (route) => {
    const response = await route.fetch()
    committed()
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    await route.fulfill({ response }).catch(() => {})
  })

  await drawStroke({ page, panel: 'Front' })
  await serverHasIt
  await expect(page.getByRole('status').filter({ hasText: STATUS_SAVED })).toHaveCount(0)
  await page.goto(url)

  await expectSaved({ page })
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('a stale save from a second tab shows "Changed elsewhere"; opening the cloud version keeps both edits reachable', async ({
  page,
  context,
}) => {
  const { designId, url } = await openNewDesign({ page, label: 'conflictopen' })
  const second = await context.newPage()
  await second.goto(url)
  await expectSaved({ page: second })

  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })
  const gate = await gateSaves({ page: second })
  await gate.arm()
  await drawStroke({ page: second, panel: 'Back' })
  await statusShows({ page: second, text: 'Changed elsewhere' })
  expect(gate.early).toBe(0)
  await expect(second.getByRole('status').filter({ hasText: STATUS_SAVED })).toHaveCount(0)
  // The cloud kept the first tab's work; nothing was overwritten.
  expect((await cloudDesign({ page, designId })).layers).toBe(1)

  // Opening the cloud version still asks before the second tab's edit goes.
  await second.getByRole('button', { name: 'Open cloud version' }).click()
  await expect(second.getByText(/changes to an older version of this design/)).toBeVisible()
  await expectSaved({ page: second })
  await second.getByRole('alertdialog').getByRole('button', { name: 'Open cloud version' }).click()
  await expect(second.getByRole('alertdialog')).toHaveCount(0)
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})

test('a save in one tab never drops another tab’s unsaved local copy', async ({ page, context }) => {
  const { designId, url } = await openNewDesign({ page, label: 'twotabkeep' })
  const second = await context.newPage()
  await second.goto(url)
  await expectSaved({ page: second })

  // Tab A saves; tab B's edit then conflicts and is only on this device.
  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })
  await drawStroke({ page: second, panel: 'Back' })
  await statusShows({ page: second, text: 'Changed elsewhere' })
  await statusShows({ page: second, text: 'Kept on this device' })

  // Tab A saves again: its acknowledgement clears its own copy only.
  expect((await cloudDesign({ page, designId })).headSeq).toBe(2)
  await drawStroke({ page, panel: 'Back' })
  await expect.poll(async () => (await cloudDesign({ page, designId })).headSeq, { timeout: 20_000 }).toBe(3)
  await expectSaved({ page })

  // Tab B reloads and is still offered its work, as changes to an older version.
  await second.goto(url)
  const prompt = second.getByRole('alertdialog')
  await expect(prompt.getByText(/changes to an older version of this design/)).toBeVisible()
  await prompt.getByRole('button', { name: 'Open cloud version' }).click()
  await expect(prompt).toHaveCount(0)

  // Answered once, never offered twice.
  await second.goto(url)
  await expectSaved({ page: second })
  await expect(second.getByRole('alertdialog')).toHaveCount(0)
  expect(await cloudDesign({ page, designId })).toEqual({ headSeq: 3, layers: 2 })
})

test('"Save mine as a copy" makes exactly one copy despite a lost answer and a double click', async ({
  page,
  context,
}) => {
  const { designId, url } = await openNewDesign({ page, label: 'conflictcopy' })
  const second = await context.newPage()
  await second.goto(url)
  await expectSaved({ page: second })

  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })
  await drawStroke({ page: second, panel: 'Back' })
  await statusShows({ page: second, text: 'Changed elsewhere' })

  // The first create reaches the server but its answer is lost.
  const creates: string[] = []
  let lose = true
  await second.route('**/api/flp/designs', async (route) => {
    if (route.request().method() !== 'POST') {
      return route.continue()
    }

    creates.push((route.request().postDataJSON() as { mutationKey: string }).mutationKey)
    const response = await route.fetch()

    if (lose) {
      lose = false
      return route.abort('connectionreset')
    }

    // Slow enough that a double click lands while it is in flight.
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    return route.fulfill({ response })
  })

  const copy = second.getByRole('button', { name: 'Save mine as a copy' })
  await copy.click()
  await expect(second.getByRole('alert').filter({ hasText: 'The copy could not be saved' })).toBeVisible()
  await expect(second.getByRole('status').filter({ hasText: 'Changed elsewhere' })).toBeVisible()

  await copy.dblclick()
  await expect(second).not.toHaveURL(new RegExp(designId))
  await expect(second).toHaveURL(/\/create\?cloud=[0-9a-f-]+/)
  await expectSaved({ page: second })

  expect(new Set(creates).size).toBe(1)
  const titles = await ownedTitles({ page: second })
  expect(titles.filter((title) => title.endsWith('(copy)'))).toHaveLength(1)
  expect(titles).toHaveLength(2)
  const copyId = new URL(second.url()).searchParams.get('cloud')!
  expect((await cloudDesign({ page: second, designId: copyId })).layers).toBe(1)
  // The original is untouched by the copy.
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})

test('a full local store shows the storage warning and still saves to the cloud', async ({ page, context }) => {
  await context.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if ((window as unknown as { __flpQuotaFull?: boolean }).__flpQuotaFull) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }

      return put.apply(this, args)
    }
  })
  const { designId, gate } = await openNewDesign({ page, label: 'quota' })
  await page.evaluate(() => {
    ;(window as unknown as { __flpQuotaFull: boolean }).__flpQuotaFull = true
  })

  gate.plan.push((route) => route.abort('internetdisconnected'))
  await drawStroke({ page, panel: 'Front' })
  await expect(page.getByRole('alert').filter({ hasText: 'This device is out of space for a local copy' })).toBeVisible()
  await statusShows({ page, text: 'Offline — not saved' })
  await gate.arm()
  // Nothing claims the work is kept locally when it is not.
  await expect(page.getByText('Kept on this device')).toHaveCount(0)

  await expectSaved({ page })
  expect(gate.early).toBe(0)
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})

test('a session that expires mid-edit sends the creator to sign-in and offers the local copy after', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const { email, designId, gate, signedInAt, url } = await openNewDesign({ page, label: 'expiry' })

  // The server rejects the token and the refresh fails too.
  gate.plan.push(apiError({ status: 401, code: 'unauthenticated' }))
  const refresh = (url: URL) => url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token'
  await page.route(refresh, (route) =>
    route.fulfill({
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh Token Not Found' }),
    }),
  )

  await drawStroke({ page, panel: 'Front' })
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/)
  await page.unroute(refresh)
  expect(gate.sent).toHaveLength(1)

  // Auth refuses a second code for the same email within a minute.
  await page.waitForTimeout(Math.max(0, signedInAt + 62_000 - Date.now()))
  await signIn({ page, email, returnTo: url })

  await expect(page.getByText('This browser has changes to this design that never reached the cloud.')).toBeVisible()
  await page.getByRole('button', { name: 'Recover unsaved changes' }).click()
  await expectSaved({ page })
  expect((await cloudDesign({ page, designId })).layers).toBe(1)
})
