import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'

import {
  BASE_PUBLIC_RENDER_KINDS,
  PUBLIC_CACHE_CONTROL,
  PUBLIC_RENDER_KINDS,
  type PublishedDesign,
  parseRenderUpload,
  publicDesignPayload,
  publicImagePath,
  readPublicDesign,
  uploadRenders,
} from './publication'
import { TINY_JPEG } from '../image-fixtures'

const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: 'AAAA' }))

describe('public render kinds (#179)', () => {
  test('new publications upload five views in capture order', () => {
    expect(PUBLIC_RENDER_KINDS).toEqual(['view_front', 'view_three_quarter', 'view_back', 'view_left', 'view_right'])
  })

  test('only the original three are required for a live publication', () => {
    expect(BASE_PUBLIC_RENDER_KINDS).toEqual(['view_front', 'view_three_quarter', 'view_back'])
    expect(PUBLIC_RENDER_KINDS.slice(0, 3)).toEqual([...BASE_PUBLIC_RENDER_KINDS])
  })
})

describe('parseRenderUpload', () => {
  test('accepts exactly the five public views of one version', () => {
    expect(parseRenderUpload({ value: { seq: 3, renders } })).toEqual({
      ok: true,
      seq: 3,
      renders,
      stamp: { templateId: null, templateVersion: null, compilerVersion: null },
    })
  })

  test('names the garment template that drew the views', () => {
    expect(parseRenderUpload({ value: { seq: 3, renders, templateId: 'hoodie', templateVersion: 1, compilerVersion: 1 } })).toMatchObject({
      ok: true,
      stamp: { templateId: 'hoodie', templateVersion: 1, compilerVersion: 1 },
    })
    expect(parseRenderUpload({ value: { seq: 3, renders, templateId: 'cape' } })).toMatchObject({
      ok: false,
      error: { body: { error: { issues: [{ path: '$.templateId' }] } } },
    })
  })

  test('carries what drew the views (C2)', () => {
    expect(parseRenderUpload({ value: { seq: 3, renders, templateVersion: 2, compilerVersion: 1 } })).toMatchObject({
      ok: true,
      stamp: { templateVersion: 2, compilerVersion: 1 },
    })
  })

  test.each([
    [{ seq: 0, renders }, '$.seq'],
    [{ seq: 1, renders: renders.slice(1) }, '$.renders'],
    // The three views publications used before #179 are no longer enough.
    [{ seq: 1, renders: renders.slice(0, 3) }, '$.renders'],
    [{ seq: 1, renders: [...renders.slice(0, 4), { kind: 'view_front', data: 'AAAA' }] }, '$.renders[4].kind'],
    [{ seq: 1, renders: [{ kind: 'atlas', data: 'AAAA' }, ...renders.slice(1)] }, '$.renders[0]'],
    [{ seq: 1, renders, ownerId: 'x' }, '$.ownerId'],
    [{ seq: 1, renders, templateVersion: 0 }, '$.templateVersion'],
    [{ seq: 1, renders, templateVersion: '2' }, '$.templateVersion'],
    [{ seq: 1, renders, compilerVersion: 1.5 }, '$.compilerVersion'],
    [{ seq: 1, renders, compilerVersion: 1001 }, '$.compilerVersion'],
  ])('refuses %j at %s', (value, path) => {
    const result = parseRenderUpload({ value })

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.error.body.error.issues?.[0]?.path).toBe(path)
  })

  test('public images and pages are never cached (#183)', () => {
    expect(PUBLIC_CACHE_CONTROL).toBe('no-store')
  })
})

describe('publicImagePath', () => {
  test('defaults to the current front view, a stable link for previews', () => {
    expect(publicImagePath({ slug: '0123456789abcdef' })).toBe('/api/flp/public/0123456789abcdef/image')
  })

  test('pins the view and version for the public page', () => {
    expect(publicImagePath({ slug: '0123456789abcdef', kind: 'view_back', seq: 4 })).toBe(
      '/api/flp/public/0123456789abcdef/image?view=view_back&seq=4',
    )
  })
})

