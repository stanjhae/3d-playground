import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { handOffLandingDesign } from '../../lib/landing-demo-store'
import { buttonClass } from '../ui/Button'

export type LandingMode = 'static' | 'live'

/**
 * Start creating, everywhere on the landing. Signed out, My Studio sends
 * people through sign-in and back; a sketch made in the hero goes with them.
 * In the prerendered page it is a plain link, so it works before scripts.
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
  const body = (
    <>
      <span>{children}</span>
      <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
    </>
  )

  if (mode === 'static') {
    return (
      <a href="/studio" className={classes} data-cta="create">
        {body}
      </a>
    )
  }

  return (
    <Link
      to="/studio"
      viewTransition
      className={classes}
      data-cta="create"
      onClick={() => {
        handOffLandingDesign()
      }}
    >
      {body}
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
  to: '/privacy' | '/terms' | '/studio'
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
