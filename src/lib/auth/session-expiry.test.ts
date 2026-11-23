import { describe, expect, test } from 'vitest'

import { sessionExpiredOnStudio } from './session-expiry'

describe('session expiry on the studio', () => {
  test('only a session that was signed in and then ended is sent to sign-in', () => {
    expect(sessionExpiredOnStudio({ authRequired: true, wasSignedIn: true, status: 'signed-out' })).toBe(true)
    expect(sessionExpiredOnStudio({ authRequired: true, wasSignedIn: true, status: 'unavailable' })).toBe(true)
    expect(sessionExpiredOnStudio({ authRequired: true, wasSignedIn: true, status: 'loading' })).toBe(false)
    expect(sessionExpiredOnStudio({ authRequired: true, wasSignedIn: false, status: 'signed-out' })).toBe(false)
    expect(sessionExpiredOnStudio({ authRequired: false, wasSignedIn: true, status: 'signed-out' })).toBe(false)
  })
})
