import { type Page, expect, test } from '@playwright/test'

import { createEmptyDocument } from '../src/lib/design-document'
import { TINY_JPEG } from '../src/lib/image-fixtures'
import { LANDING_HANDOFF_KEY, serializeLandingHandoff } from '../src/lib/landing-handoff'
import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * A landing design with its own image comes into the studio through a
 * preview, and its image becomes a real upload (F06 #141).
 */

const emails: string[] = []
test.afterAll(async () => {
  await deleteAccounts({ emails })
})

// What the landing page stores when someone moves to the studio: a design
// with one real image, inline. Built here with the app's own modules, so it
// runs against the dev server, a preview build or a deployment alike.
async function storeLandingDesign({ page }: { page: Page }) {
  const document = createEmptyDocument({ garmentId: 'tee' })
  document.layers.push({
    id: 'mark-landing',
    kind: 'graphic',
    panel: 'front',
    // A real image, so the server's validation accepts it.
    src: `data:image/jpeg;base64,${Buffer.from(TINY_JPEG).toString('base64')}`,
    x: 0.5,
    y: 0.5,
    scale: 0.3,
    rotation: 0,
    opacity: 1,
    visible: true,
  })
  const handoff = serializeLandingHandoff({ garmentId: 'tee', document })
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [LANDING_HANDOFF_KEY, handoff] as const)
  await page.reload()
}

test('preview, then create: the landing image is uploaded and saved by its real id', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'landing' })
  emails.push(email)
  await signIn({ page, email })
  await storeLandingDesign({ page })

  await page.getByRole('button', { name: 'Create from your landing design' }).click()
  const preview = page.getByRole('region', { name: 'Bring your landing design into the studio' })
  await expect(preview.getByRole('img')).toHaveCount(2)
  await expect(preview).toContainText('1 image is uploaded to your account when you create the design.')
  await preview.getByRole('button', { name: 'Create this design' }).click()

  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!
  const head = await page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head.content
  }, designId)
  const images = Object.values(head.panels as Record<string, { layers: Array<{ kind: string; assetId?: string }> }>)
    .flatMap((panel) => panel.layers)
    .filter((layer) => layer.kind === 'image')

  expect(images).toHaveLength(1)
  expect(images[0]!.assetId).toMatch(/^asset_/)
  expect(images[0]!.assetId).not.toMatch(/^asset_lib_/)
})

test('a failed image upload stops before saving, and the design can be created without it', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'landing-fail' })
  emails.push(email)
  await signIn({ page, email })
  await storeLandingDesign({ page })

  // The image's upload reservation is refused.
  await page.route('**/api/flp/assets', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'Storage is unavailable' } }) })
      : route.fallback(),
  )

  await page.getByRole('button', { name: 'Create from your landing design' }).click()
  const preview = page.getByRole('region', { name: 'Bring your landing design into the studio' })
  await preview.getByRole('button', { name: 'Create this design' }).click()

  await expect(preview.getByRole('alert')).toContainText('1 image could not be uploaded, so nothing was created yet.')
  await expect(page).toHaveURL(/\/studio$/)
  await expect(page.getByText('No designs yet. Create a T-shirt to start.')).toBeVisible()

  await preview.getByRole('button', { name: 'Create without that image' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })
})
