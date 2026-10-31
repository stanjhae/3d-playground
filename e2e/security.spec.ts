import { expect, test } from '@playwright/test'

import { deleteAccounts, expectNoCspViolations, newEmail, signIn, watchCsp } from './helpers'

/**
 * Browser security controls (Q02 #187): the headers every page gets, the
 * CSP actually blocking injected script, and stored markup showing as text.
 */

const XSS_TITLE = '<img src=x onerror="window.__xss=1">'
const XSS_NAME = '<script>window.__xss=1</script>'
const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

test('every page gets the security headers', async ({ page }) => {
  for (const path of ['/', '/s/0000000000000000', '/api/flp/public/0000000000000000']) {
    const headers = (await page.request.get(path)).headers()
    expect(headers['content-security-policy'], path).toContain("default-src 'self'")
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy'], path).not.toContain("'unsafe-eval'")
    expect(headers['content-security-policy'], path).not.toContain("'unsafe-inline'")
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy'], path).toContain('camera=()')
  }
})

test('the policy blocks injected script, and the watcher sees it', async ({ page, context }) => {
  const violations = await watchCsp({ context })
  await page.goto('/')
  await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__xss = 1'
    document.head.append(script)
  })
  await expect.poll(() => violations.length).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
})

test('signed-out pages load with no CSP violations', async ({ page, context }) => {
  const violations = await watchCsp({ context })

  for (const path of ['/', '/sign-in', '/privacy', '/vote', '/s/0000000000000000']) {
    await page.goto(path)
    // The landing scene keeps loading, so there's no network-idle moment.
    await page.waitForLoadState('load')
    await page.waitForTimeout(2_000)
  }

  expectNoCspViolations({ violations })
})

test('a published title and public name show as text', async ({ page, context }) => {
  const violations = await watchCsp({ context })
  const slug = 'abcdef0123456789'
  // The public API is stubbed: what's under test is how the page renders
  // stored strings, not publishing.
  await page.route(`**/api/flp/public/${slug}`, (route) =>
    route.fulfill({
      json: {
        slug,
        title: XSS_TITLE,
        displayName: XSS_NAME,
        seq: 1,
        publishedAt: '2026-10-31T12:00:00.000Z',
        renders: {
          view_front: '/favicon.svg',
          view_three_quarter: '/favicon.svg',
          view_back: '/favicon.svg',
        },
      },
    }),
  )
  await page.goto(`/s/${slug}`)

  await expect(page.getByRole('heading', { name: XSS_TITLE })).toBeVisible()
  await expect(page.getByText(`By ${XSS_NAME}`)).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
  expectNoCspViolations({ violations })
})

test('a design title and words show as text in the editor and My Studio', async ({ page, context }) => {
  const violations = await watchCsp({ context })
  const email = newEmail({ label: 'xss' })
  emails.push(email)
  await signIn({ page, email })

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  const title = page.getByRole('textbox', { name: 'Design name' })
  await title.fill(XSS_TITLE)
  await title.press('Enter')
  await expect(title).toHaveValue(XSS_TITLE)
  await page.getByPlaceholder('Type').fill(XSS_NAME)
  await page.getByRole('button', { name: 'Type', exact: true }).click()
  const back = await page.locator('canvas[aria-label^="Design panel Back"]').boundingBox()
  await page.mouse.click(back!.x + back!.width / 2, back!.y + back!.height / 3)
  await expect(page.getByText(XSS_NAME, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Saved to cloud' })).toBeVisible({ timeout: 20_000 })

  await page.goto('/studio')
  await expect(page.getByRole('listitem').filter({ hasText: XSS_TITLE })).toBeVisible()
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
  expectNoCspViolations({ violations })
})
