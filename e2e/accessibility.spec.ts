import AxeBuilder from '@axe-core/playwright'
import { type Locator, type Page, expect, test } from '@playwright/test'

import { deleteAccounts, expectSaved, latestCode, newEmail, passTermsGate, signIn } from './helpers'

/**
 * Automated accessibility scan of the alpha's pages (Q06 #191). Fails on
 * serious or critical WCAG 2.1 A/AA violations; minor ones are reported.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

async function expectAccessible({ page, name }: { page: Page; name: string }) {
  // Measure what people see once the page settles, not a fade-in's first
  // frame (the hero rises from opacity 0.001). Scroll-driven reveals run on
  // a scroll timeline and never finish, so only time-based ones are awaited.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.timeline === document.timeline && animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The WebGL canvas and its overlays are covered by the 2D panels.
    .exclude('canvas[data-engine]')
    .analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

  for (const violation of results.violations) {
    console.log(`[axe] ${name}: ${violation.impact} ${violation.id} (${violation.nodes.length}) ${violation.help}`)
  }

  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

/** Tabs to `target` the way a keyboard user would, and fails if it can't be reached. */
async function tabTo({ page, target }: { page: Page; target: Locator }) {
  await expect(target).toBeVisible()

  for (let presses = 0; presses < 200; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return
    }

    await page.keyboard.press('Tab')
  }

  throw new Error(`Tab never reached ${target}`)
}

/** Tabs through the page, noting anything focused with no visible mark or out of sight. */
async function walkFocus({ page, name, problems }: { page: Page; name: string; problems: string[] }) {
  await page.evaluate(() => {
    ;(window as { focusSeen?: WeakSet<Element> }).focusSeen = new WeakSet()
  })
  let reached = 0

  for (let presses = 0; presses < 250; presses += 1) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null

      if (!element || element === document.body) {
        return null
      }

      const seen = (window as unknown as { focusSeen: WeakSet<Element> }).focusSeen
      const repeat = seen.has(element)
      seen.add(element)
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      const middle = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      const visibleColor = (color: string) => !/transparent|rgba\(.*, 0\)$|\/ 0\)$/.test(color)
      return {
        repeat,
        id: `${element.tagName} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30) ?? ''} ${element.getAttribute('placeholder') ?? ''}`.trim(),
        marked:
          style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && visibleColor(style.outlineColor),
        inSight:
          box.width > 0 &&
          box.bottom > 0 &&
          box.top < window.innerHeight &&
          Boolean(middle && (element === middle || element.contains(middle) || middle.contains(element))),
      }
    })

    // Past the last control focus leaves the page, then wraps to the first.
    if (!focused) {
      continue
    }

    if (focused.repeat) {
      break
    }

    reached += 1

    if (!focused.marked) {
      problems.push(`${name}: no focus mark on ${focused.id}`)
    }

    if (!focused.inSight) {
      problems.push(`${name}: focus hidden on ${focused.id}`)
    }
  }

  console.log(`[focus] ${name}: ${reached} controls`)
  expect(reached, `${name}: Tab reached something`).toBeGreaterThan(0)
}

test('the landing has no serious violations on a desktop, a phone or without WebGL, and its focus shows', async ({ page }) => {
  for (const [width, height] of [
    [1280, 800],
    [390, 800],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.locator('#faq details').evaluateAll((items) => items.forEach((item) => item.setAttribute('open', '')))
    await expectAccessible({ page, name: `landing ${width}px` })
  }

  await page.goto('/?webgl=none')
  await expectAccessible({ page, name: 'landing without WebGL' })

  const problems: string[] = []
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await walkFocus({ page, name: 'landing', problems })
  expect(problems).toEqual([])
})

test('sign-in, My Studio, studio, shared page and privacy have no serious violations', async ({ page, browser }) => {
  // Publishing renders three views in software WebGL on CI runners.
  test.setTimeout(240_000)
  await page.goto('/sign-in')
  await expectAccessible({ page, name: 'sign-in' })

  await page.goto('/privacy')
  await expectAccessible({ page, name: 'privacy' })

  const email = newEmail({ label: 'a11y' })
  emails.push(email)
  await signIn({ page, email })
  await expectAccessible({ page, name: 'studio list' })

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await expectAccessible({ page, name: 'editor' })

  const designId = new URL(page.url()).searchParams.get('cloud')
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish publicly…' }).click()
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })

  const visitor = await browser.newContext()
  const anonymous = await visitor.newPage()
  await anonymous.goto(new URL((await link.getAttribute('href'))!).pathname)
  await expect(anonymous.getByRole('img')).toHaveCount(5)
  await expectAccessible({ page: anonymous, name: 'shared design' })
  await visitor.close()
})

