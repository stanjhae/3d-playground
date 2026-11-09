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
} from './publication'

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
    expect(parseRenderUpload({ value: { seq: 3, renders } })).toEqual({ ok: true, seq: 3, renders })
  })

  test.each([
    [{ seq: 0, renders }, '$.seq'],
    [{ seq: 1, renders: renders.slice(1) }, '$.renders'],
    // The three views publications used before #179 are no longer enough.
    [{ seq: 1, renders: renders.slice(0, 3) }, '$.renders'],
    [{ seq: 1, renders: [...renders.slice(0, 4), { kind: 'view_front', data: 'AAAA' }] }, '$.renders[4].kind'],
    [{ seq: 1, renders: [{ kind: 'atlas', data: 'AAAA' }, ...renders.slice(1)] }, '$.renders[0]'],
    [{ seq: 1, renders, ownerId: 'x' }, '$.ownerId'],
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