describe('publicDesignPayload', () => {
  const published = (kinds: readonly string[]): PublishedDesign => ({
    designId: '00000000-0000-4000-8000-000000000001',
    slug: '0123456789abcdef',
    title: 'Tee',
    displayName: null,
    seq: 2,
    publishedAt: '2026-10-31T10:00:00.000Z',
    renderPaths: new Map(kinds.map((kind) => [kind, `owner/design/v2/${kind}.jpg`])),
  })

  test('a three-view publication (before #179) lists only its three views', () => {
    const payload = publicDesignPayload({ published: published(BASE_PUBLIC_RENDER_KINDS) })

    expect(Object.keys(payload.renders)).toEqual([...BASE_PUBLIC_RENDER_KINDS])
    expect(payload.renders.view_left).toBeUndefined()
  })

  test('a five-view publication lists the sleeves too, pinned to the version', () => {
    const payload = publicDesignPayload({ published: published(PUBLIC_RENDER_KINDS) })

    expect(Object.keys(payload.renders)).toEqual([...PUBLIC_RENDER_KINDS])
    expect(payload.renders.view_left).toBe('/api/flp/public/0123456789abcdef/image?view=view_left&seq=2')
  })

  test('never lists other artifact kinds', () => {
    const payload = publicDesignPayload({ published: published([...BASE_PUBLIC_RENDER_KINDS, 'atlas']) })

    expect(Object.keys(payload.renders)).toEqual([...BASE_PUBLIC_RENDER_KINDS])
  })
})

describe('readPublicDesign', () => {
  function adminAnswering(answer: { data: unknown; error: unknown }) {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => answer,
    }

    return { from: () => query } as unknown as SupabaseClient
  }

  const respond = ({ status, body }: { status: number; body?: unknown }) => Response.json(body, { status })

  test('a design that is not published is a 404', async () => {
    const response = await readPublicDesign({
      admin: adminAnswering({ data: null, error: null }),
      slug: '3f9a1c22b7e04d11',
      respond,
    })

    expect(response.status).toBe(404)
  })

  test('a database failure is a 500, not "not published"', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await readPublicDesign({
      admin: adminAnswering({ data: null, error: { message: 'connection refused' } }),
      slug: '3f9a1c22b7e04d11',
      respond,
    })

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('connection refused')
    quiet.mockRestore()
  })
})

