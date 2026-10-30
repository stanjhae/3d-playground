import { describe, expect, test } from 'vitest'

import { PUBLIC_RENDER_KINDS, SIGNED_URL_SECONDS, parseRenderUpload } from './publication'

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

  test('public render links are short-lived', () => {
    expect(SIGNED_URL_SECONDS).toBeLessThanOrEqual(300)
  })
})
