import { beforeEach, describe, expect, test } from 'vitest'

import { GET, POST } from '../../api/designs'
import { POST as votePost } from '../../api/designs/[id]/vote'
import { MAX_THUMBNAIL_CHARS, resetDesignsStore } from './designs-store'

describe('designs HTTP handlers', () => {
  beforeEach(() => {
    resetDesignsStore()
  })

  test('GET lists ranked seed looks', async () => {
    const response = GET()
    const body = (await response.json()) as {
      designs: { id: string; votes: number }[]
    }

    expect(response.status).toBe(200)
    expect(body.designs[0]?.id).toBe('look-midnight-silk')
    expect(body.designs).toHaveLength(7)
  })

  test('POST creates a look and vote 404s when missing', async () => {
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

    const voted = await votePost(
      new Request(
        `http://localhost/api/designs/${createdBody.design.id}/vote`,
        { method: 'POST' },
      ),
    )
    const votedBody = (await voted.json()) as { votes: number }

    expect(voted.status).toBe(200)
    expect(votedBody.votes).toBe(1)

    const missing = await votePost(
      new Request('http://localhost/api/designs/look-missing/vote', {
        method: 'POST',
      }),
    )

    expect(missing.status).toBe(404)
  })

  test('POST drops an oversized thumbnail', async () => {
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
