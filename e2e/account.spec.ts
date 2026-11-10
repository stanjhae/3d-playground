// The plain Playwright `test`, not ./fixtures: these tests meet the terms
// gate themselves instead of having it accepted for them.
import { type Page, expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

import { TERMS_VERSION } from '../src/lib/terms'
import { listFilesUnder } from '../src/lib/flp-api/storage-tree.mjs'
import {
  createExistingAccount,
  deleteAccounts,
  expectSaved,
  newEmail,
  publishWithPlaceholders,
  signIn,
} from './helpers'

/**
 * Trust and accounts (P1): terms of use accepted once per account, and
 * self-serve account deletion from My Studio.
 */

// These tests read and write accounts directly, so they need the secret key
// of the stack the app uses (local, or a test environment).
const fileEnv = loadEnv('development', process.cwd(), ['SUPABASE_'])
const env = { ...fileEnv, ...process.env }
test.skip(!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY, 'needs SUPABASE_URL and SUPABASE_SECRET_KEY')

const admin = () =>
  createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function userIdFor({ email }: { email: string }) {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((user) => user.email === email)?.id ?? null
}

async function acceptedVersion({ email }: { email: string }) {
  const id = await userIdFor({ email })
  const { data } = await admin().from('profiles').select('terms_version, terms_accepted_at, display_name').eq('owner_id', id!).maybeSingle()
  return data
}

const termsGate = (page: Page) => page.getByRole('heading', { name: 'Terms of use', level: 1 })
const myStudio = (page: Page) => page.getByRole('button', { name: 'Create a T-shirt' })

test('a new account accepts the terms once, after its first sign-in', async ({ page }) => {
  const email = newEmail({ label: 'terms-new' })
  emails.push(email)
  await signIn({ page, email, acceptTerms: false })

  // My Studio waits behind the terms; they can be read first.
  await expect(termsGate(page)).toBeVisible()
  await expect(myStudio(page)).toHaveCount(0)
  await page.getByRole('link', { name: 'Read the terms of use' }).click()
  await expect(page).toHaveURL(/\/terms$/)
  await expect(page).toHaveTitle('Terms of use · Fashion Leader Vote')
  await expect(page.getByRole('main')).toContainText(`version ${TERMS_VERSION}`)
  await expect(page.getByRole('heading', { name: 'What you may upload and publish' })).toBeVisible()
  expect(await acceptedVersion({ email })).toBeNull()

  await page.goto('/studio')
  await expect(termsGate(page)).toBeVisible()
  await page.getByRole('button', { name: 'Accept and continue' }).click()
  await expect(myStudio(page)).toBeVisible()

  const stored = await acceptedVersion({ email })
  expect(stored?.terms_version).toBe(TERMS_VERSION)
  expect(Date.now() - Date.parse(stored!.terms_accepted_at!)).toBeLessThan(5 * 60_000)

  // Accepted on the account, not the tab: a fresh page doesn't ask again.
  await page.reload()
  await expect(myStudio(page)).toBeVisible()
  await expect(termsGate(page)).toHaveCount(0)

  // The footer links the terms for anyone.
  await page.goto('/privacy')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Terms' }).click()
  await expect(page).toHaveURL(/\/terms$/)
})

test('an account from before the terms is asked once and keeps its public name', async ({ page }) => {
  const email = newEmail({ label: 'terms-existing' })
  emails.push(email)
  await createExistingAccount({ email })
  const id = await userIdFor({ email })
  const named = await admin().rpc('flp_set_display_name', { p_owner_id: id, p_display_name: 'Before Terms' })
  expect(named.error).toBeNull()
  expect((await acceptedVersion({ email }))?.terms_version).toBeNull()

  await signIn({ page, email, acceptTerms: false })
  await expect(termsGate(page)).toBeVisible()
  await page.getByRole('button', { name: 'Accept and continue' }).click()
  await expect(myStudio(page)).toBeVisible()
  await expect(page.getByRole('textbox', { name: /Public name/ })).toHaveValue('Before Terms')
  expect(await acceptedVersion({ email })).toMatchObject({ terms_version: TERMS_VERSION, display_name: 'Before Terms' })
})

test('declining the terms signs out and records nothing', async ({ page }) => {
  const email = newEmail({ label: 'terms-decline' })
  emails.push(email)
  await signIn({ page, email, acceptTerms: false })
  await expect(termsGate(page)).toBeVisible()
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  expect(await acceptedVersion({ email })).toBeNull()

  // Signed out: My Studio asks for a sign-in again, not for the terms.
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('deleting your account needs your email, removes designs, publications and files, and signs you out', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'delete-self' })
  emails.push(email)
  await signIn({ page, email })

  // A saved design with a public link and stored pictures.
  await myStudio(page).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  await expectSaved({ page })
  const slug = await publishWithPlaceholders({ page })
  const id = (await userIdFor({ email }))!
  expect((await listFilesUnder({ admin: admin(), prefix: id })).length).toBeGreaterThan(0)

  await page.goto('/studio')
  await expect(page.getByText('Untitled tee').first()).toBeVisible()

  // Step one opens the confirmation; nothing is deleted yet.
  await page.getByRole('button', { name: 'Delete account…' }).click()
  const confirm = page.getByRole('textbox', { name: /To confirm, type your email address/ })
  const remove = page.getByRole('button', { name: 'Delete my account' })
  await expect(page.getByText('your 1 design')).toBeVisible()
  await expect(confirm).toBeFocused()
  await expect(remove).toBeDisabled()

  // Cancel keeps everything.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Delete account…' })).toBeFocused()
  await page.getByRole('button', { name: 'Delete account…' }).click()

  // Step two: only the account's own email (any case) enables it.
  await confirm.fill('someone-else@example.test')
  await expect(remove).toBeDisabled()
  await confirm.fill(email.toUpperCase())
  await expect(remove).toBeEnabled()
  await remove.click()

  await expect(page).toHaveURL(/\/account-deleted$/)
  await expect(page.getByRole('heading', { name: 'Your account has been deleted' })).toBeVisible()
  // Signed out in this browser.
  await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Sign in' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('flp-auth'))).toBeNull()

  // Gone on the server: account, rows, files, public link.
  expect(await userIdFor({ email })).toBeNull()
  const db = admin()
  for (const table of ['designs', 'design_versions', 'publications', 'render_artifacts', 'assets', 'profiles']) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('owner_id', id)
    expect(error, table).toBeNull()
    expect(count, table).toBe(0)
  }
  expect(await listFilesUnder({ admin: db, prefix: id })).toEqual([])

  const visitor = await browser.newContext()
  const share = await visitor.newPage()
  await share.goto(`/s/${slug}`)
  await expect(share.getByRole('heading', { name: 'This design is not available' })).toBeVisible()
  await visitor.close()

  // My Studio now asks for a sign-in.
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/sign-in/)
})
