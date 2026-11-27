/**
 * The terms of use in force (P1). `/terms` shows them; an account that has
 * not accepted this version is asked once, before My Studio or the studio
 * opens (`src/components/auth/TermsGate.tsx`). The server records only this
 * version (`POST /api/flp/terms`).
 *
 * Changing the terms: edit `src/routes/terms.tsx`, then set a new version
 * here (the date it takes effect). Every account is then asked again.
 */
export const TERMS_VERSION = '2026-11-11'

/** Shown on `/terms`, as "Last updated". */
export const TERMS_UPDATED = '11 November 2026'

/** True when the stored acceptance covers the terms in force. */
export function termsAccepted({ version }: { version: string | null | undefined }) {
  return version === TERMS_VERSION
}
