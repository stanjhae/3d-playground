import { describe, expect, test } from 'vitest'

import { PUBLIC_CACHE_CONTROL, PUBLIC_RENDER_KINDS, parseRenderUpload, publicImagePath } from './publication'

const renders = PUBLIC_RENDER_KINDS.map((kind) => ({ kind, data: 'AAAA' }))

describe('parseRenderUpload', () => {
  test('accepts exactly the three public views of one version', () => {
    expect(parseRenderUpload({ value: { seq: 3, renders } })).toEqual({ ok: true, seq: 3, renders })
  })

  test.each([
    [{ seq: 0, renders }, '$.seq'],
    [{ seq: 1, renders: renders.slice(1) }, '$.renders'],
    [{ seq: 1, renders: [...renders.slice(0, 2), { kind: 'view_front', data: 'AAAA' }] }, '$.renders[2].kind'],
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
