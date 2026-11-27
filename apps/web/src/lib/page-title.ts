import { FLV_COPY } from './flv-copy.ts'
import { LANDING_SEO } from './landing-copy.ts'

/** What each page is called, for its tab title and for screen readers. */
const LABELS: Record<string, string> = {
  // The landing ('/' with its slash trimmed): what people search for first.
  '': LANDING_SEO.label,
  '/create': 'Create',
  '/studio': FLV_COPY.myStudio,
  '/sign-in': FLV_COPY.login,
  '/privacy': 'Privacy',
  '/terms': 'Terms of use',
  '/account-deleted': 'Account deleted',
  '/vote': 'Vote',
  '/ranking': 'Ranking',
  '/soon': 'Coming soon',
}

export function pageTitle({ label }: { label?: string | null } = {}) {
  return label ? `${label} · ${FLV_COPY.brand}` : FLV_COPY.brand
}

/**
 * The page's name, or null for a shared design, whose title is the
 * design's own and is set by that page.
 */
export function routeLabel({ pathname }: { pathname: string }) {
  if (pathname.startsWith('/look/')) {
    return 'Look'
  }

  const key = pathname.replace(/\/$/, '')

  if (Object.hasOwn(LABELS, key)) {
    return LABELS[key]
  }

  // Profiles and shared designs name themselves once they load.
  if (pathname.startsWith('/s/') || pathname.startsWith('/u/')) {
    return null
  }

  return 'Page not found'
}

export function ownsPageTitle({ pathname }: { pathname: string }) {
  return pathname.startsWith('/s/')
}