test('the code step, history, publish review and published state have no serious violations', async ({ page }) => {
  test.setTimeout(240_000)
  const email = newEmail({ label: 'a11y-steps' })
  emails.push(email)

  await page.goto('/sign-in')
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email, after: requested })
  await expectAccessible({ page, name: 'code step' })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code === '000000' ? '000001' : '000000')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('status')).toContainText('wrong, already used or expired')
  await expectAccessible({ page, name: 'code step, refused' })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await passTermsGate({ page })

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Show' }).click()
  await page.getByRole('button', { name: 'Save checkpoint' }).click()
  await expectAccessible({ page, name: 'history, naming a checkpoint' })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expectAccessible({ page, name: 'history, name refused' })
  await page.getByLabel('Checkpoint name').fill('First')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/Saved checkpoint/)).toBeVisible()
  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expectAccessible({ page, name: 'history, confirming a restore' })

  const designId = new URL(page.url()).searchParams.get('cloud')
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish publicly…' }).click()
  await expect(page.getByRole('group', { name: 'Publish review' })).toBeVisible()
  await expectAccessible({ page, name: 'publish review' })
  await page.getByRole('button', { name: 'Confirm publish' }).click()
  await expect(page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })).toBeVisible({ timeout: 120_000 })
  await expectAccessible({ page, name: 'published' })
})

test('save, history, publishing and sharing work from the keyboard alone', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const email = newEmail({ label: 'keyboard' })
  emails.push(email)
  await signIn({ page, email })
  await tabTo({ page, target: page.getByRole('button', { name: 'Create a T-shirt' }) })
  await page.keyboard.press('Enter')
  await expectSaved({ page })

  // An edit, saved with no pointer involved.
  // A radio group is one Tab stop; the arrow keys choose within it.
  await tabTo({ page, target: page.getByRole('radio', { name: 'Draw', exact: true }) })
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Text', exact: true })).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Text', exact: true })).toHaveAttribute('aria-checked', 'true')
  await tabTo({ page, target: page.getByPlaceholder('Your text') })
  await page.keyboard.type('KEYS')
  await page.keyboard.press('Enter')
  await expectSaved({ page })

  await tabTo({ page, target: page.getByRole('button', { name: 'Show' }) })
  await page.keyboard.press('Enter')
  await tabTo({ page, target: page.getByRole('button', { name: 'Save checkpoint' }) })
  await page.keyboard.press('Enter')
  await tabTo({ page, target: page.getByLabel('Checkpoint name') })
  await page.keyboard.type('By keyboard')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Saved checkpoint “By keyboard”/)).toBeVisible()

  await tabTo({ page, target: page.getByRole('button', { name: 'Restore' }).last() })
  await page.keyboard.press('Space')
  const confirm = page.getByRole('button', { name: 'Restore', exact: true }).last()
  await tabTo({ page, target: confirm })
  await page.keyboard.press('Enter')
  await expect(page.getByText(/From v1/).first()).toBeVisible()
  await expectSaved({ page })

  await tabTo({ page, target: page.getByRole('link', { name: /Publish/ }).or(page.getByRole('button', { name: /Preview & Publish/ })).first() })
  await page.keyboard.press('Enter')
  await tabTo({ page, target: page.getByRole('button', { name: 'Publish publicly…' }) })
  await page.keyboard.press('Enter')
  await tabTo({ page, target: page.getByRole('button', { name: 'Confirm publish' }) })
  await page.keyboard.press('Enter')
  const link = page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ })
  await expect(link).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('status').filter({ hasText: /^Published version \d+\./ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Published' })).toBeFocused()

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await tabTo({ page, target: page.getByRole('button', { name: 'Copy link' }) })
  await page.keyboard.press('Enter')
  const href = (await link.getAttribute('href'))!
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(href)
  await expect(page.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible()

  await tabTo({ page, target: page.getByRole('button', { name: 'Unpublish' }) })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Publish publicly…' })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Unpublished.' })).toBeVisible()
  const visitor = await browser.newContext()
  const anonymous = await visitor.newPage()
  await anonymous.goto(new URL(href).pathname)
  await expect(anonymous.getByText('This design is not available')).toBeVisible()
  await visitor.close()
})

