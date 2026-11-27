import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import { AUTH_REQUIRED, authConfigured } from '../../lib/auth/supabase-client'
import { useSessionStore } from '../../lib/auth/session-store'
import { FLV_COPY } from '../../lib/flv-copy'

const EXIT_CLASS =
  'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full pr-2 pl-1 text-flv-ink hover:bg-flv-soft focus-visible:bg-flv-soft'

function ExitMark() {
  return (
    <>
      <ChevronLeft aria-hidden className="size-5 text-flv-muted" />
      <img src="/brand/flv-mark.svg" alt="" width={41} height={22} className="block h-5.5 w-auto max-sm:hidden" />
    </>
  )
}

/**
 * The studio's one way out (studio mode, 26 Nov). The site header is not
 * shown in the studio, so every pixel goes to designing; this takes the
 * place of its links. Signed in: back to My Studio. Signed out where
 * accounts are needed: Sign in, then back here, so the sketch carries on.
 * Otherwise home. Work is saved as it goes, so leaving loses nothing.
 */
export function StudioExit() {
  const status = useSessionStore((state) => state.status)

  if (status === 'signed-in') {
    const label = `Back to ${FLV_COPY.myStudio}`
    return (
      <Link to="/studio" search={{}} aria-label={label} title={label} className={EXIT_CLASS}>
        <ExitMark />
      </Link>
    )
  }

  if (AUTH_REQUIRED && authConfigured() && status === 'signed-out') {
    return (
      <Link to="/sign-in" search={{ returnTo: '/create' }} title={FLV_COPY.login} className={EXIT_CLASS}>
        <ExitMark />
        <span className="font-body text-sm">{FLV_COPY.login}</span>
      </Link>
    )
  }

  return (
    <Link to="/" search={{}} aria-label="Back to home" title="Back to home" className={EXIT_CLASS}>
      <ExitMark />
    </Link>
  )
}
