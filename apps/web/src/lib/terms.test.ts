import { describe, expect, test } from 'vitest'

import { forgetAccountLocally } from './account-local-data'
import { memoryRecoveryStorage, recoveryPrefix } from './cloud-recovery'
import { snapshotStorageKey } from './design-snapshots'
import { parseAcceptTermsRequest, parseDeleteAccountRequest, sameEmail } from './flp-api/contract'
import { TERMS_VERSION, termsAccepted } from './terms'

// Terms of use and account deletion (P1).

describe('terms version', () => {
  test('only the version in force counts as accepted', () => {
    expect(termsAccepted({ version: TERMS_VERSION })).toBe(true)
    expect(termsAccepted({ version: null })).toBe(false)
    expect(termsAccepted({ version: undefined })).toBe(false)
    expect(termsAccepted({ version: '2000-01-01' })).toBe(false)
  })

  test('fits the database column (1–32 characters)', () => {
    expect(TERMS_VERSION.length).toBeGreaterThan(0)
    expect(TERMS_VERSION.length).toBeLessThanOrEqual(32)
    expect(parseAcceptTermsRequest({ value: { version: TERMS_VERSION } }).ok).toBe(true)
  })

  test('the accept request takes exactly a version', () => {
    expect(parseAcceptTermsRequest({ value: {} }).ok).toBe(false)
    expect(parseAcceptTermsRequest({ value: { version: ' ' } }).ok).toBe(false)
    expect(parseAcceptTermsRequest({ value: { version: TERMS_VERSION, at: 'now' } }).ok).toBe(false)
  })
})

describe('account deletion confirmation', () => {
  test('the typed email must be the account email, ignoring case and outer spaces', () => {
    expect(sameEmail({ typed: ' Ada@Example.test ', account: 'ada@example.test' })).toBe(true)
    expect(sameEmail({ typed: 'ada@example.tes', account: 'ada@example.test' })).toBe(false)
    expect(sameEmail({ typed: '', account: 'ada@example.test' })).toBe(false)
    expect(sameEmail({ typed: 'ada@example.test', account: null })).toBe(false)
  })

  test('the request carries only the confirmation', () => {
    expect(parseDeleteAccountRequest({ value: { confirmEmail: 'ada@example.test' } }).ok).toBe(true)
    expect(parseDeleteAccountRequest({ value: null }).ok).toBe(false)
    expect(parseDeleteAccountRequest({ value: { confirmEmail: 'ada@example.test', userId: 'x' } }).ok).toBe(false)
  })

  test("this browser forgets only the deleted account's snapshots and recovery entries", async () => {
    const removed: string[] = []
    const storage = { removeItem: (key: string) => void removed.push(key) }
    const mine = `${recoveryPrefix({ ownerId: 'gone', designId: 'd1' })}w/2/1`
    const theirs = `${recoveryPrefix({ ownerId: 'kept', designId: 'd2' })}w/2/1`
    const recovery = memoryRecoveryStorage({ [mine]: '{}', [theirs]: '{}' })

    await forgetAccountLocally({ ownerId: 'gone', storage, recovery })

    expect(removed).toEqual([snapshotStorageKey({ ownerId: 'gone' })])
    expect(await recovery.keys(recoveryPrefix({ ownerId: 'gone' }))).toEqual([])
    expect(await recovery.keys(recoveryPrefix({ ownerId: 'kept' }))).toEqual([theirs])
  })

  test('blocked storage is not an error', async () => {
    const storage = {
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const recovery = { keys: () => Promise.reject(new Error('no indexedDB')), delete: () => Promise.resolve() }
    await expect(forgetAccountLocally({ ownerId: 'gone', storage, recovery })).resolves.toBeUndefined()
  })
})
