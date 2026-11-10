import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import { deleteAccounts } from '../e2e/helpers.ts'
import { ASSUMPTION_EVENTS } from '../src/lib/assumption-events.ts'
import { GOLDEN_DOCUMENT } from '../src/lib/canonical-fixtures.ts'
import { createAccount, withImageAsset } from '../src/lib/flp-api/integration-harness.ts'
import { PUBLIC_RENDER_KINDS } from '../src/lib/flp-api/render-kinds.mjs'
import { flpRoutes, routeLabel } from '../src/lib/flp-api/route-table.ts'
import { TINY_JPEG } from '../src/lib/image-fixtures.ts'
import {
  DEPLOYED_SUPABASE_SOURCE,
  contentSecurityPolicy,
  securityHeaders,
  supabaseMetaPolicy,
  supabaseOrigin,
} from '../src/lib/security-headers.ts'

/**
 * Hosted verification (Q01 #186): the checks that closed issues left for
 * "passes against the deployed backend", run in one go against a staging
 * deploy and its Supabase project, then the browser journey (#189). Writes
 * a pass/fail record to docs/evidence/. See docs/deploy.md, "Bring up
 * staging in 30 minutes".
 *
 *   E2E_BASE_URL=https://staging.… SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=… [SUPABASE_SECRET_KEY=…] [SUPABASE_ACCESS_TOKEN=…] \
 *   [MAILPIT_URL=…] pnpm hosted:check [--production-readonly] [--allow-local]
 *
 * SITE_ORIGIN names the public site when it isn't E2E_BASE_URL, so the
 * auth config may point at it (staging: https://beta.fashionleadervote.com).
 *
 * Writes go only through `it-*@example.test` accounts this run creates,
 * removed at the end with `deleteAccounts` (e2e/helpers.ts).
 */

const { values: flags } = parseArgs({
  options: {
    'allow-local': { type: 'boolean', default: false },
    'production-readonly': { type: 'boolean', default: false },
    'skip-e2e': { type: 'boolean', default: false },
    // Extra arguments for `pnpm e2e`, e.g. --e2e-args "journey security".
    'e2e-args': { type: 'string', default: '' },
    help: { type: 'boolean', default: false },
  },
})

if (flags.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*\n \* Hosted[\s\S]*?\*\//)[0])
  process.exit(0)
}

const env = process.env
const BASE = env.E2E_BASE_URL?.replace(/\/+$/, '')
const SUPABASE_URL = env.SUPABASE_URL?.replace(/\/+$/, '')
const PUBLISHABLE_KEY = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY
const SECRET_KEY = env.SUPABASE_SECRET_KEY

function refuse(message) {
  console.error(`hosted-check: ${message}`)
  process.exit(2)
}

if (!BASE || !SUPABASE_URL || !PUBLISHABLE_KEY) {
  refuse('set E2E_BASE_URL, SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)')
}

/** local, staging (a test label or a Vercel preview) or production. */
function hostKind({ url }) {
  const { hostname } = new URL(url)

  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')) {
    return 'local'
  }

  if (hostname.endsWith('.vercel.app')) {
    return 'staging'
  }

  // Any label but the top-level domain: `staging.example.com` and
  // `flp-staging.example.com` count, `example.dev` doesn't.
  const labels = hostname.split('.').slice(0, -1)
  return labels.some((label) => /(^|-)(staging|dev|test|preview)(-|$)/.test(label)) ? 'staging' : 'production'
}

const kind = hostKind({ url: BASE })
const readonly = flags['production-readonly']

if (kind === 'local' && !flags['allow-local']) {
  refuse(`${BASE} is local; pass --allow-local to check a local build`)
}

if (kind === 'production' && !readonly) {
  refuse(
    `${BASE} has no staging label (staging, dev, test, preview or *.vercel.app). ` +
      'Pass --production-readonly to run only the header and anonymous checks.',
  )
}

const supabase = supabaseOrigin({ url: SUPABASE_URL })
const hosted = kind !== 'local'
const PLACEHOLDER = {
  designId: '00000000-0000-0000-0000-000000000000',
  assetId: 'asset_00000000000000000000000000000000',
  slug: '0000000000000000',
}

