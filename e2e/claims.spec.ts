import { type Page, expect, test } from '@playwright/test'

import { FORBIDDEN_CLAIMS } from '../src/lib/claims-patterns'
import { TINY_JPEG } from '../src/lib/image-fixtures'
import { PUBLIC_RENDER_KINDS } from '../src/lib/flp-api/render-kinds.mjs'
import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * What the public pages and the studio say, read as a visitor reads them
 * (R13, R14, section 10). Keeps removed claims from coming back: fit and size,
 * fabric, manufacturing, invented traction, sample people and uncleared stills.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const FORBIDDEN = FORBIDDEN_CLAIMS

async function expectNoClaims({ page, name }: { page: Page; name: string }) {
  // A shared design's own vote count (V1) is read from the database, not
  // claimed; everything else on the page still is checked.
  const live = await page.getByTestId('vote-count').allInnerTexts()
  // Field values too: sample titles and tags sit in inputs, which innerText skips.
  const fields = await page
    .locator('input:visible, textarea:visible')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value))
  const text = [live.reduce((rest, count) => rest.replace(count, ''), await page.locator('body').innerText()), ...fields].join('\n')

  for (const [what, pattern] of FORBIDDEN) {
    expect(text.match(pattern)?.[0] ?? null, `${what} on ${name}`).toBeNull()
  }

  const stills = await page.locator('img[src*="/stills/"]').count()
  expect(stills, `uncleared stills on ${name}`).toBe(0)
}

test('the landing and all its sections make no claim the alpha cannot back, and label its concepts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sketch it.')

  // Closed FAQ answers aren't in innerText; open them all first.
  await page.locator('#faq details').evaluateAll((items) => items.forEach((item) => item.setAttribute('open', '')))

  for (const section of ['product', 'flow', 'features', 'vote', 'alpha', 'faq', 'waitlist']) {
    await page.locator(`#${section}`).scrollIntoViewIfNeeded()
    await expect(page.locator(`#${section}`)).toBeVisible()
  }

  await expectNoClaims({ page, name: 'landing' })

  // Every concept on the page wears its badge (docs/claims-audit.md, R1).
  const concepts = page.locator('[data-claim="concept"]')
  expect(await concepts.count()).toBeGreaterThan(0)

  for (const concept of await concepts.all()) {
    await expect(concept.getByText('Concept preview')).toBeVisible()
  }

  await page.goto('/sign-in')
  await expectNoClaims({ page, name: 'sign-in' })

  // The board lists published designs and sends voters to each one (V1, V2).
  await page.goto('/vote')
  await expect(page.getByRole('heading', { name: 'Top designs' })).toBeVisible()
  await expect(page.getByText('Open one to see every side and vote.')).toBeVisible()
  await expectNoClaims({ page, name: 'vote' })
})

test('the studio, shared page and privacy page make no such claim, and the page can be reported', async ({ page, browser, request }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'claims' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  for (const step of ['select', 'fit', 'color', 'design', 'preview', 'share']) {
    await page.goto(`/create?cloud=${designId}&step=${step}`)
    await expectSaved({ page })
    await expectNoClaims({ page, name: `studio ${step}` })
  }

  // Publish directly: what's checked here is what the page says.
  const { token, seq } = await page.evaluate(async (id) => {
    const accessToken = JSON.parse(localStorage.getItem('flp-auth')!).access_token as string
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    return { token: accessToken, seq: (await response.json()).headSeq as number }
  }, designId)
  const headers = { Authorization: `Bearer ${token}` }
  const data = Buffer.from(TINY_JPEG).toString('base64')
  const renders = PUBLIC_RENDER_KINDS.map((kind: string) => ({ kind, data }))
  expect((await request.post(`/api/flp/designs/${designId}/renders`, { headers, data: { seq, renders } })).status()).toBeLessThan(300)
  const published = await request.post(`/api/flp/designs/${designId}/publication`, { headers, data: { seq } })
  const { slug } = (await published.json()) as { slug: string }

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/s/${slug}`)
  await expect(visitor.getByText('Creator-supplied preview, not a certified fit or manufacturing render.')).toBeVisible()
  await expect(visitor.getByTestId('vote-count')).toHaveText('0 votes')
  await expectNoClaims({ page: visitor, name: 'shared page' })
  const report = visitor.getByRole('link', { name: 'Report this design' })
  await expect(report).toHaveAttribute('href', new RegExp(`^mailto:[^?]+@[^?]+\\?.*${slug}`))
  await visitor.context().close()

  await page.goto('/privacy')
  await expectNoClaims({ page, name: 'privacy' })
  const privacy = page.getByRole('main')

  for (const line of [
    'What is stored',
    'Your email address, to send sign-in codes. There are no passwords.',
    'Who can see it',
    'Only you can see your designs, history, uploads and votes.',
    'The counts carry no email, account, design or device identifiers and no design content.',
    'Removing your data',
    'Reporting a design',
  ]) {
    await expect(privacy).toContainText(line)
  }

  await expect(privacy.getByRole('link', { name: /@/ }).first()).toHaveAttribute('href', /^mailto:/)
  const notices = await request.get('/third-party-notices.txt')
  expect(notices.status()).toBe(200)
  expect(await notices.text()).toContain('SIL Open Font License')
})

test('deleting a design names it, can be backed out of, and then removes it', async ({ page }) => {
  const email = newEmail({ label: 'deletename' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const renamed = page.waitForResponse((response) => response.request().method() === 'PATCH')
  await page.getByRole('textbox', { name: 'Design name' }).fill('Keep or not')
  await page.getByRole('textbox', { name: 'Design name' }).press('Enter')
  await renamed
  await page.goto('/studio')

  const card = page.getByRole('listitem').filter({ hasText: 'Keep or not' })
  await card.getByRole('button', { name: 'Delete' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete “Keep or not”?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep it' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Delete' }).click()
  await dialog.getByRole('button', { name: 'Delete design' }).click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Create a T-shirt' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Keep or not' })).toHaveCount(0)
})
