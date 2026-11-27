/**
 * The prerendered landing (`#flv-static`, written by
 * scripts/prerender-landing.mjs) sits in front of the app's `#root`, which
 * CSS hides while it is there. The app removes it once the live landing has
 * mounted, or straight away on any other page or on an app error, so
 * nothing is ever hidden behind it.
 */
export const STATIC_LANDING_ID = 'flv-static'

/** Removes the prerendered landing; true when there was one. */
export function releaseStaticShell() {
  if (typeof document === 'undefined') {
    return false
  }

  const element = document.getElementById(STATIC_LANDING_ID)

  if (!element) {
    return false
  }

  element.remove()
  return true
}
