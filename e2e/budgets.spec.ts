import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, newEmail, signIn } from './helpers'

/**
 * Editor budgets that need a browser (R06 #169, P4): every byte the editor
 * loads from a cold cache, and the cost of a frame while the camera turns.
 * Limits are in scripts/budgets.json; docs/baseline.md says how they were
 * set. CI renders WebGL in software, so its frame cost is far above a
 * laptop's and has its own limit: it catches a regression, not a frame rate.
 */

const budgets = JSON.parse(readFileSync(new URL('../scripts/budgets.json', import.meta.url), 'utf8')) as {
  editorFirstLoadKiB: number
  ciFrameCostP95Ms: number
}

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

function percentile({ values, p }: { values: number[]; p: number }) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

test('the editor stays inside its byte and frame budgets', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Uses the Chrome DevTools Protocol')
  test.setTimeout(120_000)

  // Time spent inside each animation frame callback. With software WebGL
  // the draw calls run on the CPU inside it, so this is the frame's cost
  // whatever the input pacing.
  await page.addInitScript(() => {
    const costs: number[] = []
    const original = window.requestAnimationFrame.bind(window)
    Object.assign(window, { __frameCosts: costs })
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        const start = performance.now()
        callback(time)
        costs.push(performance.now() - start)
      })
  })

  const email = newEmail({ label: 'budgets' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page).toHaveURL(/\/create\?cloud=/)
  await expectSaved({ page })

  // First load: reload the editor with the cache cleared and off, and add up
  // what came over the wire (compressed, headers included).
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.clearBrowserCache')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  let bytes = 0
  cdp.on('Network.loadingFinished', ({ encodedDataLength }) => {
    bytes += encodedDataLength
  })
  await page.reload()
  const scene = page.locator('canvas[data-engine]')
  await expect(scene).toBeVisible({ timeout: 30_000 })
  await expectSaved({ page })
  await page.waitForLoadState('networkidle')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
  const firstLoadKiB = bytes / 1024

  // Frame cost: on the preview step (where a drag turns the camera rather
  // than drawing), turn the garment back and forth.
  const url = new URL(page.url())
  url.searchParams.set('step', 'preview')
  await page.goto(url.toString())
  await expect(scene).toBeVisible({ timeout: 30_000 })
  await page.getByRole('radiogroup', { name: 'Camera' }).getByRole('radio', { name: 'Orbit', exact: true }).click()
  await page.waitForTimeout(2_500)
  await page.evaluate(() => {
    ;(window as unknown as { __frameCosts: number[] }).__frameCosts.length = 0
  })
  const box = (await scene.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.3, y)
  await page.mouse.down()
  for (let sweep = 0; sweep < 4; sweep += 1) {
    await page.mouse.move(box.x + box.width * (sweep % 2 === 0 ? 0.7 : 0.3), y, { steps: 30 })
  }
  await page.mouse.up()
  await page.waitForTimeout(1_000)
  const costs = await page.evaluate(() => [...(window as unknown as { __frameCosts: number[] }).__frameCosts])
  const p95 = percentile({ values: costs, p: 95 })
  const median = percentile({ values: costs, p: 50 })

  const summary = `Editor first load ${firstLoadKiB.toFixed(0)} KiB (budget ${budgets.editorFirstLoadKiB}); frame cost over ${costs.length} frames: median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms (CI budget ${budgets.ciFrameCostP95Ms} ms)`
  console.log(summary)
  testInfo.annotations.push({ type: 'budgets', description: summary })

  expect(firstLoadKiB, 'editor first load, KiB').toBeLessThanOrEqual(budgets.editorFirstLoadKiB)
  expect(costs.length, 'frames drawn while turning').toBeGreaterThan(10)

  // Only CI's software renderer has a frame limit; a laptop is far faster.
  if (process.env.CI && budgets.ciFrameCostP95Ms > 0) {
    expect(p95, 'frame cost p95 on CI, ms').toBeLessThanOrEqual(budgets.ciFrameCostP95Ms)
  }
})
