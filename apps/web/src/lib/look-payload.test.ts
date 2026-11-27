import { describe, expect, test } from 'vitest'

import {
  stripAngleStillsUntilFit,
  trimAngleStillsForLook,
} from './look-payload'
import { createEmptyDesign } from './design-schema'

describe('look-payload', () => {
  test('trimAngleStillsForLook drops stills when the look is already heavy', () => {
    expect(
      trimAngleStillsForLook({
        angleStills: ['a'.repeat(50_000), 'b'.repeat(50_000)],
        artMap: 'x'.repeat(800_000),
        hasDocument: true,
      }),
    ).toEqual([])
  })

  test('trimAngleStillsForLook keeps stills that fit the room', () => {
    const kept = trimAngleStillsForLook({
      angleStills: ['data:image/jpeg;base64,aaa', 'data:image/jpeg;base64,bbb'],
      artMap: 'data:image/png;base64,abc',
      hasDocument: false,
    })

    expect(kept).toHaveLength(2)
  })

  test('stripAngleStillsUntilFit removes guest stills before failing the board', () => {
    const heavy = 'd'.repeat(2_000_000)
    const designs = [
      {
        ...createEmptyDesign({ id: 'look-atelier-ivory' }),
        title: 'Seed',
        angleStills: [heavy],
      },
      {
        ...createEmptyDesign({ id: 'look-guest-1' }),
        title: 'Guest',
        votes: 1,
        angleStills: [heavy, heavy],
      },
    ]

    const stripped = stripAngleStillsUntilFit({
      designs,
      maxChars: 3_500_000,
    })

    expect(stripped.find((look) => look.id === 'look-guest-1')?.angleStills).toBeUndefined()
  })
})
