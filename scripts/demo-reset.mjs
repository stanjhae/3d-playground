import { randomUUID } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

/**
 * Demo reset (#201). Puts the demo account in a known state for the
 * 17 Nov walkthrough (docs/demo.md):
 *
 * - deletes `demo@example.test` with everything it owns, then recreates it;
 * - seeds three designs through the real API, so every document passes the
 *   same validation the studio's saves do:
 *   1. "Night Market" — published: the app's own publish flow renders the
 *      three views in headless Chromium and makes the link live;
 *   2. "Studio draft" — autosaves, a named checkpoint and a restore;
 *   3. "Crest upload" — an uploaded PNG on the front.
 * - prints the share link and how to sign in.
 *
 * Needs local Supabase and the preview build (`pnpm build && pnpm preview
 * --port 4173`). Safe to rerun: every run starts from a deleted account,
 * so two runs give the same designs, history and publication. Only the ids
 * and the share slug are new each time.
 *
 *   node scripts/demo-reset.mjs
 *   DEMO_BASE_URL=http://localhost:4173 node scripts/demo-reset.mjs
 */

const EMAIL = 'demo@example.test'
const DISPLAY_NAME = 'Demo Studio'
const BUCKET = 'design-assets'

const env = { ...loadEnv('development', process.cwd(), ['SUPABASE_', 'DEMO_']), ...process.env }
const baseUrl = (env.DEMO_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '')

if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_PUBLISHABLE_KEY) {
  console.error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (in .env.local).')
  process.exit(1)
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, authOptions)

function fail(message) {
  console.error(`demo-reset: ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------- account

/** Every stored file under `prefix`, however deep. */
async function storedPaths(prefix) {
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 })

  if (error) {
    fail(`could not list ${prefix}: ${error.message}`)
  }

  const paths = []

  for (const entry of data) {
    const path = `${prefix}/${entry.name}`
    // Folders have no id.
    paths.push(...(entry.id ? [path] : await storedPaths(path)))
  }

  return paths
}

/** Deletes the demo account: rows cascade, files are removed first. */
async function deleteDemoAccount() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })

  if (error) {
    fail(`is local Supabase running? ${error.message}`)
  }

  for (const user of data.users.filter((candidate) => candidate.email === EMAIL)) {
    const paths = await storedPaths(user.id)

    if (paths.length > 0) {
      await admin.storage.from(BUCKET).remove(paths)
    }

    const removed = await admin.auth.admin.deleteUser(user.id)

    if (removed.error) {
      fail(`could not delete ${EMAIL}: ${removed.error.message}`)
    }
  }
}

/** A fresh account with a throwaway password; the demo signs in by code. */
async function createDemoAccount() {
  const password = `demo-${randomUUID()}`
  const created = await admin.auth.admin.createUser({ email: EMAIL, password, email_confirm: true })

  if (created.error) {
    fail(`could not create ${EMAIL}: ${created.error.message}`)
  }

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, authOptions)
  const signedIn = await client.auth.signInWithPassword({ email: EMAIL, password })

  if (signedIn.error) {
    fail(`could not sign in as ${EMAIL}: ${signedIn.error.message}`)
  }

  return signedIn.data.session
}

// -------------------------------------------------------------------- API

function apiClient({ token }) {
  return async function api(path, { method = 'GET', body } = {}) {
    let response

    try {
      response = await fetch(`${baseUrl}/api/flp/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      fail(`no server at ${baseUrl}. Run \`pnpm build && pnpm preview --port 4173\` first.`)
    }

    const text = await response.text()

    if (!response.ok) {
      fail(`${method} /api/flp/${path} → ${response.status} ${text}`)
    }

    return text ? JSON.parse(text) : null
  }
}

// --------------------------------------------------------------- content

function document({ base, front = [], back = [], left = [], right = [] }) {
  return {
    schemaVersion: 2,
    template: { id: 'tee-crew-short', version: 2 },
    base,
    panels: { front: { layers: front }, back: { layers: back }, left: { layers: left }, right: { layers: right } },
  }
}

