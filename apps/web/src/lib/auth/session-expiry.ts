import type { SessionStatus } from './session-store'

/**
 * A studio that was signed in, then lost the session, must go to sign-in.
 * A visitor who was never signed in stays. `loading` is not an expiry.
 */
export function sessionExpiredOnStudio({
  authRequired,
  wasSignedIn,
  status,
}: {
  authRequired: boolean
  wasSignedIn: boolean
  status: SessionStatus
}) {
  return authRequired && wasSignedIn && (status === 'signed-out' || status === 'unavailable')
}
