import { type Page, type Route, expect, test } from '@playwright/test'

import { deleteAccounts, latestCode, newEmail } from './helpers'

/**
 * When the sign-in email can't go out (A01 #145): what the person sees, and
 * that they can still get in. The refused sends use the answers local Auth
 * really gives with its mail server stopped and past its email limit.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const OTP = '**/auth/v1/otp'
/**
 * Auth refuses a second code for one email within a minute. The page counts
 * that minute from the answer, which comes after the email the test reads,
 * and redraws once a second, so the button can be a few seconds later.
 */
const RESEND_WAIT_MS = 70_000

function answer({ status, body }: { status: number; body: Record<string, unknown> }) {
  return (route: Route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body),
    })
}

const MAIL_DOWN = answer({
  status: 500,
  body: { code: 500, error_code: 'unexpected_failure', msg: 'Error sending magic link email' },
})

function account({ label }: { label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  return email
}

async function askForCode({ page, email }: { page: Page; email: string }) {
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
}

async function finishSignIn({ page, email, after }: { page: Page; email: string; after: number }) {
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByRole('textbox', { name: '6-digit code' }).fill(await latestCode({ email, after }))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
}

test('asking again too soon is refused by the server, says to wait, and works after the wait', async ({ page }) => {
  test.setTimeout(150_000)
  const email = account({ label: 'throttled' })

  await page.goto('/sign-in')
  await askForCode({ page, email })
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  // A reload keeps the code step, but a new tab starts afresh with no
  // countdown, so only the server stops this one.
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  const refused = page.waitForResponse((response) => response.url().includes('/auth/v1/otp'))
  await askForCode({ page, email })
  const response = await refused
  expect(response.status()).toBe(429)
  const refusal = await response.json()
  expect(refusal.code ?? refusal.error_code).toBe('over_email_send_rate_limit')

  await expect(page.getByRole('status')).toContainText('Too many attempts')
  const field = page.getByRole('textbox', { name: 'Email' })
  await expect(field).toHaveValue(email)
  await expect(page.getByRole('button', { name: /Try again in \d+s/ })).toBeDisabled()

  const send = page.getByRole('button', { name: 'Email me a code' })
  await expect(send).toBeEnabled({ timeout: RESEND_WAIT_MS })
  const after = Date.now() - 2_000
  await send.click()
  await finishSignIn({ page, email, after })
})

test('the email limit for the hour says it can take longer than a minute', async ({ page }) => {
  await page.route(OTP, answer({
    status: 429,
    body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' },
  }))

  await page.goto('/sign-in')
  await askForCode({ page, email: 'limit@example.com' })
  await expect(page.getByRole('status')).toContainText('Wait a minute')
  await expect(page.getByRole('status')).toContainText('in an hour')
  await expect(page.getByRole('button', { name: /Try again in \d+s/ })).toBeDisabled()
})

test('a send that fails says the email did not go, keeps the address, and can be tried again', async ({ page }) => {
  test.setTimeout(90_000)
  const email = account({ label: 'send-failed' })
  await page.route(OTP, MAIL_DOWN, { times: 1 })

  await page.goto('/sign-in')
  await askForCode({ page, email })
  await expect(page.getByRole('status')).toContainText('could not send your code')
  await expect(page.getByRole('heading', { name: 'Sign in with a code' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(email)

  const send = page.getByRole('button', { name: 'Email me a code' })
  await expect(send).toBeEnabled()
  const after = Date.now() - 2_000
  await send.click()
  await finishSignIn({ page, email, after })
})

test('a service outage is not blamed on the connection, and no connection is', async ({ page }) => {
  await page.route(OTP, answer({ status: 503, body: { message: 'unavailable' } }), { times: 1 })
  await page.goto('/sign-in')
  await askForCode({ page, email: 'outage@example.com' })
  await expect(page.getByRole('status')).toContainText('could not send your code')

  await page.route(OTP, (route) => route.abort('internetdisconnected'), { times: 1 })
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByRole('status')).toContainText('Check your connection')
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeEnabled()
})

test('a new code that fails to send leaves the first code usable', async ({ page }) => {
  test.setTimeout(150_000)
  const email = account({ label: 'resend-failed' })

  await page.goto('/sign-in')
  const after = Date.now() - 2_000
  await askForCode({ page, email })
  const first = await latestCode({ email, after })

  const resend = page.getByRole('button', { name: 'Send a new code', exact: true })
  await expect(resend).toBeEnabled({ timeout: RESEND_WAIT_MS })
  await page.route(OTP, MAIL_DOWN, { times: 1 })
  await resend.click()
  await expect(page.getByRole('status')).toContainText('could not send your code')
  await expect(resend).toBeEnabled()

  const field = page.getByRole('textbox', { name: '6-digit code' })
  await field.fill(first)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
})