test('whatever the keyboard reaches shows where focus is, and is not hidden', async ({ page }) => {
  test.setTimeout(240_000)
  const email = newEmail({ label: 'focus' })
  emails.push(email)
  const problems: string[] = []

  await page.goto('/sign-in')
  await walkFocus({ page, name: 'sign-in', problems })
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email, after: requested })
  await page.getByRole('textbox', { name: '6-digit code' }).focus()
  await walkFocus({ page, name: 'code step', problems })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await passTermsGate({ page })
  await walkFocus({ page, name: 'studio list', problems })

  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await walkFocus({ page, name: 'editor', problems })

  const designId = new URL(page.url()).searchParams.get('cloud')
  await page.goto(`/create?cloud=${designId}&step=share`)
  await expectSaved({ page })
  await page.getByRole('button', { name: 'Publish publicly…' }).click()
  await walkFocus({ page, name: 'publish review', problems })

  expect(problems).toEqual([])
})

test('the steps over the dark scene keep their header on a solid background', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'dark-steps' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')

  for (const step of ['preview', 'share']) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto(`/create?cloud=${designId}&step=${step}`)
      await expectSaved({ page })
      // Axe can't judge text over a canvas, so check what it can't see first.
      const header = page.getByRole('navigation', { name: 'Create steps' }).locator('..')
      const background = await header.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(background, `${step} @${viewport.width}`).not.toMatch(/transparent|\/ 0(\.\d+)?\)|, 0(\.\d+)?\)$/)
      // The header would hide the garment if the scene ran behind it.
      const headerBox = await header.boundingBox()
      const sceneBox = await page.locator('canvas[data-engine]').boundingBox()
      expect(sceneBox!.y, `${step} @${viewport.width}`).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1)
      await expectAccessible({ page, name: `${step} @${viewport.width}` })
    }
  }
})

test('long names and messages never push the page sideways (#163)', async ({ page }) => {
  test.setTimeout(180_000)
  const email = newEmail({ label: 'overflow' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })

  // The longest title the API accepts, with no spaces to wrap on.
  const longTitle = 'W'.repeat(80)
  const title = page.getByRole('textbox', { name: 'Design name' })
  const renamed = page.waitForResponse(
    (response) => /\/api\/flp\/designs\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === 'PATCH',
  )
  await title.fill(longTitle)
  await title.press('Enter')
  expect((await renamed).status()).toBe(200)

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(await overflow(), `editor @${viewport.width}`).toBeLessThanOrEqual(0)
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/studio')
  await expect(page.getByRole('listitem').filter({ hasText: longTitle })).toBeVisible()

  // The longest public name, also with nothing to wrap on.
  await page.getByRole('textbox', { name: /Public name/ }).fill('N'.repeat(40))

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(await overflow(), `studio @${viewport.width}`).toBeLessThanOrEqual(0)
  }
})
