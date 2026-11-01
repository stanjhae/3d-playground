import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/**
 * The studio draws only when something changes. An always-on render loop
 * on software WebGL starved two open tabs until IndexedDB reads took
 * seconds (the two-tab CI flake after #255).
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function framesDuring({ page, ms }: { page: Page; ms: number }) {
  return page.evaluate(async (wait) => {
    const original = window.requestAnimationFrame
    let frames = 0
    window.requestAnimationFrame = (callback) => {
      frames += 1
      return original.call(window, callback)
    }
    await new Promise((resolve) => setTimeout(resolve, wait))
    window.requestAnimationFrame = original
    return frames
  }, ms)
}

test('an idle studio requests no frames, and an edit still redraws', async ({ page }) => {
  test.setTimeout(120_000)
  const email = newEmail({ label: 'idle' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })

  // Once the intro camera move and loading settle, nothing draws. CI
  // renders WebGL in software at a few frames a second, so allow time.
  await expect
    .poll(() => framesDuring({ page, ms: 2_000 }), { timeout: 20_000, intervals: [0] })
    .toBeLessThanOrEqual(2)

  // An edit asks for frames again.
  const during = framesDuring({ page, ms: 1_500 })
  await drawStroke({ page, panel: 'Front' })
  expect(await during).toBeGreaterThan(0)
  await expectSaved({ page })
})
