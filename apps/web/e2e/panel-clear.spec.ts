import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/**
 * Per-panel Clear (E05 #159, #249): it asks first, Cancel changes
 * nothing, and Clear removes only the drawn-on panel's ink as one undo
 * step. The saved head is compared by its content hash and its serialized
 * document, so "unchanged" means byte-identical.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Head = { seq: number; contentHash: string; content: { panels: Record<string, { layers: Array<{ kind: string; strokes?: unknown[] }> }> } }

async function savedHead({ page }: { page: Page }): Promise<Head> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head
  }, designId)
}

function strokesOn({ head, panel }: { head: Head; panel: string }) {
  return head.content.panels[panel]!.layers.flatMap((layer) => (layer.kind === 'paint' ? (layer.strokes ?? []) : [])).length
}

test('Cancel leaves the document byte-identical; Clear then Undo restores identical marks', async ({ page }) => {
  test.setTimeout(150_000)
  const email = newEmail({ label: 'clear' })
  emails.push(email)

  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })

  // Ink on the back, then the front: the front is the panel being drawn on.
  await drawStroke({ page, panel: 'Back' })
  await drawStroke({ page, panel: 'Front' })
  await expect.poll(async () => strokesOn({ head: await savedHead({ page }), panel: 'front' }), { timeout: 20_000 }).toBe(1)
  await expectSaved({ page })
  const inked = await savedHead({ page })
  expect(strokesOn({ head: inked, panel: 'back' })).toBe(1)

  // 1. Cancel: the confirmation closes and nothing is saved or changed.
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  const confirm = page.getByRole('group', { name: 'Clear ink on the front' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  // Give an autosave time to fire if anything had changed.
  await page.waitForTimeout(3_000)
  const afterCancel = await savedHead({ page })
  expect(afterCancel.seq).toBe(inked.seq)
  expect(afterCancel.contentHash).toBe(inked.contentHash)
  expect(JSON.stringify(afterCancel.content)).toBe(JSON.stringify(inked.content))

  // 2. Clear removes the front's ink only.
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await confirm.getByRole('button', { name: 'Clear front' }).click()
  await expect.poll(async () => (await savedHead({ page })).seq, { timeout: 20_000 }).toBeGreaterThan(inked.seq)
  const cleared = await savedHead({ page })
  expect(strokesOn({ head: cleared, panel: 'front' })).toBe(0)
  expect(JSON.stringify(cleared.content.panels.back)).toBe(JSON.stringify(inked.content.panels.back))

  // 3. Undo brings back exactly the marks that were there.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await savedHead({ page })).seq, { timeout: 20_000 }).toBeGreaterThan(cleared.seq)
  await expectSaved({ page })
  const undone = await savedHead({ page })
  expect(undone.contentHash).toBe(inked.contentHash)
  expect(JSON.stringify(undone.content)).toBe(JSON.stringify(inked.content))
})