// ---------------------------------------------------------------------------
// Check runner

class Skip extends Error {}

const results = []

/** Runs one check. `run` gets `note` for evidence lines and throws to fail. */
async function check({ id, issues, title, run }) {
  const notes = []
  const started = Date.now()
  let status = 'pass'
  let reason = ''

  try {
    await run({ note: (line) => notes.push(line) })
  } catch (error) {
    status = error instanceof Skip ? 'skip' : 'fail'
    reason = error instanceof Error ? error.message : String(error)
  }

  results.push({ id, issues, title, status, reason, notes, ms: Date.now() - started })
  const mark = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }[status]
  console.log(`${mark}  ${id} (${issues.map((n) => `#${n}`).join(', ')}) ${title}${reason ? `: ${reason}` : ''}`)
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function skip(message) {
  throw new Skip(message)
}

function api(path, init = {}) {
  return fetch(`${BASE}${path}`, { redirect: 'manual', ...init })
}

async function json(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const sha256 = (bytes) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex')

function directive({ policy, name }) {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([directiveName]) => directiveName === name)
  return found ? found.slice(1) : null
}

/** Whether a CSP source (`https://*.supabase.co` or an origin) allows `origin`. */
function sourceAllows({ source, origin }) {
  if (source === origin) {
    return true
  }

  const wildcard = source.match(/^(https?):\/\/\*\.(.+)$/)
  const target = new URL(origin)
  return Boolean(wildcard && target.protocol === `${wildcard[1]}:` && target.hostname.endsWith(`.${wildcard[2]}`))
}

// ---------------------------------------------------------------------------
// Header and anonymous checks (also run with --production-readonly)

const HEADER_PATHS = ['/', '/sign-in', `/s/${PLACEHOLDER.slug}`, `/api/flp/public/${PLACEHOLDER.slug}`]

await check({
  id: 'security-headers',
  issues: [187],
  title: 'Every page and API route sends the security headers from src/lib/security-headers.ts',
  run: async ({ note }) => {
    const expected = securityHeaders({ supabase: null })
    // The deployed header allows any Supabase project (vercel.json); a
    // local preview names its own stack exactly.
    const policies = [
      contentSecurityPolicy({ supabase: DEPLOYED_SUPABASE_SOURCE }),
      contentSecurityPolicy({ supabase }),
    ]

    for (const path of HEADER_PATHS) {
      const headers = (await api(path)).headers

      expect(
        policies.includes(headers.get('content-security-policy') ?? ''),
        `${path}: Content-Security-Policy is ${JSON.stringify(headers.get('content-security-policy'))}`,
      )

      for (const name of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) {
        expect(headers.get(name) === expected[name], `${path}: ${name} is ${JSON.stringify(headers.get(name))}`)
      }

      note(`\`${path}\`: CSP, nosniff, referrer, frame and permissions policies match`)
    }
  },
})

await check({
  id: 'csp-supabase',
  issues: [187],
  title: "The CSP's connect-src and img-src reach this Supabase project, and the page narrows them to it",
  run: async ({ note }) => {
    const header = (await api('/')).headers.get('content-security-policy') ?? ''

    for (const name of ['connect-src', 'img-src']) {
      const sources = directive({ policy: header, name }) ?? []
      expect(
        sources.some((source) => sourceAllows({ source, origin: supabase })),
        `header ${name} (${sources.join(' ')}) does not allow ${supabase}`,
      )

      if (hosted) {
        expect(!sources.some((source) => /localhost|127\.0\.0\.1/.test(source)), `header ${name} names a local host`)
      }
    }

    note(`header \`connect-src\`: ${directive({ policy: header, name: 'connect-src' }).join(' ')}`)

    // The build's VITE_SUPABASE_URL must be this project (vite.config.ts).
    const html = await (await api('/')).text()
    const meta = html
      .match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]
      ?.replace(/&#39;|&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
    expect(meta, 'index.html has no Supabase CSP <meta>: the build had no VITE_SUPABASE_URL')
    expect(
      meta === supabaseMetaPolicy({ supabase }),
      `index.html narrows to ${JSON.stringify(meta)}, not ${supabase}: VITE_SUPABASE_URL points elsewhere`,
    )
    note(`\`<meta>\` policy: ${meta}`)
  },
})

await check({
  id: 'bundle-secrets',
  issues: [186, 188],
  title: 'The served entry and preloaded scripts carry no server secret',
  run: async ({ note }) => {
    const html = await (await api('/')).text()
    const scripts = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g)].map(
      (match) => match[1],
    )
    expect(scripts.length > 0, 'index.html references no scripts')

    for (const src of new Set(scripts)) {
      const text = await (await fetch(new URL(src, `${BASE}/`))).text()
      const roles = [...text.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)].map((match) => {
        try {
          return JSON.parse(Buffer.from(match[1], 'base64url').toString()).role
        } catch {
          return undefined
        }
      })
      expect(!text.includes('service_role') && !roles.includes('service_role'), `${src} mentions service_role`)
      expect(!/sb_secret_[\w-]{8,}/.test(text), `${src} contains an sb_secret_ key`)
      expect(!SECRET_KEY || !text.includes(SECRET_KEY), `${src} contains the SUPABASE_SECRET_KEY value`)
    }

    note(`${new Set(scripts).size} scripts scanned (the full \`dist/\` scan is \`build-secrets.test.ts\` in CI)`)
  },
})

