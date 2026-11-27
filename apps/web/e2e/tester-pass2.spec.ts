import { type Page, expect, test } from '@playwright/test'

import { chooseTool, deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/**
 * Findings from the second outside test pass: drawing on a striped garment
 * moved the stripes instead of drawing (and Undo stayed off), and browser
 * Back from a studio step left the studio.
 */
const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Head = {
  content: {
    base: { kind: string }
    panels: Record<string, { layers: Array<{ strokes?: unknown[] }> }>
  }
}

async function savedHead({ page }: { page: Page }): Promise<Head> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head
  }, designId)
}

const frontStrokes = (head: Head) => head.content.panels.front!.layers.flatMap((layer) => layer.strokes ?? []).length

test('Draw draws on a striped garment, Undo takes it back, and Back walks the steps', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'stripedraw' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  const url = new URL(page.url())
  url.searchParams.set('step', 'color')
  await page.goto(url.toString())
  await expectSaved({ page })
  // Picking stripes selects the front's stripe stamp, as the tester's design had.
  await page.getByRole('button', { name: 'Stripe', exact: true }).click()
  await expect.poll(async () => (await savedHead({ page })).content.base.kind, { timeout: 20_000 }).toBe('stripes')

  await page.getByRole('button', { name: 'Continue', exact: true }).first().click()
  await expect(page).toHaveURL(/step=design/)
  await chooseTool({ page, tool: 'Draw' })
  await drawStroke({ page, panel: 'Front' })
  await expect.poll(async () => frontStrokes(await savedHead({ page })), { timeout: 20_000 }).toBe(1)
  expect((await savedHead({ page })).content.base.kind).toBe('stripes')

  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect.poll(async () => frontStrokes(await savedHead({ page })), { timeout: 20_000 }).toBe(0)

  // Browser Back returns to the previous step instead of leaving the studio.
  await page.goBack()
  await expect(page).toHaveURL(/\/create\?.*step=color/)
  await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/step=design/)
  await expect(page.getByRole('radiogroup', { name: 'Tools' })).toBeVisible()
})
