import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useMatch,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { activeNav } from '../lib/active-nav'
import { navLinkClass } from '../lib/nav-link-class'
import { AccountControl } from '../components/auth/AccountControl'
import { BrandMark, LandingHeader, MENU_LINK_CLASS } from '../components/site/LandingHeader'
import { SiteFooter } from '../components/site/SiteFooter'
import { SiteMenu, menuLinkClass } from '../components/site/SiteMenu'
import { onAccountChange, startSession, useSessionStore } from '../lib/auth/session-store'
import { AUTH_REQUIRED, authConfigured, getSupabaseClient } from '../lib/auth/supabase-client'
import { useEditorStore } from '../lib/editor-store'
import { listDesigns } from '../lib/designs-api'
import { listSnapshots } from '../lib/design-snapshots'
import { FLV_COPY } from '../lib/flv-copy'
import { ownsPageTitle, pageTitle, routeLabel } from '../lib/page-title'
import { HOUSE_LOOK_FALLBACK_ID, lookIdFromPathname } from '../lib/paths'
import { rankDesigns } from '../lib/rank-designs'
import { releaseStaticShell } from '../lib/static-shell'

export const Route = createRootRoute({
  component: RootShell,
})

let lastSignedInUserId: string | null = null

// A different account must never see the previous account's open design.
// Expiry (account → null) keeps it in memory for same-account re-sign-in.
onAccountChange((next) => {
  if (next && lastSignedInUserId && next.userId !== lastSignedInUserId) {
    useEditorStore.getState().reset()
  }

  // Snapshots are kept per account (#147): show this account's, or the
  // guest's after signing out.
  useEditorStore.setState({ snapshots: listSnapshots({ ownerId: next?.userId ?? null }) })

  if (next) {
    lastSignedInUserId = next.userId
  }
})

/**
 * The studio fills the window, and the landing and a shared design carry
 * their own footers with these links.
 */
function showsSiteFooter({ pathname }: { pathname: string }) {
  return pathname !== '/' && pathname !== '/create' && !pathname.startsWith('/s/')
}

/** Back to your designs when signed in; otherwise a way to sign in. */
function LandingAccountLink({ className }: { className: string }) {
  const signedIn = useSessionStore((state) => state.status === 'signed-in')

  if (signedIn) {
    return (
      <Link to="/studio" className={className}>
        {FLV_COPY.myStudio}
      </Link>
    )
  }

  return authConfigured() ? (
    <Link to="/sign-in" search={{ returnTo: '/studio' }} className={className}>
      {FLV_COPY.login}
    </Link>
  ) : null
}

