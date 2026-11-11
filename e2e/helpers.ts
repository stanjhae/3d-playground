import { execFileSync } from 'node:child_process'

import { type BrowserContext, type Page, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

import { listFilesUnder, removeFiles } from '../src/lib/flp-api/storage-tree.mjs'
import { TERMS_VERSION } from '../src/lib/terms.ts'
import { currentTemplateFor } from '../src/lib/template-manifest'

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

const acceptButton = (page: Page) => page.getByRole('button', { name: 'Accept and continue' })
const termsGateHeading = (page: Page) => page.getByRole('heading', { name: 'Terms of use', level: 1 })

/** Accepts the terms of use (P1) on the gate in front of the page, and waits for the page behind it. */
async function acceptTermsGate({ page }: { page: Page }) {
  await acceptButton(page).click()
  await expect(termsGateHeading(page)).toHaveCount(0)
  await expect(page.getByText('Checking your account…')).toHaveCount(0)
}

/**
 * For a test that signs in by hand and lands on My Studio: accepts the
 * terms of use if this account hasn't yet (each new account is asked once,
 * P1), then waits for My Studio itself.
 */
export async function passTermsGate({ page }: { page: Page }) {
  const studio = page.getByRole('heading', { name: 'Your designs', level: 1 })
  await acceptButton(page).or(studio).first().waitFor({ timeout: 30_000 })

  if (await acceptButton(page).isVisible()) {
    await acceptTermsGate({ page })
  }

  await studio.waitFor()
}

/** Pages behind the terms gate (RequireSession). */
const GATED = /^\/(studio|create)(?:[/?#]|$)/

/**
 * Signs in with an email code; new accounts are created on first sign-in.
 * Pro tools start on for the suite (playwright.config.ts). `pro: false` starts
 * this tab in Guided once; a later switch to Pro then survives reloads.
 * A new account is then asked to accept the terms of use (P1); this accepts
 * them and waits for the page behind, so the test starts where it did before
 * the gate existed. `acceptTerms: false` leaves the gate for the test.
 */
export async function signIn({
  page,
  email,
  returnTo = '/studio',
  pro = true,
  acceptTerms = true,
}: {
  page: Page
  email: string
  returnTo?: string
  pro?: boolean
  acceptTerms?: boolean
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
  // The gate asks the API whether this account accepted the terms yet.
  const profile =
    acceptTerms && GATED.test(returnTo)
      ? page.waitForResponse(
          (response) => new URL(response.url()).pathname === '/api/flp/profile' && response.request().method() === 'GET',
          { timeout: 60_000 },
        )
      : null
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[/?]/g, '\\$&')}$`))

  if (profile) {
    const read = await profile
    const body = (await read.json().catch(() => null)) as { termsVersion?: string | null } | null

    if (read.ok() && body?.termsVersion !== TERMS_VERSION) {
      await acceptTermsGate({ page })
    }
  }
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

type PanelName = 'Front' | 'Back' | 'Right sleeve' | 'Left sleeve'

/** On a narrow or touch screen the studio shows one view at a time: picks the panels. */
export async function showPanels({ page }: { page: Page }) {
  const toggle = page.getByRole('radiogroup', { name: 'Draw or cloth' })
  // Whichever the layout shows first: the toggle, or the panels themselves.
  await expect(toggle.or(panelCanvas({ page, panel: 'Front' })).first()).toBeVisible()

  if (await toggle.isVisible()) {
    await toggle.getByRole('radio', { name: 'Draw' }).click()
  }
}

/**
 * A finger drag across the middle of a panel, sent as real touch input
 * through CDP (`Input.dispatchTouchEvent`), so the browser itself makes the
 * touch and pointer events, with `pointerType: 'touch'`. Chromium only, in
 * a context with `hasTouch` (the `chromium-touch` and `ipad` projects).
 */
export async function touchStroke({ page, panel }: { page: Page; panel: PanelName }) {
  const box = await panelCanvas({ page, panel }).boundingBox()

  if (!box) {
    throw new Error(`${panel} canvas is not visible`)
  }

  const cdp = await page.context().newCDPSession(page)
  const at = (fx: number, fy: number) => [{ x: box.x + box.width * fx, y: box.y + box.height * fy, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0.3, 0.4) })
  for (let step = 1; step <= 16; step += 1) {
    const t = step / 16
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(0.3 + 0.4 * t, 0.4 + 0.1 * Math.sin(Math.PI * t)) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** The point count of each saved paint stroke on a panel, read back from the API. */
export async function savedStrokes({ page, panel = 'front' }: { page: Page; panel?: 'front' | 'back' | 'left' | 'right' }) {
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  return page.evaluate(
    async ({ id, key }) => {
      const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
      const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      const { head } = await response.json()
      type Layer = { kind: string; strokes?: { points: number[] }[] }

      return (head.content.panels[key].layers as Layer[])
        .filter((layer) => layer.kind === 'paint')
        .flatMap((layer) => layer.strokes ?? [])
        .map((stroke) => stroke.points.length / 2)
    },
    { id: designId, key: panel },
  )
}

/**
 * Settles a page for `toHaveScreenshot`: fonts loaded, and every canvas
 * (the 3D view and the paint panels) returned as a mask, since WebGL in
 * software on a runner never draws the same pixels twice.
 */
export async function visualMasks({ page }: { page: Page }) {
  await page.evaluate(() => document.fonts.ready)
  return [page.locator('canvas')]
}

/**
 * Publishes the open design's saved head through the API, with a tiny
 * placeholder image for every view, so a share page exists without the
 * minutes a real render takes on a runner. Returns the share slug.
 */
export async function publishWithPlaceholders({ page }: { page: Page }) {
  const { TINY_JPEG } = await import('../src/lib/image-fixtures')
  const { PUBLIC_RENDER_KINDS } = await import('../src/lib/flp-api/render-kinds.mjs')
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('flp-auth')!).access_token as string)
  const headers = { Authorization: `Bearer ${token}` }
  const request = page.request
  const { head } = (await (await request.get(`/api/flp/designs/${designId}`, { headers })).json()) as { head: { seq: number } }
  const data = Buffer.from(TINY_JPEG).toString('base64')
  const renders = (PUBLIC_RENDER_KINDS as string[]).map((kind) => ({ kind, data }))
  const rendered = await request.post(`/api/flp/designs/${designId}/renders`, { headers, data: { seq: head.seq, renders } })
  expect(rendered.status(), 'renders upload').toBe(201)
  const published = await request.post(`/api/flp/designs/${designId}/publication`, { headers, data: { seq: head.seq } })
  expect(published.status(), 'publish').toBe(200)
  return ((await published.json()) as { slug: string }).slug
}

/** A panel's true width ÷ height on the tee new designs pin (its print rectangle). */
export function newTeePanelAspect({ panel }: { panel: 'front' | 'back' | 'left' | 'right' }) {
  const { uv } = currentTemplateFor({ templateId: 'tee-crew-short' }).regions[panel]!
  return (uv.u1 - uv.u0) / (uv.v1 - uv.v0)
}
