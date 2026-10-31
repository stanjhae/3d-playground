import { describe, expect, test } from 'vitest'

import { createEmptyCanonicalDocument } from './canonical-document'
import { type RecoveryOffer, liveRecoveryOffer } from './cloud-recovery'

const document = createEmptyCanonicalDocument()
const record = {
  ownerId: 'a',
  designId: 'd',
  baseSeq: 5,
  revision: 9,
  savedAt: 0,
  schemaVersion: 2,
  document,
} as unknown as Extract<RecoveryOffer, { kind: 'recover' }>['record']
const recover: Extract<RecoveryOffer, { kind: 'recover' }> = { kind: 'recover', key: 'k', record, document }

describe('liveRecoveryOffer', () => {
  test('stays recoverable while nothing changed since the prompt opened', () => {
    expect(liveRecoveryOffer({ offer: recover, cloudHeadSeq: 5, hasUnsavedEdits: false })).toBe(recover)
  })

  test('an autosave while the prompt was open makes it stale', () => {
    expect(liveRecoveryOffer({ offer: recover, cloudHeadSeq: 6, hasUnsavedEdits: false })).toMatchObject({
      kind: 'stale',
      key: 'k',
      document,
    })
  })

  test('unsaved edits made while the prompt was open make it stale', () => {
    expect(liveRecoveryOffer({ offer: recover, cloudHeadSeq: 5, hasUnsavedEdits: true }).kind).toBe('stale')
  })

  test('stale and unsupported offers are left as they are', () => {
    const stale = { ...recover, kind: 'stale' as const }
    expect(liveRecoveryOffer({ offer: stale, cloudHeadSeq: 5, hasUnsavedEdits: false })).toBe(stale)
  })
})
