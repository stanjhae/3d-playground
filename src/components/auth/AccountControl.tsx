import { Link, useLocation } from '@tanstack/react-router'

import { signOut, useSessionStore } from '../../lib/auth/session-store'
import { getSupabaseClient } from '../../lib/auth/supabase-client'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { navLinkClass } from '../../lib/nav-link-class'

export function AccountControl({ studioActive = false }: { studioActive?: boolean } = {}) {
  const status = useSessionStore((state) => state.status)
  const email = useSessionStore((state) => state.account?.email)
  const location = useLocation()

  if (status === 'unavailable' || status === 'loading') {
    return null
  }

  if (status === 'signed-out') {
    return location.pathname === '/sign-in' ? null : (
      <Link
        to="/sign-in"
        search={{ returnTo: location.href }}
        className="inline-flex min-h-11 items-center px-1 font-body text-sm text-flv-muted hover:text-flv-accent"
      >
        Sign in
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2 font-body text-sm">
      <Link to="/studio" aria-current={studioActive ? 'page' : undefined} className={navLinkClass({ active: studioActive })}>
        {FLV_COPY.myStudio}
      </Link>
      <span className="hidden max-w-40 truncate text-xs text-flv-muted sm:inline" title={email ?? undefined}>
        {email}
      </span>
      <button
        type="button"
        className="inline-flex min-h-11 items-center px-1 text-flv-muted hover:text-flv-accent"
        onClick={() => {
          void signOut({ client: getSupabaseClient() }).then(() => {
            // An explicit sign-out leaves nothing private on screen for the
            // next person at this browser.
            useEditorStore.getState().reset()
          })
        }}
      >
        Sign out
      </button>
    </div>
  )
}
