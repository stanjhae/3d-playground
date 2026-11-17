import { expect, test } from '@playwright/test'

import { TINY_JPEG } from '../src/lib/image-fixtures'
import { PUBLIC_RENDER_KINDS } from '../src/lib/flp-api/render-kinds.mjs'
import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Comments and follows (community). Off in production until the owner
 * turns them on; the suite runs with VITE_COMMUNITY and FLP_COMMUNITY on
 * (playwright.config.ts).
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('comment on a design, hide it as its owner, and follow its designer', async ({ page, browser, request }) => {
  test.setTimeout(150_000)
  const owner = newEmail({ label: 'community-owner' })
  const fan = newEmail({ label: 'community-fan' })
  emails.push(owner, fan)

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
  const published = await request.post(`/api/flp/designs/${designId}/publication`, { headers, data: { seq } })
  const { slug } = (await published.json()) as { slug: string }
  const handle = `cm-${Date.now().toString(36)}`
  expect((await request.post('/api/flp/profile', { headers, data: { handle, profilePublic: true } })).status()).toBe(200)

  // Signed out: comments read, and commenting asks for sign-in.
  const fanContext = await browser.newContext()
  const fanPage = await fanContext.newPage()
  await fanPage.goto(`/s/${slug}`)
  await expect(fanPage.getByRole('heading', { name: 'Comments (0)' })).toBeVisible()
  await expect(fanPage.getByText('No comments yet.')).toBeVisible()
  await expect(fanPage.getByRole('link', { name: 'Sign in to comment' })).toBeVisible()

  // The fan signs in through My Studio (which asks for the terms), then comments.
  await signIn({ page: fanPage, email: fan })
  await fanPage.goto(`/s/${slug}`)
  await fanPage.getByRole('textbox', { name: 'Add a comment' }).fill('Love the cuffs')
  await fanPage.getByRole('button', { name: 'Post comment' }).click()
  await expect(fanPage.getByRole('heading', { name: 'Comments (1)' })).toBeVisible()
  await expect(fanPage.getByText('Love the cuffs')).toBeVisible()
  await expect(fanPage.getByRole('button', { name: 'Delete' })).toBeVisible()

  // The owner sees it and hides it; it's gone for everyone.
  await page.goto(`/s/${slug}`)
  await expect(page.getByText('Love the cuffs')).toBeVisible()
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(page.getByText('Comment hidden')).toBeVisible()
  await fanPage.reload()
  await expect(fanPage.getByRole('heading', { name: 'Comments (0)' })).toBeVisible()

  // The fan follows the owner; their design shows under Following.
  await fanPage.goto(`/u/${handle}`)
  const follow = fanPage.getByRole('button', { name: 'Follow', exact: true })
  await expect(fanPage.getByTestId('follower-count')).toHaveText('0 followers')
  await follow.click()
  await expect(fanPage.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(fanPage.getByTestId('follower-count')).toHaveText('1 follower')
  await fanPage.goto('/ranking')
  await fanPage.getByRole('tab', { name: 'Following' }).click()
  await expect(fanPage.locator(`a[href="/s/${slug}"]`)).toBeVisible()

  // Signing out on the Following tab goes back to the rankings, not an error.
  await fanPage.getByRole('button', { name: 'Sign out' }).click()
  await fanPage.goto('/ranking')
  await expect(fanPage.getByRole('tab', { name: 'Following' })).toHaveCount(0)
  await expect(fanPage.getByRole('tab', { name: 'Rankings' })).toHaveAttribute('aria-selected', 'true')
  await expect(fanPage.locator(`a[href="/s/${slug}"]`)).toBeVisible()

  // Someone who signs in from the shared link accepts the terms right there to comment.
  const newcomer = newEmail({ label: 'community-newcomer' })
  emails.push(newcomer)
  const newcomerPage = await (await browser.newContext()).newPage()
  await signIn({ page: newcomerPage, email: newcomer, returnTo: `/s/${slug}` })
  await newcomerPage.getByRole('textbox', { name: 'Add a comment' }).fill('First time here')
  await newcomerPage.getByRole('button', { name: 'Post comment' }).click()
  await expect(newcomerPage.getByRole('link', { name: 'terms of use' })).toBeVisible()
  await newcomerPage.getByRole('button', { name: 'Accept and post' }).click()
  await expect(newcomerPage.getByText('First time here')).toBeVisible()
  await expect(newcomerPage.getByRole('heading', { name: 'Comments (1)' })).toBeVisible()
  await newcomerPage.context().close()

  // The owner can't follow themselves: their page shows the count only.
  await page.goto(`/u/${handle}`)
  await expect(page.getByTestId('follower-count')).toHaveText('1 follower')
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveCount(0)

  await fanContext.close()
})
