import { beforeEach, describe, expect, test } from 'vitest'

import { GET, POST } from '../../api/designs'
import { handleDesignsRequest } from './designs-handlers'
import { MAX_THUMBNAIL_CHARS, resetDesignsStore } from './designs-store'

describe('designs HTTP handlers', () => {
  beforeEach(() => {
    resetDesignsStore()
  })

  test('GET lists ranked seed looks', async () => {
    const response = await GET(
      new Request('http://localhost/api/designs', { method: 'GET' }),
    )
    const body = (await response.json()) as {
      designs: { id: string; votes: number }[]
    }

    expect(response.status).toBe(200)
    expect(body.designs[0]?.id).toBe('look-midnight-silk')
    expect(body.designs).toHaveLength(7)
  })

  test('create and vote share one board', async () => {
    const created = await POST(
      new Request('http://localhost/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Studio Guest',
          author: 'Guest',
          thumbnailDataUrl: '',
          overrides: [{ meshName: 'body' }],
        }),
      }),
    )
    const createdBody = (await created.json()) as {
      design: { id: string; votes: number }
    }

    expect(created.status).toBe(201)
    expect(createdBody.design.votes).toBe(0)

    const voted = await POST(
      new Request(
        `http://localhost/api/designs/${createdBody.design.id}/vote`,
        { method: 'POST' },
      ),
    )
    const votedBody = (await voted.json()) as { id: string; votes: number }

    expect(voted.status).toBe(200)
    expect(votedBody.id).toBe(createdBody.design.id)
    expect(votedBody.votes).toBe(1)

    const listed = await GET(
      new Request('http://localhost/api/designs', { method: 'GET' }),
    )
    const listedBody = (await listed.json()) as {
      designs: { id: string; votes: number }[]
    }
    const onBoard = listedBody.designs.find(
      (design) => design.id === createdBody.design.id,
    )

    expect(onBoard?.votes).toBe(1)

    const missing = await POST(
      new Request('http://localhost/api/designs/look-missing/vote', {
        method: 'POST',
      }),
    )

    expect(missing.status).toBe(404)
  })

  test('rewritten voteId query hits the same store', async () => {
    const voted = await handleDesignsRequest({
      request: new Request(
        'http://localhost/api/designs?voteId=look-atelier-ivory',
        { method: 'POST' },
      ),
    })
    const body = (await voted.json()) as { id: string; votes: number }
    const listed = await GET(
      new Request('http://localhost/api/designs', { method: 'GET' }),
    )
    const listedBody = (await listed.json()) as {
      designs: { id: string; votes: number }[]
    }

    expect(voted.status).toBe(200)
    expect(body.id).toBe('look-atelier-ivory')
    expect(body.votes).toBe(6)
    expect(
      listedBody.designs.find((design) => design.id === 'look-atelier-ivory')
        ?.votes,
    ).toBe(6)
  })

  test('POST drops an oversized thumbnail at parse time', async () => {
    const response = await POST(
      new Request('http://localhost/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Huge Still',
          author: 'Guest',
          thumbnailDataUrl: `data:image/png;base64,${'a'.repeat(MAX_THUMBNAIL_CHARS)}`,
          overrides: [{ meshName: 'body' }],
        }),
      }),
    )
    const body = (await response.json()) as {
      design: { thumbnailDataUrl: string }
    }

    expect(response.status).toBe(201)
    expect(body.design.thumbnailDataUrl).toBe('')
  })

  test('POST rejects a body without a title', async () => {
    const response = await POST(
      new Request('http://localhost/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: [] }),
      }),
    )

    expect(response.status).toBe(400)
  })
})
