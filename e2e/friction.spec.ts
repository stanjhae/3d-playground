import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/** The paths around the studio: share page failures, navigation, focus, sign-in. */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

const UNKNOWN_DESIGN = '/s/0000000000000000'
const PUBLIC_READ = '**/api/flp/public/*'

async function account({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
}

test('a server failure reads differently from an unpublished design, and Try again recovers', async ({ page }) => {
  let failing = true
  await page.route(PUBLIC_READ, (route) =>
    failing
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"internal","message":"x"}}' })
      : route.continue(),
  )

  await page.goto(UNKNOWN_DESIGN)
  await expect(page.getByRole('heading', { name: 'This design can’t load right now' })).toBeVisible()
  await expect(page.getByText('The problem is on our side')).toBeVisible()
  await expect(page).toHaveTitle('This design can’t load right now · Fashion Leader Vote')
  await expect(page.getByRole('link', { name: 'Make your own' })).toHaveAttribute('href', '/create')

  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  const missing = page.getByRole('heading', { name: 'This design is not available' })
  await expect(missing).toBeVisible()
  await expect(missing).toBeFocused()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('the landing has a menu on a phone, and it closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Menu' })
  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  // The footer links to the same sections; this is the header's menu.
  const menuLinks = page.getByRole('banner').getByRole('navigation', { name: 'Site' })
  await expect(menuLinks.getByRole('link', { name: 'How it works', exact: true })).toBeVisible()
  await expect(menuLinks.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menuLinks.getByRole('link', { name: 'How it works', exact: true })).toBeHidden()
  await expect(menu).toBeFocused()
})

test('the landing offers My Studio once signed in', async ({ page }) => {
  await account({ page, label: 'landing-studio' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'My Studio' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)
})

test('skip link, page titles and focus on route change', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page).toHaveTitle('Privacy · Fashion Leader Vote')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page).toHaveURL(/\/privacy$/)

  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).focus()
  await page.getByRole('banner').getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveTitle('Design a T-shirt in 3D · Fashion Leader Vote')
  await expect(page.getByRole('main')).toBeFocused()

  // A page that places focus itself keeps it.
  await page.goto('/privacy')
  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveTitle('Sign in · Fashion Leader Vote')
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused()
})

test('the code step survives a reload', async ({ page }) => {
  const email = newEmail({ label: 'reload' })
  emails.push(email)
  await page.goto('/sign-in')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled()

  await page.getByRole('button', { name: 'Use a different email' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in with a code' })).toBeVisible()
})

test('a session the server ended is explained; signing out is not', async ({ page }) => {
  await account({ page, label: 'expired' })
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{"error_code":"session_not_found"}' }),
  )
  await page.route('**/api/flp/designs', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":"unauthenticated","message":"x"}}' }),
  )
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByText('Your session ended.')).toBeVisible()
  await page.unrouteAll()

  await account({ page, label: 'chose' })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByText('Your session ended.')).toHaveCount(0)
})

test('rename and delete return focus to the card or the list', async ({ page }) => {
  await account({ page, label: 'card-focus' })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await page.getByRole('link', { name: 'My Studio' }).click()

  const rename = page.getByRole('button', { name: 'Rename' })
  await rename.click()
  await page.getByRole('textbox', { name: 'Design name' }).press('Escape')
  await expect(rename).toBeFocused()

  const remove = page.getByRole('button', { name: 'Delete', exact: true })
  await remove.click()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(remove).toBeFocused()

  await remove.click()
  await page.getByRole('button', { name: 'Delete design' }).click()
  await expect(page.getByRole('heading', { name: 'Your designs' })).toBeFocused()
})

test('arrow keys move the camera preset, and the 3D view is described', async ({ page }) => {
  await account({ page, label: 'camera' })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const url = page.url().replace(/step=[a-z]+/, 'step=share')
  await page.goto(url)

  const camera = page.getByRole('radiogroup', { name: 'Camera' })
  await camera.getByRole('radio', { name: 'Front', exact: true }).click()
  await page.keyboard.press('ArrowRight')
  await expect(camera.getByRole('radio', { name: '3/4', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(camera.getByRole('radio', { name: '3/4', exact: true })).toBeFocused()

  await expect(page.locator('#studio-scene-description')).toHaveText(/^3D preview of your design\./)
  await expect(page.locator('canvas[role="img"]')).toHaveAttribute('aria-describedby', 'studio-scene-description')
})