await check({
  id: 'anonymous-routes',
  issues: [188, 148, 187, 183],
  title: 'Signed out: every /api/flp route is 401 or 404, and other origins get 403 (route table from #251)',
  run: async ({ note }) => {
    // Bodies don't matter: each request is refused before it is read.
    const routes = flpRoutes({ document: {}, renders: [] })

    for (const route of routes) {
      const path = `/api/flp/${route.path(PLACEHOLDER)}`
      const response = await api(path, { method: route.method })
      const body = await json(response)

      if (route.scope === 'public') {
        expect(response.status === 404, `${routeLabel(route)} for an unknown slug is ${response.status}, not 404`)
        expect(response.headers.get('cache-control') === 'no-store', `${routeLabel(route)} 404 is cacheable`)
        note(`| \`${routeLabel(route)}\` | none | 404, no-store |`)
      } else {
        expect(
          response.status === 401 && body?.error?.code === 'unauthenticated',
          `${routeLabel(route)} signed out is ${response.status} ${body?.error?.code ?? ''}, not 401 unauthenticated`,
        )
        note(`| \`${routeLabel(route)}\` | none | 401 unauthenticated |`)
      }
    }

    for (const route of routes.filter((each) => each.method !== 'GET')) {
      const response = await api(`/api/flp/${route.path(PLACEHOLDER)}`, {
        method: route.method,
        headers: { Origin: 'https://example.com' },
      })
      const body = await json(response)
      expect(
        response.status === 403 && body?.error?.code === 'cross_origin',
        `${routeLabel(route)} from another origin is ${response.status}, not 403 cross_origin`,
      )
      note(`| \`${routeLabel(route)}\` | Origin https://example.com | 403 cross_origin |`)
    }
  },
})

await check({
  id: 'events-allowlist',
  issues: [193, 187],
  title: '/api/events refuses unknown events and extra fields',
  run: async ({ note }) => {
    const cases = [
      ['an unknown name', JSON.stringify({ name: 'hosted_check_unknown' })],
      ['a known name with an extra field', JSON.stringify({ name: ASSUMPTION_EVENTS[0], email: 'a@example.test' })],
      ['a timing with an unknown bucket', JSON.stringify({ name: 'save_ack', bucket: 'forever' })],
      ['a non-JSON body', 'not json'],
    ]

    for (const [label, body] of cases) {
      const response = await api('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      expect(response.status === 400, `${label} is ${response.status}, not 400`)
      note(`${label}: 400`)
    }
  },
})

await check({
  id: 'auth-providers',
  issues: [145, 147],
  title: 'Supabase Auth: email only, sign-up open for first sign-in, "Confirm email" on (hosted)',
  run: async ({ note }) => {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: PUBLISHABLE_KEY } })
    expect(response.ok, `auth settings answered ${response.status}`)
    const settings = await response.json()
    const others = Object.entries(settings.external ?? {}).filter(([name, on]) => name !== 'email' && on)

    expect(settings.external?.email === true, 'the email provider is off')
    expect(others.length === 0, `other providers are on: ${others.map(([name]) => name).join(', ')}`)
    expect(settings.disable_signup === false, 'sign-up is disabled, so first sign-in cannot create an account')

    // The local stack leaves confirmation off (supabase/config.toml);
    // hosted projects turn it on (docs/deploy.md, section 2).
    if (hosted) {
      expect(settings.mailer_autoconfirm === false, '"Confirm email" is off')
    }

    note(`external: email only; disable_signup false; mailer_autoconfirm ${settings.mailer_autoconfirm}${hosted ? '' : ' (local stack, not checked)'}`)
  },
})

