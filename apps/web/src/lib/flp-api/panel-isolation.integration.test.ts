// Measures the procedural tee (@3) with print-view-harness; must load first.
import '../testing/procedural-tee'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  type CanonicalDocument,
  type CanonicalPanelId,
  CANONICAL_PANEL_IDS,
  createEmptyCanonicalDocument,
} from '../canonical-document'
import {
  MANIFEST_MESH,
  decodeRgbPng,
  documentAtlas,
  drawStill,
  encodeRgbPng,
  rasterizeView,
  regionAt,
} from '../print-view-harness'
import type { CameraPresetName } from '../studio-camera'
import { CURRENT_TEMPLATE } from '../template-manifest'
import { type Account, createAccount } from './integration-harness'
import { PUBLIC_RENDER_KINDS, type PublicRenderKind } from './publication'
import { type FlpServerEnv, flpServerEnv, handleFlpRequest } from './server'

/**
 * Independent panel editing end to end (E02 #153) against local Supabase:
 * a distinct mark on each of the four panels is saved, a later edit is
 * undone by restoring that version, and the restore is published. Every
 * public view, served through the hash check (#180), must show each mark
 * only on its own panel's print region.
 *
 * Node has no WebGL, so the five views are drawn by the z-buffer harness
 * in print-view-harness.ts from the restored version's atlas, through the
 * same camera presets the studio captures with. Run with
 * `pnpm test:integration`.
 */

const processEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const env = processEnv.FLP_INTEGRATION === '1' ? flpServerEnv(processEnv) : null

/** One colour per canonical panel, far from the fabric and from each other. */
const MARKS: Record<CanonicalPanelId, `#${string}`> = {
  front: '#d0202a',
  back: '#1f9a3a',
  left: '#2040d0',
  right: '#e0b000',
}
/** The edit the restore undoes; it must reach no view. */
const LATER: `#${string}` = '#c020c0'

const PRESET: Record<PublicRenderKind, CameraPresetName> = {
  view_front: 'front',
  view_three_quarter: 'threeQuarter',
  view_back: 'back',
  view_left: 'left',
  view_right: 'right',
}

/**
 * Which panels' marks each view shows. The sleeve centres face backwards,
 * so the sleeves show from the back and three-quarter views, and each
 * sleeve view also sees the back; `view_left` (camera at −x) frames the
 * wearer's right sleeve (#179).
 */
const EXPECTED: Record<PublicRenderKind, CanonicalPanelId[]> = {
  view_front: ['front'],
  view_three_quarter: ['front', 'left', 'right'],
  view_back: ['back', 'left', 'right'],
  view_left: ['back', 'right'],
  view_right: ['back', 'left'],
}

const SIZE = { width: 240, height: 300 }

/** A dot at each panel's landmark centre: chest, shoulder blades, sleeve centre. */
function markedDocument({ later = false }: { later?: boolean } = {}): CanonicalDocument {
  const document = createEmptyCanonicalDocument()

  for (const panel of CANONICAL_PANEL_IDS) {
    const y = panel === 'front' || panel === 'back' ? 0.69 : 0.5
    document.panels[panel].layers = [
      {
        id: `paint-${panel}`,
        kind: 'paint',
        visible: true,
        opacity: 1,
        strokes: [
          { id: `mark-${panel}`, tool: 'brush', color: MARKS[panel], width: 0.1, opacity: 1, points: [0.48, y, 0.52, y] },
          ...(later
            ? [{ id: `later-${panel}`, tool: 'brush' as const, color: LATER, width: 0.1, opacity: 1, points: [0.3, y, 0.7, y] }]
            : []),
        ],
      },
    ]
  }

  return document
}

function base64({ bytes }: { bytes: Uint8Array }) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function hex({ color }: { color: string }) {
  const value = Number.parseInt(color.slice(1), 16)
  return [value >> 16, (value >> 8) & 255, value & 255]
}

/** The mark a pixel shows, if any: within a small distance of its colour. */
function markAt({ rgb, pixel }: { rgb: Uint8Array; pixel: number }) {
  const close = (color: string) =>
    hex({ color }).reduce((sum, channel, index) => sum + Math.abs(channel - rgb[pixel * 3 + index]!), 0) < 24

  if (close(LATER)) return 'later'
  return CANONICAL_PANEL_IDS.find((panel) => close(MARKS[panel])) ?? null
}

