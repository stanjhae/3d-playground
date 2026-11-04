import { expect, test } from 'vitest'

import { useSessionStore } from '../auth/session-store'
import { updateDesign } from './client'

test('a rename is sent so it finishes even if the page goes away straight after', async () => {
  useSessionStore.setState({ status: 'signed-in', accessToken: 'token', userId: 'user-1' } as never)
  const calls: Array<RequestInit | undefined> = []

  await updateDesign({
    designId: '0f6e8b8c-3c1d-4f7a-9a52-2f1c5b7e9d10',
    request: { title: 'New name' },
    fetchImpl: async (_, init) => {
      calls.push(init)
      return new Response(JSON.stringify({ id: 'x', title: 'New name', description: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  expect(calls[0]).toMatchObject({ method: 'PATCH', keepalive: true })
})
