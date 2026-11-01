import { type BrowserContext, type Page, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

/** Shared steps for the journey suites (Q04 #189). */

const fileEnv = loadEnv('development', process.cwd(), ['SUPABASE_', 'MAILPIT_'])
const env = { ...fileEnv, ...process.env }
const MAILPIT = env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

export function newEmail({ label }: { label: string }) {
  return `e2e-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`
}

/** The newest sign-in code Mailpit caught for `email` since `after`. */
export async function latestCode({ email, after }: { email: string; after: number }) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)
    const { messages = [] } = (await search.json()) as { messages?: Array<{ ID: string; Created: string }> }
    const message = messages[0]

    if (message && Date.parse(message.Created) >= after) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { Text: string }
      const code = full.Text.match(/\b\d{6}\b/)?.[0]

      if (code) {
        return code
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`No sign-in code reached ${email}`)
}

/** Signs in with an email code; new accounts are created on first sign-in. */
export async function signIn({ page, email, returnTo = '/studio' }: { page: Page; email: string; returnTo?: string }) {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email, after: requested })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[/?]/g, '\\$&')}$`))
}

/** Removes the e2e accounts a run created (local or a test environment). */
export async function deleteAccounts({ emails }: { emails: string[] }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || emails.length === 0) {
    return
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })

  for (const user of data?.users ?? []) {
    if (user.email && emails.includes(user.email)) {
      await admin.auth.admin.deleteUser(user.id)
    }
  }
}

export function panelCanvas({ page, panel }: { page: Page; panel: 'Front' | 'Back' | "Wearer's right" | "Wearer's left" }) {
  // The selected panel's name ends in ", active" (#248), so match the start.
  return page.locator(`canvas[aria-label^="Design panel ${panel}"]`)
}

/** A short diagonal brush stroke across the middle of a panel. */
export async function drawStroke({
  page,
  panel,
}: {
  page: Page
  panel: 'Front' | 'Back' | "Wearer's right" | "Wearer's left"
}) {
  const box = await panelCanvas({ page, panel }).boundingBox()

  if (!box) {
    throw new Error(`${panel} canvas is not visible`)
  }

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 })
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45, { steps: 8 })
  await page.mouse.up()
}

export async function expectSaved({ page }: { page: Page }) {
  await expect(page.getByRole('status').filter({ hasText: 'Saved to cloud' })).toBeVisible({ timeout: 20_000 })
}

/**
 * Records every Content-Security-Policy violation on pages in `context`
 * (into `violations` when given, to share one list across contexts)
 * (Q02 #187): `securitypolicyviolation` events and the console reports
 * Chromium logs for blocked loads. Assert with `expectNoCspViolations`.
 */
export async function watchCsp({ context, violations = [] }: { context: BrowserContext; violations?: string[] }) {
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.effectiveDirective} blocked ${event.blockedURI || 'inline'} at ${event.sourceFile}:${event.lineNumber}`)
    })
  })
  const listen = (page: Page) => {
    page.on('console', (message) => {
      const text = message.text()

      if (/CSP violation|Content Security Policy/i.test(text)) {
        violations.push(`${page.url()}: ${text}`)
      }
    })
  }
  context.pages().forEach(listen)
  context.on('page', listen)
  return violations
}

export function expectNoCspViolations({ violations }: { violations: string[] }) {
  expect(violations, 'CSP violations').toEqual([])
}
