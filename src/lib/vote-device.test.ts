import { describe, expect, test } from 'vitest'

import { voteDeviceId } from './vote-device'

describe('vote device id', () => {
  test('keeps the id it stored, and replaces one that is not an id', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    const first = voteDeviceId({ storage, createId: () => '11111111-1111-4111-8111-111111111111' })
    const second = voteDeviceId({ storage, createId: () => '22222222-2222-4222-8222-222222222222' })

    expect(second).toBe(first)

    values.set('flv:vote-device', 'not-an-id')
    expect(voteDeviceId({ storage, createId: () => '33333333-3333-4333-8333-333333333333' })).toBe(
      '33333333-3333-4333-8333-333333333333',
    )
  })
})
