import { type Page, expect, test } from '@playwright/test'

import { TINY_JPEG } from '../src/lib/image-fixtures'
import { PUBLIC_RENDER_KINDS } from '../src/lib/flp-api/render-kinds.mjs'
import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Tester pass 3, votes and ranking: one honest count everywhere with held
 * votes beside it, ties marked on Ranking, a note on Vote about your own
 * designs, no voting on your own design, and a My Studio picture that stays
 * put while a design is unpublished.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

/** Creates and publishes a tee from My Studio; returns its id and slug. */
async function publishTee({ page }: { page: Page }) {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  // Through the API, not the page, which may still be moving between studio steps.
  let token = ''
  await expect(async () => {
    token = await page.evaluate(() => JSON.parse(localStorage.getItem('flp-auth')!).access_token as string)
    expect(token).toBeTruthy()
  }).toPass()
  const headers = { Authorization: `Bearer ${token}` }
  const seq = ((await (await page.request.get(`/api/flp/designs/${designId}`, { headers })).json()) as { headSeq: number }).headSeq
  const renders = PUBLIC_RENDER_KINDS.map((kind: string) => ({ kind, data: Buffer.from(TINY_JPEG).toString('base64') }))
  expect((await page.request.post(`/api/flp/designs/${designId}/renders`, { headers, data: { seq, renders } })).status()).toBeLessThan(300)
  const published = await page.request.post(`/api/flp/designs/${designId}/publication`, { headers, data: { seq } })
  expect(published.status()).toBeLessThan(300)
  const slug = ((await published.json()) as { slug: string }).slug

  return { designId, slug }
}

test('a new account’s vote reads the same on the share page, My Studio and Ranking', async ({ page, browser }) => {
  test.setTimeout(150_000)
  const owner = newEmail({ label: 'p3-owner' })
  const voter = newEmail({ label: 'p3-voter' })
  emails.push(owner, voter)

  await signIn({ page, email: owner })
  const { slug } = await publishTee({ page })

  // The owner can't vote for their own design, and the page says why.
  await page.goto(`/s/${slug}`)
  const own = page.getByRole('button', { name: 'Your design', exact: true })
  await expect(own).toBeDisabled()
  await expect(page.getByText('You can’t vote for your own design.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vote', exact: true })).toHaveCount(0)
  // The API refuses one too.
  const direct = await page.evaluate(async (s) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token as string
    return (await fetch(`/api/flp/public/${s}/vote`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status
  }, slug)
  expect(direct).toBe(409)

  // A minutes-old account votes: the count stays the counted number, the held vote is beside it.
  const voterContext = await browser.newContext()
  const visitor = await voterContext.newPage()
  await signIn({ page: visitor, email: voter, returnTo: `/s/${slug}` })
  await expect(visitor.getByText(/Only votes from accounts more than a day old count/)).toBeVisible()
  const count = visitor.getByTestId('vote-count')
  await expect(count).toHaveText('0 votes')
  // A first vote asks for the terms, then lands.
  await visitor.getByRole('button', { name: 'Vote', exact: true }).click()
  const landed = visitor.waitForResponse(
    (response) => response.url().endsWith(`/public/${slug}/vote`) && response.request().method() === 'POST' && response.status() === 200,
  )
  await visitor.getByRole('button', { name: 'Accept and vote' }).click()
  await landed
  await expect(visitor.getByRole('button', { name: 'Voted', exact: true })).toBeVisible()
  // Never "1 vote" here while Ranking says 0 (the tester's report).
  await expect(count).toHaveText('0 votes')
  await expect(visitor.getByTestId('vote-pending')).toHaveText('+1 pending (counts within 24 h)')

  // Ranking: the same numbers.
  await visitor.goto('/ranking')
  const ranked = visitor.getByRole('listitem').filter({ has: visitor.locator(`a[href="/s/${slug}"]`) })
  await expect(ranked.getByTestId('vote-count')).toHaveText('0 votes')
  await expect(ranked.getByTestId('vote-pending')).toHaveText('+1 pending (counts within 24 h)')

  // My Studio: the same numbers, with the rule.
  await page.goto('/studio')
  const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Unpublish / }) })
  await expect(card.getByTestId('vote-count')).toHaveText('0 votes')
  await expect(card.getByTestId('vote-pending')).toHaveText('+1 pending (counts within 24 h)')
  await expect(card.getByText('Only votes from accounts over a day old count.')).toBeVisible()

  await voterContext.close()
})

test('ties on Ranking are marked and the rule is on the page', async ({ page }) => {
  test.setTimeout(150_000)
  const owner = newEmail({ label: 'p3-ties' })
  emails.push(owner)

  await signIn({ page, email: owner })
  const first = await publishTee({ page })
  const second = await publishTee({ page })

  await page.goto('/ranking')
  await expect(page.getByTestId('tie-rule')).toContainText('share a rank, shown as =3')

  // Both have no votes: the same rank, each marked tied.
  const cards = [first, second].map(({ slug }) => page.getByRole('listitem').filter({ has: page.locator(`a[href="/s/${slug}"]`) }))
  const ranks = []

  for (const card of cards) {
    await expect(card.getByText('Tied', { exact: true })).toBeVisible()
    ranks.push(await card.getByLabel(/^Tied for rank \d+$/).getAttribute('aria-label'))
  }

  expect(ranks[0]).toBe(ranks[1])
})

test('Vote says your own designs aren’t there, and My Studio keeps the picture while unpublishing', async ({ page }) => {
  test.setTimeout(150_000)
  const owner = newEmail({ label: 'p3-own' })
  emails.push(owner)

  await signIn({ page, email: owner })
  const { slug } = await publishTee({ page })

  await page.goto('/vote')
  await expect(page.getByText('Loading designs…')).toHaveCount(0)
  await expect(page.locator(`a[href="/s/${slug}"]`)).toHaveCount(0)
  const note = page.getByTestId('own-designs-note')
  await expect(note).toContainText('Your own designs aren’t shown here')
  await note.getByRole('link', { name: 'My Studio' }).click()
  await expect(page).toHaveURL(/\/studio$/)

  // The published card shows its stored picture; unpublishing never drops it to the placeholder.
  const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Unpublish / }) })
  const picture = card.locator('[data-thumbnail]')
  await expect(picture).toHaveAttribute('data-thumbnail', 'render')
  await picture.evaluate((element) => {
    const seen: string[] = []
    ;(window as unknown as { thumbnailsSeen: string[] }).thumbnailsSeen = seen
    new MutationObserver(() => seen.push(element.getAttribute('data-thumbnail') ?? '')).observe(element, {
      attributes: true,
      attributeFilter: ['data-thumbnail'],
    })
  })

  await card.getByRole('button', { name: /^Unpublish / }).click()
  await page.getByRole('button', { name: 'Yes, unpublish' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Unpublished / })).toBeAttached()
  const privateCard = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Publish…' }) })
  await expect(privateCard.locator('[data-thumbnail]')).toHaveAttribute('data-thumbnail', 'still')
  expect(await page.evaluate(() => (window as unknown as { thumbnailsSeen: string[] }).thumbnailsSeen)).not.toContain('placeholder')
})
