import { execFileSync } from 'node:child_process'

import { type BrowserContext, type Page, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

// @ts-expect-error plain ESM script shared with scripts/delete-account.mjs
import { listFilesUnder, removeFiles } from '../scripts/storage-tree.mjs'

/** Shared steps for the journey suites (Q04 #189). */

const fileEnv = loadEnv('development', process.cwd(), ['SUPABASE_', 'MAILPIT_'])
const env = { ...fileEnv, ...process.env }
const MAILPIT = env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

/**
 * On a deployed environment with real SMTP, set `E2E_EMAIL_DOMAIN` to a domain
 * that accepts mail, so the app's emails don't bounce, and `E2E_CODE_SOURCE=admin`
 * to get each code from the auth admin API instead of an inbox. That proves the
 * sign-in journey, not that the email arrived, which `docs/deploy.md` checks by hand.
 */
const EMAIL_DOMAIN = env.E2E_EMAIL_DOMAIN ?? 'example.test'

export function newEmail({ label }: { label: string }) {
  return `e2e-${label}-${crypto.randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`
}

/**
 * A fresh code for `email`, which replaces the one its email carried. Asking
 * too soon would trip auth's 60 s resend rule for the app's own request, so
 * this waits until that email has gone.
 */
async function adminCode({ email, after }: { email: string; after: number }) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
  let sent = false

  for (let attempt = 0; attempt < 60 && !sent; attempt += 1) {
    const listed = (await (await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers })).json()) as {
      users: Array<{ email?: string; recovery_sent_at?: string; confirmation_sent_at?: string }>
    }
    const user = listed.users.find((entry) => entry.email === email)
    sent = [user?.recovery_sent_at, user?.confirmation_sent_at].some((at) => at && Date.parse(at) >= after)

    if (!sent) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  if (!sent) {
    throw new Error(`No sign-in email was sent to ${email}`)
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const body = (await response.json()) as { email_otp?: string }

  if (!response.ok || !body.email_otp) {
    throw new Error(`No sign-in code for ${email} (${response.status})`)
  }

  return body.email_otp
}

/** The newest sign-in code Mailpit caught for `email` since `after`. */
export async function latestCode({ email, after }: { email: string; after: number }) {
  if (env.E2E_CODE_SOURCE === 'admin') {
    return adminCode({ email, after })
  }

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
/**
 * Pro tools start on for the suite (playwright.config.ts). `pro: false` starts
 * this tab in Guided once; a later switch to Pro then survives reloads.
 */
export async function signIn({
  page,
  email,
  returnTo = '/studio',
  pro = true,
}: {
  page: Page
  email: string
  returnTo?: string
  pro?: boolean
}) {
  if (!pro) {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('flp-guided-seeded')) {
        window.sessionStorage.setItem('flp-guided-seeded', '1')
        window.localStorage.setItem('flp-pro-tools', 'off')
      }
    })
  }
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  const requested = Date.now() - 2_000
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const code = await latestCode({ email, after: requested })
  await page.getByRole('textbox', { name: '6-digit code' }).fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[/?]/g, '\\$&')}$`))
}

/** Picks a Design step tool from the rail. Picking the current one changes nothing. */
export async function chooseTool({ page, tool }: { page: Page; tool: 'Draw' | 'Text' | 'Graphics' | 'Upload' }) {
  await page.getByRole('radiogroup', { name: 'Tools' }).getByRole('radio', { name: tool, exact: true }).click()
}

/** An account that exists before its first sign-in, with no code sent yet. */
export async function createExistingAccount({ email }: { email: string }) {
  const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })

  if (error) {
    throw error
  }
}

/** Runs SQL in the local database container. Local stack only. */
export function localSql({ sql }: { sql: string }) {
  execFileSync('docker', ['exec', 'supabase_db_3d-playground', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql])
}

/** Makes the code just sent to `email` older than its 10-minute expiry. */
export function expireSentCode({ email }: { email: string }) {
  localSql({ sql: `update auth.users set recovery_sent_at = now() - interval '11 minutes' where email = '${email}'` })
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
      // Files first, as scripts/delete-account.mjs does (#151).
      await removeFiles({ admin, files: await listFilesUnder({ admin, prefix: user.id }) })
      await admin.auth.admin.deleteUser(user.id)
    }
  }
}

export function panelCanvas({ page, panel }: { page: Page; panel: 'Front' | 'Back' | 'Right sleeve' | 'Left sleeve' }) {
  // The selected panel's name ends in ", active" (#248), so match the start.
  return page.locator(`canvas[aria-label^="Design panel ${panel}"]`)
}

/** A short diagonal brush stroke across the middle of a panel. */
export async function drawStroke({
  page,
  panel,
}: {
  page: Page
  panel: 'Front' | 'Back' | 'Right sleeve' | 'Left sleeve'
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
