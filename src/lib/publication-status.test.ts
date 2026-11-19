import { beforeEach, describe, expect, test } from 'vitest'

import type { getPublication } from './flp-api/client'
import type { OwnerPublication } from './flp-api/publication'
import {
  loadPublicationStatus,
  publicationStatusFor,
  resetPublicationStatus,
  usePublicationStatus,
} from './publication-status'

type Read = typeof getPublication
type Answer = Awaited<ReturnType<Read>>

const published: OwnerPublication = {
  slug: 'abc',
  status: 'published',
  seq: 3,
  displayName: null,
  rendersReadyForHead: true,
}

function deferredRead() {
  const pending: Array<(answer: Answer) => void> = []
  const read = (() => new Promise<Answer>((resolve) => pending.push(resolve))) as unknown as Read
  return { read, pending }
}

const current = () => usePublicationStatus.getState().current

describe('publication status', () => {
  beforeEach(() => {
    resetPublicationStatus()
  })

  test('is unknown until the server answers, so Publish is never offered early', async () => {
    const { read, pending } = deferredRead()
    const loading = loadPublicationStatus({ designId: 'd1', read })
    expect(current()).toEqual({ designId: 'd1', status: 'unknown' })
    pending[0]!({ ok: true, data: { publication: published } })
    await loading
    expect(current()).toEqual({ designId: 'd1', status: 'known', publication: published })
  })

  test('a failed read is failed, not private', async () => {
    const { read, pending } = deferredRead()
    const loading = loadPublicationStatus({ designId: 'd1', read })
    pending[0]!({ ok: false, code: 'network', message: 'Could not reach the server' })
    await loading
    expect(current().status).toBe('failed')
  })

  test('reads once per design, and an older read landing late is dropped', async () => {
    const { read, pending } = deferredRead()
    void loadPublicationStatus({ designId: 'd1', read })
    void loadPublicationStatus({ designId: 'd1', read })
    expect(pending).toHaveLength(1)

    const forced = loadPublicationStatus({ designId: 'd1', read, force: true })
    expect(pending).toHaveLength(2)
    pending[1]!({ ok: true, data: { publication: published } })
    await forced
    pending[0]!({ ok: true, data: { publication: null } })
    await Promise.resolve()
    expect(current()).toEqual({ designId: 'd1', status: 'known', publication: published })
  })

  test("another design's status never shows for this one", () => {
    expect(
      publicationStatusFor({ current: { designId: 'd1', status: 'known', publication: published }, designId: 'd2' }),
    ).toEqual({ designId: 'd2', status: 'unknown' })
  })
})