// ---------------------------------------------------------------------------
// Staging-only checks

function writable() {
  if (readonly) {
    skip('--production-readonly')
  }
}

await check({
  id: 'email-code-config',
  issues: [145, 146],
  title: 'Email-code config: redirect allowlist, Site URL, 6-digit code, 600 s expiry, 60 s resend, custom SMTP, code-only templates',
  run: async ({ note }) => {
    writable()

    if (!hosted) {
      skip('a local stack has no Management API; its auth settings are supabase/config.toml')
    }

    if (!env.SUPABASE_ACCESS_TOKEN) {
      skip('set SUPABASE_ACCESS_TOKEN (a personal access token) to read the project auth config')
    }

    const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
    })
    expect(response.ok, `Management API answered ${response.status} for project ${ref}`)
    const config = await response.json()
    // The public site may differ from the host being checked: staging is
    // served at beta.fashionleadervote.com and checked through its
    // *.vercel.app alias, where the checks that write are allowed.
    const origin = new URL(env.SITE_ORIGIN ?? BASE).origin
    const allowed = [...new Set([origin, new URL(BASE).origin])]
    const allows = (entry) => allowed.some((host) => entry === host || entry.startsWith(`${host}/`))
    const redirects = (config.uri_allow_list ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)

    expect(new URL(config.site_url).origin === origin, `Site URL is ${config.site_url}, not ${origin}`)
    expect(redirects.length > 0, 'the redirect allowlist is empty')
    expect(
      redirects.every(allows),
      `the redirect allowlist allows other hosts: ${redirects.filter((entry) => !allows(entry)).join(', ')}`,
    )
    expect(config.mailer_otp_length === 6, `code length is ${config.mailer_otp_length}`)
    expect(config.mailer_otp_exp === 600, `code expiry is ${config.mailer_otp_exp} s`)
    expect(config.smtp_max_frequency === 60, `resend interval is ${config.smtp_max_frequency} s`)
    expect(Boolean(config.smtp_host), 'no custom SMTP: the built-in sender is rate-limited and for testing only')

    for (const name of ['mailer_templates_magic_link_content', 'mailer_templates_confirmation_content']) {
      const template = config[name] ?? ''
      expect(template.includes('{{ .Token }}'), `${name} has no {{ .Token }}`)
      expect(!template.includes('ConfirmationURL'), `${name} still has a link`)
    }

    note(`Site URL ${config.site_url}; redirects ${redirects.join(', ')}`)
    note(`code ${config.mailer_otp_length} digits, ${config.mailer_otp_exp} s; resend ${config.smtp_max_frequency} s; SMTP ${config.smtp_host}`)
    note('Delivery itself is the e2e sign-in and the real-inbox step in docs/deploy.md')
  },
})

// One owner with a published design, and a second account, for the
// checks that write. Created lazily so a skipped run creates nothing.
const DOCUMENT = withImageAsset({ document: GOLDEN_DOCUMENT, assetId: 'asset_lib_cross-simple' })
const RENDERS = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: Buffer.from(TINY_JPEG).toString('base64') }))
const emails = []
let world

function setUp() {
  writable()

  if (!SECRET_KEY) {
    skip('set SUPABASE_SECRET_KEY to create (and remove) the it-*@example.test accounts')
  }

  // Once per run: a failed setup fails each check that needs it.
  world ??= createWorld()
  return world
}

