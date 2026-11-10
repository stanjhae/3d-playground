import { FLV_COPY } from './flv-copy.ts'

/** What each page is called, for its tab title and for screen readers. */
const LABELS: Record<string, string> = {
  '/create': 'Create',
  '/studio': FLV_COPY.myStudio,
  '/sign-in': FLV_COPY.login,
  '/privacy': 'Privacy',
  '/terms': 'Terms of use',
  '/account-deleted': 'Account deleted',
  '/vote': 'Vote',
  '/soon': 'Coming soon',
}

export function pageTitle({ label }: { label?: string | null } = {}) {
  return label ? `${label} · ${FLV_COPY.brand}` : FLV_COPY.brand
}

/**
 * The page's name, or null for the landing and for a shared design, whose
 * title is the design's own and is set by that page.
 */
export function routeLabel({ pathname }: { pathname: string }) {
  if (pathname.startsWith('/look/')) {
    return 'Look'
  }

  return LABELS[pathname.replace(/\/$/, '')] ?? null
}

export function ownsPageTitle({ pathname }: { pathname: string }) {
  return pathname.startsWith('/s/')
}
