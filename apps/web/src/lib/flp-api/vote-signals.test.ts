import { describe, expect, test } from 'vitest'

import { deviceToken, signalFlags } from './vote-signals'

describe('vote signals', () => {
  test('the same device and secret always hash the same, and a bad id hashes to nothing', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const first = await deviceToken({ deviceId: id, secret: 'secret' })
    const second = await deviceToken({ deviceId: id, secret: 'secret' })

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(await deviceToken({ deviceId: id, secret: 'other' })).not.toBe(first)
    expect(await deviceToken({ deviceId: 'nope', secret: 'secret' })).toBeNull()
  })

  test('three accounts on one device, or eight votes in a burst, are flagged', () => {
    expect(signalFlags({ deviceAccounts: 2, recentVotes: 7 })).toEqual([])
    expect(signalFlags({ deviceAccounts: 3, recentVotes: 1 })).toEqual(['shared-device'])
    expect(signalFlags({ deviceAccounts: 1, recentVotes: 8 })).toEqual(['vote-burst'])
  })
})