describe('uploadRenders (C2)', () => {
  const OWNER = '11111111-1111-4111-8111-111111111111'
  const DESIGN = '22222222-2222-4222-8222-222222222222'

  function base64({ bytes }: { bytes: Uint8Array }) {
    let binary = ''
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return btoa(binary)
  }

  const jpegs = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: base64({ bytes: TINY_JPEG }) }))

  const TINY_JPEG_SHA256 = (async () =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(TINY_JPEG)))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''))()

  /**
   * An in-memory stand-in for the two clients: one owned design whose
   * `ready` views are stored intact, except the kinds listed in `broken`.
   */
  async function fakeStore({ ready, broken = [] }: { ready: Array<{ kind: string; seq: number }>; broken?: string[] }) {
    const sha256 = await TINY_JPEG_SHA256
    const rows = ready.map((row) => ({
      design_id: DESIGN,
      version_seq: row.seq,
      kind: row.kind,
      status: 'ready',
      storage_path: `${OWNER}/${DESIGN}/v${row.seq}/${row.kind}.jpg`,
      sha256,
      template_version: 1 as number | null,
      compiler_version: 1 as number | null,
    }))
    const files = new Map(
      rows
        .filter((row) => !broken.includes(row.kind))
        .map((row) => [row.storage_path, new Uint8Array(TINY_JPEG)] as const),
    )
    const uploads: string[] = []

    function query(table: string) {
      const filters: Array<[string, unknown]> = []
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return builder
        },
        maybeSingle: async () => ({
          data: table === 'designs' ? { id: DESIGN, owner_id: OWNER, head_seq: 2, title: 'Tee' } : { seq: 2 },
          error: null,
        }),
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: rows.filter((row) => filters.every(([column, value]) => (row as Record<string, unknown>)[column] === value)),
            error: null,
          }),
        upsert: async (row: (typeof rows)[number]) => {
          const at = rows.findIndex(
            (existing) =>
              existing.design_id === row.design_id && existing.version_seq === row.version_seq && existing.kind === row.kind,
          )
          if (at >= 0) rows[at] = row
          else rows.push(row)
          return { error: null }
        },
      }
      return builder
    }

    const client = {
      from: query,
      storage: {
        from: () => ({
          upload: async (path: string, bytes: Uint8Array<ArrayBuffer>) => {
            uploads.push(path)
            files.set(path, bytes)
            return { error: null }
          },
          download: async (path: string) => {
            const bytes = files.get(path)
            return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'Object not found' } }
          },
        }),
      },
    } as unknown as SupabaseClient

    return { client, rows, uploads }
  }

  const respond = ({ status, body }: { status: number; body?: unknown }) => Response.json(body, { status })

  test('a new version\'s views are stored with what drew them', async () => {
    const store = await fakeStore({ ready: [] })
    const response = await uploadRenders({
      value: { seq: 2, renders: jpegs, templateVersion: 2, compilerVersion: 1 },
      admin: store.client,
      asUser: store.client,
      designId: DESIGN,
      respond,
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ seq: 2, kinds: [...PUBLIC_RENDER_KINDS], kept: [] })
    expect(store.uploads).toHaveLength(PUBLIC_RENDER_KINDS.length)
    expect(store.rows.map((row) => [row.kind, row.template_version, row.compiler_version])).toEqual(
      PUBLIC_RENDER_KINDS.map((kind) => [kind, 2, 1]),
    )
  })

  test('republishing a version keeps its views: no file or row is replaced', async () => {
    const store = await fakeStore({ ready: PUBLIC_RENDER_KINDS.map((kind) => ({ kind, seq: 2 })) })
    const before = structuredClone(store.rows)
    const response = await uploadRenders({
      value: { seq: 2, renders: jpegs, templateVersion: 3, compilerVersion: 2 },
      admin: store.client,
      asUser: store.client,
      designId: DESIGN,
      respond,
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ kept: [...PUBLIC_RENDER_KINDS] })
    expect(store.uploads).toEqual([])
    expect(store.rows).toEqual(before)
  })

  test('a version missing its sleeves gets them, and its first three views stay', async () => {
    const store = await fakeStore({ ready: BASE_PUBLIC_RENDER_KINDS.map((kind) => ({ kind, seq: 2 })) })
    const before = structuredClone(store.rows)
    const response = await uploadRenders({
      value: { seq: 2, renders: jpegs, templateVersion: 2, compilerVersion: 1 },
      admin: store.client,
      asUser: store.client,
      designId: DESIGN,
      respond,
    })

    expect(await response.json()).toMatchObject({ kept: [...BASE_PUBLIC_RENDER_KINDS] })
    expect(store.uploads).toEqual([`${OWNER}/${DESIGN}/v2/view_left.jpg`, `${OWNER}/${DESIGN}/v2/view_right.jpg`])
    expect(store.rows.slice(0, 3)).toEqual(before)
  })

  test('a ready view whose stored file is gone is replaced, so republishing still repairs it', async () => {
    const store = await fakeStore({ ready: PUBLIC_RENDER_KINDS.map((kind) => ({ kind, seq: 2 })), broken: ['view_back'] })
    const response = await uploadRenders({
      value: { seq: 2, renders: jpegs, templateVersion: 2, compilerVersion: 2 },
      admin: store.client,
      asUser: store.client,
      designId: DESIGN,
      respond,
    })

    expect(await response.json()).toMatchObject({ kept: PUBLIC_RENDER_KINDS.filter((kind) => kind !== 'view_back') })
    expect(store.uploads).toEqual([`${OWNER}/${DESIGN}/v2/view_back.jpg`])
    expect(store.rows.find((row) => row.kind === 'view_back')).toMatchObject({ compiler_version: 2 })
  })

  test('another version\'s ready views never stop this one being stored', async () => {
    const store = await fakeStore({ ready: PUBLIC_RENDER_KINDS.map((kind) => ({ kind, seq: 1 })) })
    const before = structuredClone(store.rows)
    await uploadRenders({ value: { seq: 2, renders: jpegs }, admin: store.client, asUser: store.client, designId: DESIGN, respond })

    expect(store.uploads).toHaveLength(PUBLIC_RENDER_KINDS.length)
    expect(store.uploads.every((path) => path.includes('/v2/'))).toBe(true)
    expect(store.rows.slice(0, 5)).toEqual(before)
    // A tab opened before C2 sends no stamp; its views are stored unstamped.
    expect(store.rows.slice(5).map((row) => row.template_version)).toEqual(PUBLIC_RENDER_KINDS.map(() => null))
  })
})