function paint({ id, strokes }) {
  return { id, kind: 'paint', visible: true, opacity: 1, strokes }
}

function stroke({ id, color, width = 0.03, points }) {
  return { id, tool: 'brush', color, width, opacity: 1, points }
}

function text({ id, content, color, y = 0.5, scale = 0.24, face = 'display' }) {
  return { id, kind: 'text', visible: true, opacity: 1, content, face, color, x: 0.5, y, scale, rotation: 0 }
}

/** A 256×256 PNG crest: a gold ring with a dark centre on transparency. */
function crestPng() {
  const size = 256
  const raw = Buffer.alloc((size * 4 + 1) * size)

  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0

    for (let x = 0; x < size; x += 1) {
      const radius = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2)
      const pixel = row + 1 + x * 4
      const [r, g, b, a] =
        radius > 0.98 ? [0, 0, 0, 0] : radius > 0.78 ? [196, 161, 90, 255] : [26, 28, 34, 255]
      raw.set([r, g, b, a], pixel)
    }
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ----------------------------------------------------------------- seeds

async function createDesign({ api, title, content }) {
  const created = await api('designs', { method: 'POST', body: { mutationKey: randomUUID(), title, content } })
  return { id: created.designId, seq: created.seq }
}

async function save({ api, design, content, kind = 'autosave', label }) {
  const saved = await api(`designs/${design.id}/versions`, {
    method: 'POST',
    body: { baseSeq: design.seq, mutationKey: randomUUID(), kind, content, ...(label ? { label } : {}) },
  })
  design.seq = saved.seq
}

async function restore({ api, design, fromSeq }) {
  const restored = await api(`designs/${design.id}/restore`, {
    method: 'POST',
    body: { baseSeq: design.seq, mutationKey: randomUUID(), fromSeq },
  })
  design.seq = restored.seq
}

async function seedPublished({ api }) {
  const content = document({
    base: { kind: 'solid', color: '#111318' },
    front: [
      paint({
        id: 'paint-front',
        strokes: [
          stroke({ id: 'flame-1', color: '#c4a15a', width: 0.05, points: [0.3, 0.75, 0.42, 0.5, 0.5, 0.3] }),
          stroke({ id: 'flame-2', color: '#e8553d', width: 0.04, points: [0.7, 0.75, 0.58, 0.5, 0.5, 0.3] }),
        ],
      }),
      text({ id: 'text-front', content: 'NIGHT MARKET', color: '#f4ead4', y: 0.62, scale: 0.4 }),
    ],
    back: [text({ id: 'text-back', content: '17', color: '#c4a15a', y: 0.45, scale: 0.5 })],
    right: [paint({ id: 'paint-right', strokes: [stroke({ id: 'band', color: '#c4a15a', points: [0.2, 0.5, 0.8, 0.5] })] })],
  })
  return createDesign({ api, title: 'Night Market', content })
}

async function seedHistory({ api }) {
  const steps = [
    stroke({ id: 's1', color: '#1a1c22', points: [0.3, 0.4, 0.5, 0.5, 0.7, 0.45] }),
    stroke({ id: 's2', color: '#1a1c22', points: [0.3, 0.6, 0.5, 0.65, 0.7, 0.6] }),
    stroke({ id: 's3', color: '#e8553d', width: 0.06, points: [0.25, 0.3, 0.75, 0.8] }),
  ]
  const withStrokes = (count, back = []) =>
    document({
      base: { kind: 'solid', color: '#f3efe6' },
      front: [paint({ id: 'paint-front', strokes: steps.slice(0, count) })],
      back,
    })

  // v1 create, v2 autosave, v3 checkpoint "First pass", v4 autosave (an
  // edit to undo), v5 restore of v3.
  const design = await createDesign({ api, title: 'Studio draft', content: withStrokes(1) })
  const backText = [text({ id: 'text-back', content: 'DRAFT', color: '#1a1c22', y: 0.4, scale: 0.14 })]
  await save({ api, design, content: withStrokes(2) })
  await save({ api, design, content: withStrokes(2, backText), kind: 'checkpoint', label: 'First pass' })
  const checkpoint = design.seq
  await save({ api, design, content: withStrokes(3, backText) })
  await restore({ api, design, fromSeq: checkpoint })
  return design
}