function RootShell() {
  const lookMatch = useMatch({
    from: '/look/$lookId',
    shouldThrow: false,
  })
  const location = useLocation()
  const [leaderId, setLeaderId] = useState<string | null>(null)
  const lookId =
    lookMatch?.params.lookId ??
    lookIdFromPathname({ pathname: location.pathname }) ??
    leaderId
  const isLanding = location.pathname === '/'
  // The studio is a workspace: its own slim bar replaces the site header,
  // so the garment and the tools get the whole screen (studio mode, 26 Nov).
  const isStudio = location.pathname === '/create'
  const tab = activeNav({ pathname: location.pathname, search: location.search as Record<string, unknown> })
  const main = useRef<HTMLElement | null>(null)
  // The page actually on screen, unlike `location`, which moves first.
  const shownPath = useRouterState({ select: (state) => state.resolvedLocation?.pathname })
  const previousPath = useRef(shownPath)

  useEffect(() => {
    // The prerendered landing only ever stands in for the landing.
    if (shownPath && shownPath !== '/') {
      releaseStaticShell()
    }

    if (shownPath && !ownsPageTitle({ pathname: shownPath })) {
      document.title = pageTitle({ label: routeLabel({ pathname: shownPath }) })
    }

    const firstPage = previousPath.current === undefined
    const changed = previousPath.current !== shownPath
    previousPath.current = shownPath

    if (firstPage || !changed) {
      return
    }

    // A new page starts reading at its content, unless it already chose
    // where to put focus, as sign-in does with its first field.
    const active = document.activeElement

    if (!main.current?.contains(active) || active === main.current) {
      main.current?.focus({ preventScroll: true })
    }
  }, [shownPath])

  useEffect(() => {
    void startSession({ client: getSupabaseClient() })
  }, [])

  useEffect(() => {
    // The guest leaderboard only feeds the guest Look link (F09 #144).
    if (AUTH_REQUIRED) {
      return
    }

    let cancelled = false

    void listDesigns()
      .then((designs) => {
        if (!cancelled) {
          setLeaderId(rankDesigns({ designs })[0]?.id ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderId(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flv flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="flv-cta sr-only rounded-full px-4 py-2 font-body text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        // Without changing the URL, which the router would treat as a move.
        onClick={(event) => {
          event.preventDefault()
          main.current?.focus()
        }}
      >
        Skip to content
      </a>
      {isLanding ? (
        <LandingHeader
          mode="live"
          home={
            <Link to="/" search={{}} className="flex shrink-0 items-center gap-2.5 text-flv-ink">
              <BrandMark />
            </Link>
          }
          account={<LandingAccountLink className="hidden min-h-11 items-center px-1 font-body text-sm text-flv-muted hover:text-flv-ink md:inline-flex" />}
          menuAccount={<LandingAccountLink className={MENU_LINK_CLASS} />}
        />
      ) : isStudio ? null : (
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-flv-line bg-flv-paper/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-flv-ink backdrop-blur-sm sm:px-6 sm:pt-4 sm:pb-4">
          <Link to="/" search={{}} className="flex shrink-0 items-center gap-2.5 text-flv-ink">
            <BrandMark />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <nav aria-label="Site" className="flex items-center gap-2 font-body text-sm md:gap-4">
              {/*
                On a phone Create, Vote and Ranking stay in the bar; Home, Look
                and the account move to the menu beside it, so nothing is pushed
                off a 375 px screen.
              */}
              <span className="hidden md:contents">
                <NavLink to="/" label="Home" active={tab === 'home'} />
              </span>
              <NavLink to="/create" label="Create" active={tab === 'create'} />
              {/* Voting is the point: Vote (find designs) and Ranking (the top ones) are in the main nav in every build. */}
              <NavLink to="/vote" label="Vote" active={tab === 'vote'} />
              <NavLink to="/ranking" label="Ranking" active={tab === 'ranking'} />
              {AUTH_REQUIRED ? null : (
                <span className="hidden md:contents">
                  <LookLink lookId={lookId} active={tab === 'look'} className={navLinkClass({ active: tab === 'look' })} />
                </span>
              )}
              <span className="hidden md:contents">
                <AccountControl studioActive={tab === 'studio'} />
              </span>
            </nav>
            <SiteMenu hideFrom="md" label="More">
              <Link
                to="/"
                search={{}}
                aria-current={tab === 'home' ? 'page' : undefined}
                className={menuLinkClass({ current: tab === 'home' })}
              >
                Home
              </Link>
              {AUTH_REQUIRED ? null : (
                <LookLink lookId={lookId} active={tab === 'look'} className={menuLinkClass({ current: tab === 'look' })} />
              )}
              <AccountControl studioActive={tab === 'studio'} variant="menu" />
            </SiteMenu>
          </div>
        </header>
      )}
      <main
        ref={main}
        id="main-content"
        tabIndex={-1}
        data-focus-target
        className="relative flex-1 bg-flv-paper text-flv-ink"
      >
        <Outlet />
      </main>
      {showsSiteFooter({ pathname: location.pathname }) ? <SiteFooter /> : null}
    </div>
  )
}

function LookLink({ lookId, active, className }: { lookId: string | null; active: boolean; className: string }) {
  return (
    <Link
      to="/look/$lookId"
      params={{ lookId: lookId ?? HOUSE_LOOK_FALLBACK_ID }}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      Look
    </Link>
  )
}

function NavLink({
  to,
  label,
  active,
}: {
  to: '/' | '/create' | '/vote' | '/ranking'
  label: string
  active: boolean
}) {
  return (
    <Link to={to} search={{}} aria-current={active ? 'page' : undefined} className={navLinkClass({ active })}>
      {label}
    </Link>
  )
}
