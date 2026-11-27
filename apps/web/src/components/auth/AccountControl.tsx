import { Link, useLocation } from '@tanstack/react-router'

import { signOut, useSessionStore } from '../../lib/auth/session-store'
import { getSupabaseClient } from '../../lib/auth/supabase-client'
import { useEditorStore } from '../../lib/editor-store'
import { FLV_COPY } from '../../lib/flv-copy'
import { navLinkClass } from '../../lib/nav-link-class'
import { MENU_LINK_CLASS, menuLinkClass } from '../site/SiteMenu'

/**
 * Sign in, or My Studio and Sign out. `menu` lays them out as the phone
 * header menu's rows instead of the header bar's.
 */
export function AccountControl({
  studioActive = false,
  variant = 'bar',
}: { studioActive?: boolean; variant?: 'bar' | 'menu' } = {}) {
  const menu = variant === 'menu'
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
        className={menu ? MENU_LINK_CLASS : 'inline-flex min-h-11 items-center px-1 font-body text-sm text-flv-muted hover:text-flv-accent'}
      >
        Sign in
      </Link>
    )
  }

  return (
    <div className={menu ? 'flex flex-col font-body text-sm' : 'flex items-center gap-2 font-body text-sm'}>
      {/*
        Exact: the router otherwise counts /studio?new=true (Create's page) as
        this link's too and adds its own aria-current, marking two tabs.
      */}
      <Link
        to="/studio"
        activeOptions={{ exact: true }}
        aria-current={studioActive ? 'page' : undefined}
        className={menu ? menuLinkClass({ current: studioActive }) : navLinkClass({ active: studioActive })}
      >
        {FLV_COPY.myStudio}
      </Link>
      <span
        className={menu ? 'truncate px-3 py-1 text-xs text-flv-muted' : 'hidden max-w-40 truncate text-xs text-flv-muted sm:inline'}
        title={email ?? undefined}
      >
        {email}
      </span>
      <button
        type="button"
        className={menu ? MENU_LINK_CLASS : 'inline-flex min-h-11 items-center px-1 text-flv-muted hover:text-flv-accent'}
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
