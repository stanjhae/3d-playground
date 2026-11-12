import { type Page, expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/**
 * "Publish publicly…" opens the publish review every time. Twice on 1 Nov a click
 * landed and nothing opened: the 3D canvas started during the click, the
 * "Publishing needs the 3D preview…" line under the button went away, and
 * the bottom-anchored panel moved the button out from under the pointer.
 *
 * The loop repeats the path that flaked (PUBLISH_REVIEW_LOOPS, default 5);
 * the second test makes the canvas start mid-press, every time.
 */

const LOOPS = Number(process.env.PUBLISH_REVIEW_LOOPS ?? 5)
const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function createSavedDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=[0-9a-f-]+&step=design/)
  const designId = new URL(page.url()).searchParams.get('cloud')!
  await drawStroke({ page, panel: 'Front' })
  await expectSaved({ page })
  return designId
}

test(`"Publish publicly…" opens the review (${LOOPS}×)`, async ({ page }) => {
  test.setTimeout(60_000 + LOOPS * 30_000)
  const designId = await createSavedDesign({ page, label: 'publish-review' })
  const failures: number[] = []

  for (let i = 0; i < LOOPS; i += 1) {
    await page.goto(`/create?cloud=${designId}&step=share`)
    await expectSaved({ page })
    await page.getByRole('button', { name: 'Publish publicly…' }).click()

    try {
      await expect(page.getByRole('button', { name: 'Confirm publish' })).toBeVisible({ timeout: 5_000 })
    } catch {
      failures.push(i)
    }
  }

  console.log(`publish review: ${failures.length}/${LOOPS} failed`)
  expect(failures, 'runs where the review did not open').toEqual([])
})

test('"Publish publicly…" opens the review when the 3D preview starts mid-click', async ({ page }) => {
  const designId = await createSavedDesign({ page, label: 'publish-review-late' })

  // Hold back every ResizeObserver report, so the R3F canvas (which waits for
  // its container's size) has not started, then let them through on the
  // first pointerdown: the canvas becomes ready while the press is down, as
  // it did on a busy machine.
  await page.addInitScript(() => {
    let held: Array<() => void> | null = []
    const Native = window.ResizeObserver
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          if (held) {
            held.push(() => callback(entries, observer))
          } else {
            callback(entries, observer)
          }
        })
      }
    }
    window.addEventListener(
      'pointerdown',
      () => {
        const waiting = held ?? []
        held = null
        waiting.forEach((run) => run())
      },
      { capture: true, once: true },
    )
  })

  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  const open = page.getByRole('button', { name: 'Publish publicly…' })
  // The canvas has not started: publishing explains it is waiting for it.
  await expect(page.getByRole('status').filter({ hasText: 'Starting the 3D preview' })).toBeVisible()
  const box = (await open.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByRole('status').filter({ hasText: 'Starting the 3D preview' })).toBeHidden()
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Confirm publish' })).toBeVisible({ timeout: 5_000 })
})

test('moving to Publish keeps the 3D canvas and never reports the preview as gone', async ({ page }) => {
  await createSavedDesign({ page, label: 'publish-same-canvas' })
  const scene = page.locator('canvas:not([aria-label^="Design panel"])')
  await expect(scene).toBeVisible()
  await scene.evaluate((canvas) => {
    ;(window as unknown as { __flpScene?: Element }).__flpScene = canvas
  })

  // Every status line from here on, however briefly it showed.
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { __flpStatuses?: string[] }).__flpStatuses = seen
    new MutationObserver(() => {
      document.querySelectorAll('[role="status"]').forEach((line) => seen.push(line.textContent ?? ''))
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })

  await page.getByRole('button', { name: /Preview & Publish/ }).click()
  await expect(page.getByRole('button', { name: 'Publish publicly…' })).toBeVisible()
  await expectSaved({ page })

  expect(
    await scene.evaluate((canvas) => (window as unknown as { __flpScene?: Element }).__flpScene === canvas),
    'the canvas element after moving to Publish is the one from Design',
  ).toBe(true)
  const statuses = await page.evaluate(() => (window as unknown as { __flpStatuses?: string[] }).__flpStatuses ?? [])
  expect(statuses.filter((line) => line.includes('Publishing needs the 3D preview'))).toEqual([])
  await page.getByRole('button', { name: 'Publish publicly…' }).click()
  await expect(page.getByRole('button', { name: 'Confirm publish' })).toBeEnabled()
})
