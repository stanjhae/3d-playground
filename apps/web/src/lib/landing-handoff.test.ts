import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createEmptyDocument } from './design-document'
import {
  consumeLandingHandoff,
  LANDING_HANDOFF_KEY,
  parseLandingHandoff,
  serializeLandingHandoff,
  writeLandingHandoff,
} from './landing-handoff'

describe('landing-handoff', () => {
  // Tests run in Node; give the module the Storage it would get in a tab.
  beforeEach(() => {
    const entries = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('round-trips a landing design through session storage', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    expect(
      writeLandingHandoff({
        garmentId: 'tee',
        document,
        color: '#f7f7f7',
        neck: 'v',
        hem: 'crop',
        sleeve: 'long',
      }),
    ).toBe(true)

    const raw = sessionStorage.getItem(LANDING_HANDOFF_KEY)
    expect(raw).toBeTruthy()
    expect(parseLandingHandoff({ value: raw })).toMatchObject({
      garmentId: 'tee',
      color: '#f7f7f7',
      neck: 'v',
      hem: 'crop',
      sleeve: 'long',
    })

    const consumed = consumeLandingHandoff()
    expect(consumed?.document.garmentId).toBe('tee')
    expect(consumed?.neck).toBe('v')
    expect(sessionStorage.getItem(LANDING_HANDOFF_KEY)).toBeNull()
    expect(consumeLandingHandoff()).toBeNull()
  })

  test('serializeLandingHandoff keeps a cloned document', () => {
    const document = createEmptyDocument({ garmentId: 'tee' })
    const encoded = serializeLandingHandoff({
      garmentId: 'tee',
      document,
      color: '#111111',
    })
    const parsed = parseLandingHandoff({ value: encoded })
    expect(parsed?.color).toBe('#111111')
    expect(parsed?.document).not.toBe(document)
  })
})