async function createWorld() {
  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const accountEnv = { url: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY }
  const a = await createAccount({ admin, env: accountEnv, label: 'hosted-a' })
  emails.push(a.email)
  const b = await createAccount({ admin, env: accountEnv, label: 'hosted-b' })
  emails.push(b.email)

  async function asOwner({ path, method = 'GET', body }) {
    const response = await api(`/api/flp/${path}`, {
      method,
      headers: { Authorization: `Bearer ${a.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    expect(response.status < 300, `owner ${method} ${path} answered ${response.status}`)
    return response.status === 204 ? null : json(response)
  }

  const created = await asOwner({
    path: 'designs',
    method: 'POST',
    body: { mutationKey: crypto.randomUUID(), title: 'Hosted check tee', content: DOCUMENT },
  })
  const fixture = { designId: created.designId, assetId: '', slug: '' }
  await asOwner({ path: `designs/${fixture.designId}/renders`, method: 'POST', body: { seq: 1, renders: RENDERS } })
  const published = await asOwner({
    path: `designs/${fixture.designId}/publication`,
    method: 'POST',
    body: { seq: 1, displayName: 'Hosted check' },
  })
  fixture.slug = published.slug
  fixture.assetId = (await asOwner({ path: 'assets', method: 'POST' })).assetId
  return { admin, a, b, fixture }
}

await check({
  id: 'owner-isolation',
  issues: [148, 188, 149, 170],
  title: "Another account gets 404 on every owner route, and the owner's design, publication and asset don't move",
  run: async ({ note }) => {
    const { admin, a, b, fixture } = await setUp()
    const routes = flpRoutes({ document: DOCUMENT, renders: RENDERS })

    async function ownerState() {
      const design = await admin.from('designs').select('title, head_seq, visibility').eq('id', fixture.designId).single()
      const asset = await admin.from('assets').select('status').eq('id', fixture.assetId).single()
      return JSON.stringify({ design: design.data, asset: asset.data })
    }

    async function call({ route, token }) {
      const body = route.body?.()
      return api(`/api/flp/${route.path(fixture)}`, {
        method: route.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    }

    // Control: the paths are real, so the 404s below are about ownership.
    for (const route of routes.filter((each) => each.scope === 'owner' && each.method === 'GET')) {
      const status = (await call({ route, token: a.token })).status
      expect(status === 200, `owner ${routeLabel(route)} is ${status}, not 200`)
    }

    for (const route of routes.filter((each) => each.scope === 'owner')) {
      const before = await ownerState()
      const response = await call({ route, token: b.token })
      const text = await response.text()
      expect(response.status === 404, `${routeLabel(route)} with another token is ${response.status}, not 404`)
      expect(!text.includes(fixture.designId) && !text.includes(a.id), `${routeLabel(route)} 404 leaks the owner's ids`)
      expect((await ownerState()) === before, `${routeLabel(route)} changed the owner's design or asset`)
      note(`| \`${routeLabel(route)}\` | another account | 404, nothing changed |`)
    }
  },
})

await check({
  id: 'render-hash',
  issues: [180, 179, 182],
  title: 'Every published view is served through the image route only with the hash recorded at upload',
  run: async ({ note }) => {
    const { admin, fixture } = await setUp()
    const page = await json(await api(`/api/flp/public/${fixture.slug}`))
    expect(page, 'the public payload did not load')
    expect(
      JSON.stringify(Object.keys(page.renders).sort()) === JSON.stringify([...PUBLIC_RENDER_KINDS].sort()),
      `public views are ${Object.keys(page.renders).join(', ')}`,
    )
    expect(!JSON.stringify(page).includes('panels'), 'the public payload exposes the document')

    const { data: rows } = await admin
      .from('render_artifacts')
      .select('kind, sha256, storage_path')
      .eq('design_id', fixture.designId)
      .eq('version_seq', 1)
      .eq('status', 'ready')
    const recorded = new Map((rows ?? []).map((row) => [row.kind, row]))

    for (const kind of PUBLIC_RENDER_KINDS) {
      const response = await api(page.renders[kind])
      const bytes = await response.arrayBuffer()
      expect(response.status === 200, `${kind} is ${response.status}`)
      expect(/^image\//.test(response.headers.get('content-type') ?? ''), `${kind} is not an image`)
      expect(sha256(bytes) === recorded.get(kind)?.sha256, `${kind} bytes don't match the hash recorded at upload`)
      note(`${kind}: 200, sha256 ${sha256(bytes).slice(0, 12)}… matches render_artifacts`)
    }

    // A file replaced in storage behind the API is refused, not shown.
    const back = recorded.get('view_back')
    const replaced = await admin.storage
      .from('design-assets')
      .upload(back.storage_path, new Uint8Array([...TINY_JPEG, 0]), { upsert: true, contentType: 'image/jpeg' })
    expect(!replaced.error, `could not replace the stored back view: ${replaced.error?.message}`)
    const tampered = await api(page.renders.view_back)
    expect(tampered.status === 404, `a replaced view_back file is served (${tampered.status})`)
    note('view_back replaced in storage: 404')
  },
})

await check({
  id: 'public-no-store',
  issues: [183, 182],
  title: 'Public JSON, images and the share page are no-store',
  run: async ({ note }) => {
    const { fixture } = await setUp()

    for (const path of [
      `/api/flp/public/${fixture.slug}`,
      `/api/flp/public/${fixture.slug}/image`,
      `/api/flp/public/${fixture.slug}/image?view=view_front&seq=1`,
      `/s/${fixture.slug}`,
    ]) {
      const response = await api(path)
      await response.arrayBuffer()
      expect(response.status === 200, `${path} is ${response.status}`)
      expect(response.headers.get('cache-control') === 'no-store', `${path} is ${response.headers.get('cache-control')}`)
      const cache = response.headers.get('x-vercel-cache')
      expect(!cache || cache !== 'HIT', `${path} came from the CDN cache`)
      note(`\`${path.replace(fixture.slug, ':slug')}\`: 200, no-store${cache ? `, x-vercel-cache ${cache}` : ''}`)
    }
  },
})

await check({
  id: 'unpublish-404',
  issues: [183, 181],
  title: 'Unpublishing takes the page, payload and every image down at once',
  run: async ({ note }) => {
    const { a, fixture } = await setUp()
    const share = await (await api(`/s/${fixture.slug}`)).text()
    expect(share.includes('Hosted check tee'), 'the share page did not show the published title before unpublishing')

    const revoked = await api(`/api/flp/designs/${fixture.designId}/publication`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${a.token}` },
    })
    expect(revoked.status < 300, `unpublish answered ${revoked.status}`)

    for (const path of [
      `/api/flp/public/${fixture.slug}`,
      `/api/flp/public/${fixture.slug}/image`,
      ...PUBLIC_RENDER_KINDS.map((kind) => `/api/flp/public/${fixture.slug}/image?view=${kind}&seq=1`),
    ]) {
      const response = await api(path)
      await response.arrayBuffer()
      expect(response.status === 404, `${path} after unpublish is ${response.status}`)
      expect(response.headers.get('cache-control') === 'no-store', `${path} 404 is cacheable`)
    }

    note(`payload and ${PUBLIC_RENDER_KINDS.length + 1} image URLs: 404, no-store`)
    const after = await (await api(`/s/${fixture.slug}`)).text()
    expect(!after.includes('Hosted check tee'), 'the share page still shows the title after unpublishing')
    note('share page: no title or image after unpublishing')
  },
})

if (emails.length > 0) {
  await deleteAccounts({ emails })
  console.log(`removed ${emails.length} it-*@example.test accounts`)
}

// ---------------------------------------------------------------------------
// The browser journey (#189) and the rest of the e2e suite

let e2eTail = ''

await check({
  id: 'e2e',
  issues: [189, 146, 149, 152, 172, 174, 175, 176, 177, 181, 187, 190],
  title: '`pnpm e2e` against the deployment (journey, isolation, security, failure matrix, …)',
  run: async ({ note }) => {
    writable()

    if (flags['skip-e2e']) {
      skip('--skip-e2e')
    }

    if (!SECRET_KEY) {
      skip('set SUPABASE_SECRET_KEY so the suite can remove its e2e-*@example.test accounts')
    }

    if (hosted && !env.MAILPIT_URL && env.E2E_CODE_SOURCE !== 'admin') {
      skip('set MAILPIT_URL to the staging mail catcher, or E2E_CODE_SOURCE=admin and E2E_EMAIL_DOMAIN, so the suite can get sign-in codes')
    }

    const args = ['e2e', ...flags['e2e-args'].split(/\s+/).filter(Boolean)]
    const output = []
    const code = await new Promise((resolve) => {
      const child = spawn('pnpm', args, {
        env: { ...env, E2E_BASE_URL: BASE, SUPABASE_URL, SUPABASE_SECRET_KEY: SECRET_KEY },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', (chunk) => {
          process.stdout.write(chunk)
          output.push(chunk.toString())
        })
      }
      child.on('close', resolve)
    })
    // Strip colour codes for the record.
    const lines = output.join('').replace(/\x1b\[[0-9;]*m/g, '').trimEnd().split('\n')
    e2eTail = lines.slice(-40).join('\n')
    const summary = lines.filter((line) => /^\s+\d+ (passed|failed|skipped|flaky)/.test(line)).map((line) => line.trim())
    note(`\`pnpm ${args.join(' ')}\`: ${summary.join(', ') || 'no summary'}`)
    expect(code === 0, `pnpm e2e exited ${code}`)
  },
})

// ---------------------------------------------------------------------------
// Evidence

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const failed = results.filter((result) => result.status === 'fail')
const skipped = results.filter((result) => result.status === 'skip')
const verdict = failed.length > 0 ? 'FAIL' : skipped.length > 0 ? 'PASS (with skips)' : 'PASS'
const now = new Date()
const date = now.toISOString().slice(0, 10)
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const issueLinks = (issues) => issues.map((n) => `#${n}`).join(', ')

const record = `# Hosted check: ${verdict}

${hosted ? '' : '> **Local run** (`--allow-local`): not hosted evidence. It shows the kit works; the hosted record comes from staging.\n\n'}| | |
| --- | --- |
| Target | ${BASE} (${kind}${readonly ? ', read-only' : ''}) |
| Supabase | ${supabase} |
| App | \`${version}\` at \`${git(['rev-parse', '--short', 'HEAD'])}\`${git(['status', '--porcelain']) ? ' (uncommitted changes)' : ''} |
| Run | ${now.toISOString()} |
| Result | ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped |

| Check | Re-verifies | Result |
| --- | --- | --- |
${results.map((result) => `| \`${result.id}\` | ${issueLinks(result.issues)} | ${result.status.toUpperCase()}${result.reason ? `: ${result.reason.replaceAll('|', '\\|')}` : ''} |`).join('\n')}

