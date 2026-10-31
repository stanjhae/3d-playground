import { expect, test } from '@playwright/test'

import { deleteAccounts, drawStroke, expectSaved, newEmail, signIn } from './helpers'

/**
 * Release-gate measurements (S04 #173, P04 #182). Not part of the pass/fail
 * suite: run with `MEASURE=1 pnpm e2e measure`, then record the printed
 * numbers in docs/baseline.md.
 */

test.skip(!process.env.MEASURE, 'measurement run only (MEASURE=1)')

const emails: string[] = []
test.afterAll(async () => { await deleteAccounts({ emails }) })

function percentile({ values, p }: { values: number[]; p: number }) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}

test('save acknowledgement and public first image', async ({ page, browser }) => {
  test.setTimeout(600_000)
  const email = newEmail({ label: 'measure' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  // Request-to-acknowledgement for every autosave, from the save request
  // leaving the browser to its response (the 2 s quiet period excluded).
  const acks: number[] = []
  page.on('requestfinished', (request) => {
    if (request.url().includes('/versions') && request.method() === 'POST') {
      acks.push(request.timing().responseEnd)
    }
  })

  for (let i = 0; i < 20; i += 1) {
    await drawStroke({ page, panel: i % 2 ? 'Back' : 'Front' })
    await expectSaved({ page })
    // Let the next edit start a fresh save instead of joining this one.
    await page.waitForTimeout(300)
  }

  // Edit-to-"Saved to cloud" as the person sees it, split into the quiet
  // period (edit to save request) and the rest (request to visible status).
  const visible: number[] = []
  const toRequest: number[] = []
  for (let i = 0; i < 5; i += 1) {
    await page.waitForTimeout(500)
    const request = page.waitForRequest((r) => r.url().includes('/versions') && r.method() === 'POST', { timeout: 30_000 })
    await drawStroke({ page, panel: 'Front' })
    const start = Date.now()
    await request
    toRequest.push(Date.now() - start)
    await expectSaved({ page })
    visible.push(Date.now() - start)
  }

  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })
  const path = new URL((await link.getAttribute('href'))!).pathname

  const firstImage: Record<string, number> = {}
  for (const [name, viewport] of [['390x844', { width: 390, height: 844 }], ['1366x768', { width: 1366, height: 768 }]] as const) {
    const context = await browser.newContext({ viewport })
    const visitor = await context.newPage()
    const cdp = await context.newCDPSession(visitor)
    await cdp.send('Network.enable')
    // Chrome DevTools "Fast 3G".
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 562.5,
      downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9,
      uploadThroughput: (750 * 1024) / 8 * 0.9,
    })
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    const start = Date.now()
    await visitor.goto(path)
    await visitor.waitForFunction(() => {
      const img = document.querySelector('main img') as HTMLImageElement | null
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }, undefined, { timeout: 60_000 })
    firstImage[name] = Date.now() - start
    if (name === '390x844') {
      await visitor.screenshot({ path: 'test-results/public-390.png', fullPage: true })
    }
    await context.close()
  }

  const result = {
    saveAckMs: { p50: percentile({ values: acks, p: 50 }), p95: percentile({ values: acks, p: 95 }), max: Math.max(...acks), n: acks.length },
    editToSavedMs: { p50: percentile({ values: visible, p: 50 }), max: Math.max(...visible), n: visible.length },
    editToRequestMs: { p50: percentile({ values: toRequest, p: 50 }), max: Math.max(...toRequest) },
    firstPublicImageFast3gMs: firstImage,
  }
  console.log('MEASURE', JSON.stringify(result))
})