describe.skipIf(!env)('independent panels through restore and publish (#153)', () => {
  const serverEnv = env as FlpServerEnv
  let admin: SupabaseClient
  let account: Account
  let designId: string

  function api({ path, method = 'GET', token, body }: { path: string; method?: 'GET' | 'POST'; token?: string; body?: unknown }) {
    return handleFlpRequest({
      env: serverEnv,
      request: new Request(`http://localhost/api/flp/${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  beforeAll(async () => {
    admin = createClient(serverEnv.url, serverEnv.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    account = await createAccount({ admin, env: serverEnv, label: 'panels' })
    const created = await api({
      path: 'designs',
      method: 'POST',
      token: account.token,
      body: { mutationKey: crypto.randomUUID(), title: 'Four panels', content: createEmptyCanonicalDocument() },
    })
    designId = ((await created.json()) as { designId: string }).designId
  })

  afterAll(async () => {
    if (account) await admin.auth.admin.deleteUser(account.id)
  })

  test('each view of the published restore shows each mark only on its own panel', async () => {
    const save = async ({ baseSeq, content }: { baseSeq: number; content: CanonicalDocument }) => {
      const response = await api({
        path: `designs/${designId}/versions`,
        method: 'POST',
        token: account.token,
        body: { baseSeq, mutationKey: crypto.randomUUID(), kind: 'checkpoint', content },
      })
      expect(response.status).toBe(201)
      return (await response.json()) as { seq: number; contentHash: string }
    }

    // 1. A distinct mark on each panel, then a later edit on every panel.
    const marked = await save({ baseSeq: 1, content: markedDocument() })
    const later = await save({ baseSeq: marked.seq, content: markedDocument({ later: true }) })

    // 2. Restore the marked version and publish the restore.
    const restoreResponse = await api({
      path: `designs/${designId}/restore`,
      method: 'POST',
      token: account.token,
      body: { baseSeq: later.seq, mutationKey: crypto.randomUUID(), fromSeq: marked.seq },
    })
    expect(restoreResponse.status).toBe(201)
    const restored = (await restoreResponse.json()) as { seq: number; contentHash: string }
    expect(restored.contentHash).toBe(marked.contentHash)

    const detail = (await (await api({ path: `designs/${designId}/versions/${restored.seq}`, token: account.token })).json()) as {
      content: CanonicalDocument
    }
    expect(detail.content).toEqual(markedDocument())

    // The client captures the head version's views; here the harness draws them.
    const atlas = documentAtlas({ document: detail.content })
    const views = new Map(
      PUBLIC_RENDER_KINDS.map((kind) => [kind, rasterizeView({ preset: PRESET[kind], ...SIZE })]),
    )
    const drawn = new Map(PUBLIC_RENDER_KINDS.map((kind) => [kind, drawStill({ view: views.get(kind)!, atlas })]))
    const renders = await Promise.all(
      PUBLIC_RENDER_KINDS.map(async (kind) => ({
        kind,
        data: base64({ bytes: await encodeRgbPng({ ...SIZE, rgb: drawn.get(kind)! }) }),
      })),
    )

    expect(
      (await api({ path: `designs/${designId}/renders`, method: 'POST', token: account.token, body: { seq: restored.seq, renders } }))
        .status,
    ).toBe(201)
    const published = await api({
      path: `designs/${designId}/publication`,
      method: 'POST',
      token: account.token,
      body: { seq: restored.seq },
    })
    expect(published.status).toBe(200)
    const { slug } = (await published.json()) as { slug: string }

    // 3. Every public view, through the hash-checked image route.
    const page = (await (await api({ path: `public/${slug}` })).json()) as { seq: number; renders: Record<string, string> }
    expect(page.seq).toBe(restored.seq)

    for (const kind of PUBLIC_RENDER_KINDS) {
      const served = await handleFlpRequest({ env: serverEnv, request: new Request(`http://localhost${page.renders[kind]}`) })
      expect(served.status, kind).toBe(200)
      const image = await decodeRgbPng({ bytes: new Uint8Array(await served.arrayBuffer()) })
      expect(image.rgb, `${kind} is the uploaded view`).toEqual(drawn.get(kind))

      const view = views.get(kind)!
      const seen = new Set<CanonicalPanelId>()

      for (let pixel = 0; pixel < view.samples.length; pixel += 1) {
        const mark = markAt({ rgb: image.rgb, pixel })

        if (!mark) {
          continue
        }

        expect(mark, `${kind}: the restored-away edit is not published`).not.toBe('later')

        if (mark === 'later') {
          continue
        }

        // The mark's pixel lies on that panel's own print region and mesh.
        const sample = view.samples[pixel]!
        const renderPanel = CURRENT_TEMPLATE.regions[mark].renderPanel
        expect(sample.printable, `${kind}: ${mark} on a printable mesh`).toBe(true)
        expect(regionAt(sample), `${kind}: ${mark} region`).toBe(renderPanel)
        expect(sample.mesh, `${kind}: ${mark} mesh`).toBe(MANIFEST_MESH[renderPanel])
        seen.add(mark)
      }

      expect([...seen].sort(), `${kind} shows these marks`).toEqual([...EXPECTED[kind]].sort())
    }
  })
})
