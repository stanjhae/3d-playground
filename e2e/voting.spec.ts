import { type APIRequestContext, expect, test } from '@playwright/test'

import { TINY_JPEG } from '../src/lib/image-fixtures'
import { PUBLIC_RENDER_KINDS } from '../src/lib/flp-api/render-kinds.mjs'
import { deleteAccounts, expectNoCspViolations, expectSaved, newEmail, signIn, watchCsp } from './helpers'

/**
 * Account votes on a shared design (V1): signed out the page offers
 * sign-in and comes back; one vote per account, kept across a reload and a
 * republish; and the guest board's vote endpoint is gone.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('sign in to vote, vote once, take it back, and keep votes across a republish', async ({ page, browser, request }) => {
  test.setTimeout(150_000)
  const violations = await watchCsp({ context: page.context() })
  const owner = newEmail({ label: 'vote-owner' })
  const voter = newEmail({ label: 'voter' })
  emails.push(owner, voter)

  // The owner publishes directly: what's checked here is voting.
  await signIn({ page, email: owner })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!
  const { token, seq } = await page.evaluate(async (id) => {
    const accessToken = JSON.parse(localStorage.getItem('flp-auth')!).access_token as string
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    return { token: accessToken, seq: (await response.json()).headSeq as number }
  }, designId)
  const headers = { Authorization: `Bearer ${token}` }
  const data = Buffer.from(TINY_JPEG).toString('base64')
  const renders = PUBLIC_RENDER_KINDS.map((kind: string) => ({ kind, data }))
  expect((await request.post(`/api/flp/designs/${designId}/renders`, { headers, data: { seq, renders } })).status()).toBeLessThan(300)

  async function publish({ api }: { api: APIRequestContext }) {
    const published = await api.post(`/api/flp/designs/${designId}/publication`, { headers, data: { seq } })
    expect(published.status()).toBeLessThan(300)
    return ((await published.json()) as { slug: string }).slug
  }

  const slug = await publish({ api: request })

  // Signed out: the count and a way to sign in that comes back here.
  const visitorContext = await browser.newContext()
  await watchCsp({ context: visitorContext, violations })
  const visitor = await visitorContext.newPage()
  await visitor.goto(`/s/${slug}`)
  const count = visitor.getByTestId('vote-count')
  await expect(count).toHaveText('0 votes')
  const signInToVote = visitor.getByRole('link', { name: 'Sign in to vote' })
  await expect(visitor.getByRole('button', { name: 'Vote' })).toHaveCount(0)
  // A direct cast without a session counts nothing.
  expect((await visitor.request.post(`/api/flp/public/${slug}/vote`)).status()).toBe(401)
  await signInToVote.click()
  await expect(visitor).toHaveURL(/\/sign-in\?/)
  expect(new URL(visitor.url()).searchParams.get('returnTo')).toBe(`/s/${slug}`)

  await signIn({ page: visitor, email: voter, returnTo: `/s/${slug}` })
  const vote = visitor.getByRole('button', { name: 'Vote', exact: true })
  await expect(vote).toHaveAttribute('aria-pressed', 'false')
  await vote.click()
  const voted = visitor.getByRole('button', { name: 'Voted', exact: true })
  await expect(voted).toHaveAttribute('aria-pressed', 'true')
  await expect(count).toHaveText('1 vote')

  // Kept across a reload, and seen by someone signed out.
  await visitor.reload()
  await expect(voted).toBeVisible()
  await expect(count).toHaveText('1 vote')
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()
  await strangerPage.goto(`/s/${slug}`)
  await expect(strangerPage.getByTestId('vote-count')).toHaveText('1 vote')

  // Voting is a toggle: take it back, then vote again.
  await voted.click()
  await expect(vote).toHaveAttribute('aria-pressed', 'false')
  await expect(count).toHaveText('0 votes')
  await vote.click()
  await expect(count).toHaveText('1 vote')

  // Unpublished, the page is gone; published again, the vote is still there.
  expect((await request.delete(`/api/flp/designs/${designId}/publication`, { headers })).status()).toBe(204)
  await visitor.reload()
  await expect(visitor.getByRole('heading', { name: 'This design is not available' })).toBeVisible()
  expect(await publish({ api: request })).toBe(slug)
  await visitor.reload()
  await expect(voted).toBeVisible()
  await expect(count).toHaveText('1 vote')

  // The owner sees the count, not the voter's vote.
  await page.goto(`/s/${slug}`)
  await expect(page.getByRole('button', { name: 'Vote', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('vote-count')).toHaveText('1 vote')

  await stranger.close()
  await visitorContext.close()
  expectNoCspViolations({ violations })
})

test('the guest board vote endpoint is retired', async ({ request }) => {
  const byQuery = await request.post('/api/designs?voteId=look-atelier-ivory')
  expect(byQuery.status()).toBe(410)
  expect((await request.post('/api/designs/look-atelier-ivory/vote')).status()).toBe(404)
})