async function seedUpload({ api }) {
  const reserved = await api('assets', { method: 'POST' })
  const uploaded = await fetch(reserved.upload.url, {
    method: reserved.upload.method,
    headers: { 'Content-Type': 'image/png' },
    body: crestPng(),
  })

  if (!uploaded.ok) {
    fail(`image upload → ${uploaded.status} ${await uploaded.text()}`)
  }

  const asset = await api(`assets/${reserved.assetId}/finalize`, { method: 'POST' })

  if (asset.status !== 'ready') {
    fail(`uploaded image is ${asset.status}`)
  }

  const content = document({
    base: { kind: 'solid', color: '#f3efe6' },
    front: [
      {
        id: 'image-front',
        kind: 'image',
        visible: true,
        opacity: 1,
        name: 'Crest',
        assetId: reserved.assetId,
        aspect: 1,
        x: 0.5,
        y: 0.45,
        scale: 0.36,
        rotation: 0,
      },
    ],
  })
  return createDesign({ api, title: 'Crest upload', content })
}

/**
 * Publishes through the studio itself, so the three views are the app's
 * own WebGL captures of the saved version, exactly as a person's would be.
 */
async function publishInBrowser({ session, designId }) {
  const browser = await chromium.launch()

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addInitScript((stored) => {
      window.localStorage.setItem('flp-auth', stored)
    }, JSON.stringify(session))
    const page = await context.newPage()
    await page.goto(`${baseUrl}/create?cloud=${designId}&step=share`)
    await page.getByRole('status').filter({ hasText: 'Saved to cloud' }).waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Publish…' }).click()
    await page.getByRole('button', { name: 'Confirm publish' }).click()
    await page.getByRole('link', { name: /\/s\/[a-f0-9]{16}$/ }).waitFor({ timeout: 120_000 })
  } finally {
    await browser.close()
  }
}

// ------------------------------------------------------------------ main

await deleteDemoAccount()
const session = await createDemoAccount()
const api = apiClient({ token: session.access_token })
await api('profile', { method: 'POST', body: { displayName: DISPLAY_NAME } })

// Oldest first: My Studio lists newest first (publishing counts as an
// update), so the draft opens the list.
const published = await seedPublished({ api })
console.log('Publishing "Night Market" through the studio (headless)…')
await publishInBrowser({ session, designId: published.id })
await seedUpload({ api })
await seedHistory({ api })

// Read the state back the way the studio does, and print it.
const { designs } = await api('designs')
console.log(`\nDemo account ${EMAIL} (public name "${DISPLAY_NAME}"):`)
let shareUrl = null

for (const design of designs) {
  const [history, { publication }] = await Promise.all([
    api(`designs/${design.id}/versions?limit=20`),
    api(`designs/${design.id}/publication`),
  ])
  const versions = history.versions
    .slice()
    .reverse()
    .map((version) => `v${version.seq} ${version.kind}${version.label ? ` "${version.label}"` : ''}${version.restoredFromSeq ? ` of v${version.restoredFromSeq}` : ''}`)
  const status = publication?.status === 'published' ? `published v${publication.seq}` : 'private'
  console.log(`- ${design.title}: ${status}; ${versions.join(', ')}`)

  if (publication?.status === 'published') {
    shareUrl = `${baseUrl}/s/${publication.slug}`
  }
}

if (!shareUrl) {
  fail('"Night Market" is not published')
}

const live = await fetch(`${baseUrl}/api/flp/public/${shareUrl.split('/s/')[1]}`)

if (!live.ok) {
  fail(`the share link does not resolve (${live.status})`)
}

console.log(`
Share link: ${shareUrl}

Sign in for the demo:
  1. Open ${baseUrl}/sign-in and enter ${EMAIL}.
  2. Open Mailpit at ${env.MAILPIT_URL ?? 'http://127.0.0.1:54324'} and copy the 6-digit code.
  3. Enter the code. My Studio lists ${designs.map((design) => design.title).join(', ')}.
`)