## Details
${results
  .map((result) => {
    const rows = result.notes.filter((line) => line.startsWith('|'))
    const lines = result.notes.filter((line) => !line.startsWith('|'))
    const table = rows.length ? `\n| Route | Caller | Answer |\n| --- | --- | --- |\n${rows.join('\n')}\n` : ''
    return `
### \`${result.id}\`: ${result.status.toUpperCase()} (${(result.ms / 1000).toFixed(1)} s)

${result.title}. Re-verifies ${issueLinks(result.issues)}.
${result.reason ? `\n**${result.status === 'skip' ? 'Skipped' : 'Failed'}:** ${result.reason}\n` : ''}${lines.map((line) => `- ${line}`).join('\n')}
${table}`
  })
  .join('')}${e2eTail ? `\n## e2e output (last 40 lines)\n\n\`\`\`\n${e2eTail}\n\`\`\`\n` : ''}`

// Local runs are gitignored; only a hosted record is evidence to commit.
const out = new URL(`../docs/evidence/hosted-${date}${hosted ? '' : '-local'}.md`, import.meta.url)
mkdirSync(new URL('.', out), { recursive: true })
writeFileSync(out, record)
console.log(`\n${verdict}: ${out.pathname.replace(`${process.cwd()}/`, '')}`)
process.exit(failed.length > 0 ? 1 : 0)
