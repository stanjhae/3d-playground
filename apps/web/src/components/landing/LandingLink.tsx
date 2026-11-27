import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { useSessionStore } from '../../lib/auth/session-store'
import { cn } from '../../lib/cn'
import { handOffLandingDesign } from '../../lib/landing-demo-store'
import { buttonClass } from '../ui/Button'

export type LandingMode = 'static' | 'live'

/**
 * Start creating, everywhere on the landing. Signed out, it opens the
 * studio and the hero sketch comes along; sign-in waits until save or
 * publish. Signed in, it starts a new design in My Studio. In the
 * prerendered page it is a plain link, so it works before scripts.
 */
export function CreateCta({
  mode,
  children,
  className,
  size = 'lg',
}: {
  mode: LandingMode
  children: ReactNode
  className?: string
  size?: 'md' | 'lg'
}) {
  const classes = cn(
    buttonClass(),
    'flv-cta-sheen group relative overflow-hidden',
    { 'min-h-14 px-7 text-base': size === 'lg' },
    className,
  )

  return (
    <CreateLink mode={mode} className={classes} data-cta="create">
      <span>{children}</span>
      <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
    </CreateLink>
  )
}

/**
 * The unstyled Start creating link, so every landing entry (hero, final
 * call, footer) lands in the same place: Create with no sign-up when
 * signed out, a new design in My Studio when signed in.
 */
export function CreateLink({
  mode,
  className,
  children,
  'data-cta': dataCta,
}: {
  mode: LandingMode
  className?: string
  children: ReactNode
  'data-cta'?: string
}) {
  const signedIn = useSessionStore((state) => state.status === 'signed-in')

  if (!signedIn) {
    if (mode === 'static') {
      return (
        <a href="/create" className={className} data-cta={dataCta}>
          {children}
        </a>
      )
    }

    return (
      <Link
        to="/create"
        viewTransition
        className={className}
        data-cta={dataCta}
        onClick={() => {
          handOffLandingDesign()
        }}
      >
        {children}
      </Link>
    )
  }

  if (mode === 'static') {
    return (
      <a href="/studio?new=true" className={className} data-cta={dataCta}>
        {children}
      </a>
    )
  }

  return (
    <Link
      to="/studio"
      // Start creating opens Create (a new design), not the saved-designs library.
      search={{ new: true }}
      viewTransition
      className={className}
      data-cta={dataCta}
      onClick={() => {
        handOffLandingDesign()
      }}
    >
      {children}
    </Link>
  )
}

/** A link to another page of the site: a router link live, a plain one static. */
export function SiteLink({
  mode,
  to,
  className,
  children,
}: {
  mode: LandingMode
  to: '/privacy' | '/terms'
  className?: string
  children: ReactNode
}) {
  return mode === 'static' ? (
    <a href={to} className={className}>
      {children}
    </a>
  ) : (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}
